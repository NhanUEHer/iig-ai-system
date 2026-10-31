const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const speechSdk = require('microsoft-cognitiveservices-speech-sdk');

const execFileAsync = promisify(execFile);
const SDK_VERSION = require('microsoft-cognitiveservices-speech-sdk/package.json').version;
const RAW_SCHEMA_VERSION = 'azure-rta-raw-v1';
const RESULT_SCHEMA_VERSION = 1;

class AzureRtaAssessmentError extends Error {
  constructor(message, code, { retryable = true, cause = null } = {}) {
    super(message);
    this.name = 'AzureRtaAssessmentError';
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
  }
}

function text(value) {
  return String(value || '').normalize('NFKC').trim();
}

function required(value, message, code) {
  const normalized = text(value);
  if (!normalized) throw new AzureRtaAssessmentError(message, code, { retryable: false });
  return normalized;
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values) {
  const numbers = values.map(finiteNumber).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function bestHypothesis(segment) {
  return Array.isArray(segment?.NBest) && segment.NBest[0] ? segment.NBest[0] : {};
}

function transcriptFromSegments(segments) {
  return segments
    .map(segment => text(bestHypothesis(segment).Display || segment.DisplayText))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildProviderResult({ segments, latencyMs, providerRunId = null }) {
  const transcript = transcriptFromSegments(segments);
  const confidence = mean(segments.map(segment => bestHypothesis(segment).Confidence));
  const success = Boolean(transcript);
  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    status: success ? 'SUCCESS' : 'NO_SPEECH',
    transcript,
    detectedLanguage: success ? 'en' : null,
    speechDetected: success,
    confidence,
    flags: [],
  };
  const rawOutput = {
    schemaVersion: RAW_SCHEMA_VERSION,
    provider: 'azure-ai-speech',
    sdkVersion: SDK_VERSION,
    mode: 'SCRIPTED_CONTINUOUS',
    locale: 'en-US',
    gradingSystem: 'HundredMark',
    granularity: 'Phoneme',
    prosodyEnabled: true,
    enableMiscue: false,
    segmentCount: segments.length,
    segments,
  };
  return {
    provider: 'azure-ai-speech',
    providerRunId,
    taskId: null,
    workflowStatus: success ? 'succeeded' : 'no_speech',
    result,
    outcome: {
      action: success ? 'CONTINUE' : 'INVALID_AUDIO',
      retryable: false,
      terminal: true,
    },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      elapsedTime: Math.max(0, Number(latencyMs) || 0) / 1000,
      totalPrice: null,
      currency: null,
    },
    rawOutput,
    parsedOutput: {
      ...result,
      evidence: {
        rawSchemaVersion: RAW_SCHEMA_VERSION,
        segmentCount: segments.length,
      },
    },
  };
}

async function convertToAzureWav(audioBuffer, wavPath, dependencies = {}) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new AzureRtaAssessmentError(
      'Azure RTA assessment requires a non-empty audio buffer.',
      'IIG_AI_RTA_AUDIO_MISSING',
      { retryable: false }
    );
  }
  const sourcePath = `${wavPath}.source`;
  await fsp.writeFile(sourcePath, audioBuffer);
  const run = dependencies.execFileAsync || execFileAsync;
  try {
    await run(dependencies.ffmpegPath || 'ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', sourcePath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'pcm_s16le',
      wavPath,
    ]);
  } catch (cause) {
    throw new AzureRtaAssessmentError(
      'FFmpeg could not normalize the RTA audio for Azure Speech.',
      'IIG_AI_RTA_AUDIO_NORMALIZATION_FAILED',
      { retryable: false, cause }
    );
  } finally {
    await fsp.rm(sourcePath, { force: true });
  }
}

function recognizeContinuous({ wavPath, referenceText, key, region, timeoutMs, sdk = speechSdk }) {
  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = 'en-US';
    speechConfig.outputFormat = sdk.OutputFormat.Detailed;
    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceResponse_RequestWordLevelTimestamps,
      'true'
    );
    const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(wavPath));
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    const assessment = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      false
    );
    assessment.enableProsodyAssessment = true;
    assessment.applyTo(recognizer);

    const segments = [];
    let providerRunId = null;
    let settled = false;
    const timeout = setTimeout(() => finish(new AzureRtaAssessmentError(
      `Azure RTA assessment timed out after ${timeoutMs} ms.`,
      'IIG_AI_RTA_AZURE_TIMEOUT'
    )), timeoutMs);

    function close() {
      clearTimeout(timeout);
      recognizer.close();
      audioConfig.close?.();
      speechConfig.close?.();
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      recognizer.stopContinuousRecognitionAsync(() => {
        close();
        if (error) reject(error);
        else resolve({ segments, providerRunId });
      }, stopError => {
        close();
        reject(error || new AzureRtaAssessmentError(
          `Azure RTA recognition could not stop: ${stopError}`,
          'IIG_AI_RTA_AZURE_STOP_FAILED'
        ));
      });
    }

    recognizer.sessionStarted = (_sender, event) => {
      providerRunId = event.sessionId || providerRunId;
    };
    recognizer.recognized = (_sender, event) => {
      if (event.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
      const raw = event.result.properties.getProperty(
        sdk.PropertyId.SpeechServiceResponse_JsonResult
      );
      if (!raw) return;
      try {
        segments.push(JSON.parse(raw));
      } catch (cause) {
        finish(new AzureRtaAssessmentError(
          'Azure Speech returned malformed detailed JSON.',
          'IIG_AI_RTA_AZURE_RESPONSE_INVALID',
          { retryable: true, cause }
        ));
      }
    };
    recognizer.canceled = (_sender, event) => {
      const details = sdk.CancellationDetails.fromResult(event.result);
      finish(new AzureRtaAssessmentError(
        `Azure RTA recognition canceled: ${details.errorDetails || details.reason}.`,
        'IIG_AI_RTA_AZURE_CANCELED',
        { retryable: true }
      ));
    };
    recognizer.sessionStopped = () => finish();
    recognizer.startContinuousRecognitionAsync(
      () => {},
      error => finish(new AzureRtaAssessmentError(
        `Azure RTA recognition could not start: ${error}`,
        'IIG_AI_RTA_AZURE_START_FAILED',
        { retryable: true }
      ))
    );
  });
}

async function assess({ audioBuffer, referenceText, key, region, timeoutMs = 120_000 }, dependencies = {}) {
  const normalizedReference = required(
    referenceText,
    'Azure RTA assessment requires the official reference passage.',
    'IIG_AI_RTA_REFERENCE_MISSING'
  );
  const subscriptionKey = required(
    key,
    'Azure Speech key is not configured.',
    'IIG_AI_RTA_AZURE_CONFIG_MISSING'
  );
  const speechRegion = required(
    region,
    'Azure Speech region is not configured.',
    'IIG_AI_RTA_AZURE_CONFIG_MISSING'
  );
  const tempDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'iig-azure-rta-'));
  const wavPath = path.join(tempDirectory, 'candidate-16khz-mono.wav');
  try {
    await convertToAzureWav(audioBuffer, wavPath, dependencies);
    const startedAt = Date.now();
    const recognition = await (dependencies.recognizeContinuous || recognizeContinuous)({
      wavPath,
      referenceText: normalizedReference,
      key: subscriptionKey,
      region: speechRegion,
      timeoutMs,
      sdk: dependencies.sdk || speechSdk,
    });
    return buildProviderResult({
      segments: recognition.segments,
      providerRunId: recognition.providerRunId,
      latencyMs: Date.now() - startedAt,
    });
  } finally {
    await fsp.rm(tempDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  SDK_VERSION,
  RAW_SCHEMA_VERSION,
  AzureRtaAssessmentError,
  transcriptFromSegments,
  buildProviderResult,
  convertToAzureWav,
  recognizeContinuous,
  assess,
};
