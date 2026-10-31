const axios = require('axios');

const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_024;
const DEFAULT_THINKING_BUDGET = 0;
const DEFAULT_MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function providerError(error) {
  const status = Number(error?.response?.status || 0);
  const providerMessage = error?.response?.data?.error?.message;
  const message = providerMessage || error?.message || 'Gemini question transcription failed.';
  const retryable = !status || status === 408 || status === 429 || status >= 500;
  return Object.assign(new Error(message), {
    code: status === 401 || status === 403
      ? 'GEMINI_QUESTION_STT_AUTH_FAILED'
      : 'GEMINI_QUESTION_STT_FAILED',
    retryable,
    status,
    cause: error,
  });
}

function transcriptFromResponse(data) {
  return (data?.candidates || [])
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => part?.text)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function buildPrompt(contextText) {
  const context = String(contextText || '').trim();
  return [
    'Transcribe only the spoken question in the attached audio.',
    'The target language is English.',
    'Return only the raw transcript. Do not answer the question and do not add explanations or markdown.',
    'Preserve actual omissions, substitutions, repetitions, and fillers. Ignore silence and non-speech noise.',
    'Use the following context only to resolve names or ambiguous words. Never include the context itself in the transcript.',
    context ? `Context: ${context}` : 'Context: none provided.',
  ].join('\n');
}

async function transcribeQuestion({
  apiKey,
  audioBuffer,
  mimeType = 'audio/mpeg',
  contextText = '',
  model = DEFAULT_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  thinkingBudget = DEFAULT_THINKING_BUDGET,
  maxAudioBytes = DEFAULT_MAX_AUDIO_BYTES,
  http = axios,
}) {
  if (!String(apiKey || '').trim()) {
    throw Object.assign(new Error('Gemini question STT API key is not configured.'), {
      code: 'GEMINI_QUESTION_STT_KEY_MISSING', retryable: false,
    });
  }
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw Object.assign(new Error('Question audio is empty.'), {
      code: 'IIG_STT_AUDIO_EMPTY', retryable: false,
    });
  }
  const byteLimit = positiveInteger(maxAudioBytes, DEFAULT_MAX_AUDIO_BYTES);
  if (audioBuffer.length > byteLimit) {
    throw Object.assign(new Error(`Question audio exceeds the ${byteLimit}-byte Gemini limit.`), {
      code: 'GEMINI_QUESTION_STT_AUDIO_TOO_LARGE', retryable: false,
    });
  }

  const selectedModel = String(model || DEFAULT_MODEL).trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`;
  try {
    const response = await http.post(url, {
      contents: [{
        role: 'user',
        parts: [
          { text: buildPrompt(contextText) },
          {
            inlineData: {
              mimeType: String(mimeType || 'audio/mpeg'),
              data: audioBuffer.toString('base64'),
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: positiveInteger(maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS),
        thinkingConfig: {
          thinkingBudget: Math.max(0, Number.parseInt(thinkingBudget, 10) || 0),
        },
      },
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': String(apiKey).trim(),
      },
      timeout: positiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS),
      maxBodyLength: Infinity,
    });
    return {
      transcript: transcriptFromResponse(response.data),
      metadata: {
        provider: 'gemini',
        model: selectedModel,
        usage: response.data?.usageMetadata || {},
        finishReason: response.data?.candidates?.[0]?.finishReason || null,
      },
    };
  } catch (error) {
    throw providerError(error);
  }
}

module.exports = {
  DEFAULT_MODEL,
  buildPrompt,
  transcriptFromResponse,
  transcribeQuestion,
};
