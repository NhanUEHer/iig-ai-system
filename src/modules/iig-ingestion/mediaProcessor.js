const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const axios = require('axios');
const iigClient = require('../../clients/iigClient');
const storageService = require('../../services/storageService');
const audioCleaner = require('../../services/audioCleanerService');

const AUDIO_ROLES = new Set(['QUESTION_AUDIO', 'CONTEXT_AUDIO', 'STUDENT_AUDIO']);
const IMAGE_ROLES = new Set(['QUESTION_IMAGE', 'CONTEXT_IMAGE']);
const MAX_MEDIA_BYTES = 75 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 10 * 60;
const NETWORK_RETRY_DELAYS_MS = Object.freeze([250, 1000]);
const DNS_ERROR_CODES = new Set(['EAI_AGAIN', 'ENOTFOUND']);
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  ...DNS_ERROR_CODES,
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
]);

class MediaProcessingError extends Error {
  constructor(message, code, retryable = true) {
    super(message);
    this.name = 'MediaProcessingError';
    this.code = code;
    this.retryable = retryable;
  }
}

function allowedHosts() {
  return new Set(String(process.env.IIG_MEDIA_ALLOWED_HOSTS || [
    'elearningapi.iigvietnam.com',
    'els3.iigvietnam.com',
    'han02.vstorage.vngcloud.vn',
  ].join(','))
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
}

function validateSourceUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MediaProcessingError('IIG returned an invalid media URL.', 'IIG_MEDIA_URL_INVALID', false);
  }
  if (url.protocol !== 'https:' || !allowedHosts().has(url.hostname.toLowerCase())) {
    throw new MediaProcessingError('IIG media URL is outside the trusted host allowlist.', 'IIG_MEDIA_URL_UNTRUSTED', false);
  }
  return url.toString();
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rootErrorCode(cause) {
  return String(cause?.code || cause?.cause?.code || '').trim().toUpperCase();
}

function networkFailure(cause) {
  const code = rootErrorCode(cause);
  const detail = String([
    cause?.message,
    cause?.stderr,
    cause?.cause?.message,
  ].filter(Boolean).join(' ')).toLowerCase();
  const dnsMessage = /temporary failure in name resolution|getaddrinfo.*(?:eai_again|enotfound)/.test(detail);
  const timeoutMessage = /connection timed out|operation timed out|network timeout/.test(detail);
  const genericNetworkMessage = /network is unreachable|connection reset|connection refused/.test(detail);
  if (!TRANSIENT_NETWORK_ERROR_CODES.has(code)
      && !dnsMessage && !timeoutMessage && !genericNetworkMessage) return null;
  if (DNS_ERROR_CODES.has(code) || dnsMessage) {
    return {
      code: code === 'EAI_AGAIN' || /temporary|eai_again/.test(detail)
        ? 'IIG_MEDIA_DNS_TEMPORARY'
        : 'IIG_MEDIA_DNS_NOT_FOUND',
      message: 'IIG media DNS resolution failed.',
    };
  }
  if (code === 'ETIMEDOUT' || timeoutMessage) {
    return { code: 'IIG_MEDIA_NETWORK_TIMEOUT', message: 'IIG media network request timed out.' };
  }
  return { code: 'IIG_MEDIA_NETWORK_FAILURE', message: 'IIG media network request failed.' };
}

async function withNetworkRetry(operation, dependencies = {}) {
  const wait = dependencies.wait || delay;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (cause) {
      if (!networkFailure(cause) || attempt >= NETWORK_RETRY_DELAYS_MS.length) throw cause;
      await wait(NETWORK_RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function requestWithNetworkRetry(request, url, options, dependencies = {}) {
  return withNetworkRetry(() => request(url, options), dependencies);
}

async function resolveTrustedRedirects(value, dependencies = {}, redirects = 0) {
  if (redirects > 5) {
    throw new MediaProcessingError('IIG media exceeded the redirect limit.', 'IIG_MEDIA_REDIRECT_LIMIT', false);
  }
  const url = validateSourceUrl(value);
  const request = dependencies.request || axios.get;
  const response = await requestWithNetworkRetry(request, url, {
    responseType: 'stream', timeout: 60_000, maxRedirects: 0,
    validateStatus: status => status >= 200 && status < 400,
  }, dependencies);
  if ([301, 302, 303, 307, 308].includes(Number(response.status))) {
    response.data?.destroy?.();
    const location = response.headers?.location;
    if (!location) {
      throw new MediaProcessingError('IIG media redirect has no location.', 'IIG_MEDIA_REDIRECT_INVALID', false);
    }
    return resolveTrustedRedirects(new URL(location, url).toString(), dependencies, redirects + 1);
  }
  response.data?.destroy?.();
  return url;
}

async function downloadToFile(value, destination, dependencies = {}, redirects = 0) {
  if (redirects > 5) {
    throw new MediaProcessingError('IIG media exceeded the redirect limit.', 'IIG_MEDIA_REDIRECT_LIMIT', false);
  }
  const url = validateSourceUrl(value);
  const request = dependencies.request || axios.get;
  const response = await requestWithNetworkRetry(request, url, {
    responseType: 'stream',
    timeout: 60_000,
    maxContentLength: MAX_MEDIA_BYTES,
    maxBodyLength: MAX_MEDIA_BYTES,
    maxRedirects: 0,
    validateStatus: status => status >= 200 && status < 400,
  }, dependencies);
  if ([301, 302, 303, 307, 308].includes(Number(response.status))) {
    response.data?.destroy?.();
    const location = response.headers?.location;
    if (!location) {
      throw new MediaProcessingError('IIG media redirect has no location.', 'IIG_MEDIA_REDIRECT_INVALID', false);
    }
    return downloadToFile(new URL(location, url).toString(), destination, dependencies, redirects + 1);
  }
  const contentLength = Number(response.headers['content-length'] || 0);
  if (contentLength > MAX_MEDIA_BYTES) {
    response.data.destroy();
    throw new MediaProcessingError('IIG media exceeds the 75 MB limit.', 'IIG_MEDIA_TOO_LARGE', false);
  }
  let received = 0;
  const output = fs.createWriteStream(destination, { flags: 'wx' });
  response.data.on('data', chunk => {
    received += chunk.length;
    if (received > MAX_MEDIA_BYTES) response.data.destroy(new Error('IIG media exceeds the 75 MB limit.'));
  });
  await new Promise((resolve, reject) => {
    response.data.pipe(output);
    response.data.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolve);
  });
  return {
    contentType: String(response.headers['content-type'] || 'application/octet-stream').split(';', 1)[0],
    size: received,
  };
}

function parseAudioMetrics(probeOutput, analysisOutput) {
  let probe = {};
  try { probe = JSON.parse(probeOutput || '{}')?.format || {}; } catch { probe = {}; }
  const duration = Number.parseFloat(probe.duration) || 0;
  const size = Number.parseInt(probe.size, 10) || 0;
  const mean = /mean_volume:\s*(-?[\d.]+)\s*dB/i.exec(analysisOutput || '');
  const max = /max_volume:\s*(-?[\d.]+)\s*dB/i.exec(analysisOutput || '');
  const silenceDurations = [...String(analysisOutput || '').matchAll(/silence_duration:\s*([\d.]+)/gi)]
    .map(match => Number.parseFloat(match[1]) || 0);
  const silenceDuration = silenceDurations.reduce((sum, value) => sum + value, 0);
  const silenceRatio = duration > 0 ? Math.min(1, silenceDuration / duration) : 1;
  return {
    durationSeconds: duration,
    fileSizeBytes: size,
    meanVolumeDb: mean ? Number.parseFloat(mean[1]) : null,
    maxVolumeDb: max ? Number.parseFloat(max[1]) : null,
    silenceDurationSeconds: silenceDuration,
    silenceRatio,
  };
}

function audioQuality(metrics) {
  if (metrics.durationSeconds < 0.25) {
    return { status: 'INVALID_AUDIO', errorCode: 'AUDIO_TOO_SHORT' };
  }
  if (metrics.silenceRatio >= 0.98 || (metrics.maxVolumeDb != null && metrics.maxVolumeDb <= -55)) {
    return { status: 'INVALID_AUDIO', errorCode: 'AUDIO_NO_SIGNAL' };
  }
  return { status: 'READY', errorCode: null };
}

function storageLocation(stored, storage) {
  if (stored.startsWith('r2:')) {
    return { provider: 'R2', bucket: storage.bucket || null, key: stored.slice(3) };
  }
  if (stored.startsWith('local:')) {
    return { provider: 'LOCAL', bucket: null, key: stored.slice(6) };
  }
  throw new MediaProcessingError('Media storage returned an unsupported locator.', 'MEDIA_STORAGE_LOCATOR_INVALID', false);
}

function mediaObjectKey(asset, extension) {
  const owner = asset.question_attempt_id ? 'attempts' : 'questions';
  const ownerId = asset.question_attempt_id || asset.exam_question_id;
  return `iig-ingestion/${owner}/${ownerId}/${asset.asset_role.toLowerCase()}-${asset.asset_index}-${asset.id}.${extension}`;
}

function sanitizedSourceLocator(asset, sourceUrl) {
  if (asset.source_file_id || asset.source_locator?.fileId) {
    return { fileId: asset.source_file_id || asset.source_locator.fileId };
  }
  const url = new URL(sourceUrl);
  url.search = '';
  url.hash = '';
  return { url: url.toString() };
}

async function resolveSourceUrl(asset, dependencies) {
  const directUrl = asset.source_locator?.url;
  if (directUrl) return validateSourceUrl(directUrl);
  const fileId = asset.source_file_id || asset.source_locator?.fileId;
  if (!fileId) {
    throw new MediaProcessingError('Media reference has neither a source URL nor file ID.', 'IIG_MEDIA_SOURCE_MISSING', false);
  }
  const url = dependencies.iig.getFileViewUrl(fileId);
  return validateSourceUrl(url);
}

async function processImage(asset, sourceUrl, dependencies, workDir) {
  const sourcePath = path.join(workDir, `source-${randomUUID()}`);
  const downloaded = await (dependencies.download || downloadToFile)(sourceUrl, sourcePath, dependencies);
  if (!downloaded.contentType.startsWith('image/')) {
    throw new MediaProcessingError('Resolved IIG image has an unsupported content type.', 'IIG_IMAGE_TYPE_INVALID', false);
  }
  const extension = downloaded.contentType === 'image/png' ? 'png'
    : downloaded.contentType === 'image/webp' ? 'webp'
      : downloaded.contentType === 'image/gif' ? 'gif' : 'jpg';
  const typedSourcePath = path.join(workDir, `source.${extension}`);
  await fsp.rename(sourcePath, typedSourcePath);
  const checksum = await sha256File(typedSourcePath);
  const key = mediaObjectKey(asset, extension);
  const stored = await dependencies.storage.uploadFile(typedSourcePath, key);
  const location = storageLocation(stored, dependencies.storage);
  return {
    status: 'READY',
    sourceFormat: extension.toUpperCase(),
    sourceMimeType: downloaded.contentType,
    canonicalMimeType: downloaded.contentType,
    checksumSha256: checksum,
    fileSizeBytes: downloaded.size,
    durationSeconds: null,
    qualityMetrics: {},
    processingVersion: 'iig-media-v1',
    ...location,
  };
}

async function processAudio(asset, sourceUrl, dependencies, workDir) {
  const rawPath = path.join(workDir, 'source.wav');
  const cleanPath = path.join(workDir, 'clean.wav');
  const mp3Path = path.join(workDir, 'canonical.mp3');
  const runner = dependencies.execute || audioCleaner.execute;
  const trustedSourceUrl = dependencies.resolveRedirects
    ? await dependencies.resolveRedirects(sourceUrl)
    : await resolveTrustedRedirects(sourceUrl, dependencies);
  await withNetworkRetry(() => runner('ffmpeg', [
    '-y', '-nostdin', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
    '-i', trustedSourceUrl, '-t', String(MAX_AUDIO_SECONDS), '-vn', '-ac', '1', '-ar', '16000', rawPath,
  ]), dependencies);

  let normalizedInput = rawPath;
  let cleanupMethod = 'normalize-only';
  if (asset.asset_role === 'STUDENT_AUDIO') {
    const script = path.join(__dirname, '../../services/audioCleaner.py');
    const python = process.env.AUDIO_CLEANER_PYTHON || 'python3';
    const cleaned = await runner(python, [script, rawPath, cleanPath, process.env.IIG_AUDIO_CLEANING_METHOD || 'ai']);
    await audioCleaner.ensureSafeDuration(rawPath, cleanPath, { execute: runner });
    normalizedInput = cleanPath;
    cleanupMethod = audioCleaner.resolveMethod(cleaned.stdout);
  }
  await runner('ffmpeg', [
    '-y', '-nostdin', '-i', normalizedInput, '-vn', '-codec:a', 'libmp3lame',
    '-ac', '1', '-ar', '16000', '-b:a', '96k', mp3Path,
  ]);
  const probe = await runner('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', mp3Path,
  ]);
  const analysis = await runner('ffmpeg', [
    '-nostdin', '-i', mp3Path, '-af', 'silencedetect=n=-45dB:d=0.3,volumedetect',
    '-f', 'null', '-',
  ]);
  const metrics = parseAudioMetrics(probe.stdout, `${analysis.stdout || ''}\n${analysis.stderr || ''}`);
  const quality = audioQuality(metrics);
  const checksum = await sha256File(mp3Path);
  const stored = await dependencies.storage.uploadFile(mp3Path, mediaObjectKey(asset, 'mp3'));
  const location = storageLocation(stored, dependencies.storage);
  return {
    status: quality.status,
    errorCode: quality.errorCode,
    sourceFormat: /\.m3u8?(?:\?|$)/i.test(trustedSourceUrl) ? 'HLS' : 'AUDIO',
    sourceMimeType: null,
    canonicalMimeType: 'audio/mpeg',
    checksumSha256: checksum,
    fileSizeBytes: metrics.fileSizeBytes,
    durationSeconds: metrics.durationSeconds,
    qualityMetrics: {
      meanVolumeDb: metrics.meanVolumeDb,
      maxVolumeDb: metrics.maxVolumeDb,
      silenceDurationSeconds: metrics.silenceDurationSeconds,
      silenceRatio: metrics.silenceRatio,
      cleanupMethod,
    },
    processingVersion: 'iig-media-v1',
    ...location,
  };
}

async function processAsset(asset, injected = {}) {
  const dependencies = {
    iig: injected.iig || iigClient,
    storage: injected.storage || storageService,
    execute: injected.execute,
    download: injected.download,
    request: injected.request,
    wait: injected.wait,
    resolveRedirects: injected.resolveRedirects,
  };
  if (!AUDIO_ROLES.has(asset.asset_role) && !IMAGE_ROLES.has(asset.asset_role)) {
    throw new MediaProcessingError(`Unsupported media role ${asset.asset_role}.`, 'IIG_MEDIA_ROLE_UNSUPPORTED', false);
  }
  const sourceUrl = await resolveSourceUrl(asset, dependencies);
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'iig-media-'));
  try {
    const result = AUDIO_ROLES.has(asset.asset_role)
      ? await processAudio(asset, sourceUrl, dependencies, workDir)
      : await processImage(asset, sourceUrl, dependencies, workDir);
    return { ...result, sourceLocator: sanitizedSourceLocator(asset, sourceUrl) };
  } catch (cause) {
    if (cause instanceof MediaProcessingError) throw cause;
    const network = networkFailure(cause);
    if (network) {
      throw new MediaProcessingError(network.message, network.code, true);
    }
    const status = Number(cause?.response?.status || 0);
    const retryable = !status || status === 408 || status === 425 || status === 429 || status >= 500;
    throw new MediaProcessingError(
      status ? `IIG media processing failed with HTTP ${status}.` : cause.message,
      status ? `IIG_MEDIA_HTTP_${status}` : 'IIG_MEDIA_PROCESSING_FAILED',
      retryable
    );
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

module.exports = {
  AUDIO_ROLES,
  IMAGE_ROLES,
  MediaProcessingError,
  NETWORK_RETRY_DELAYS_MS,
  networkFailure,
  withNetworkRetry,
  requestWithNetworkRetry,
  validateSourceUrl,
  resolveTrustedRedirects,
  parseAudioMetrics,
  audioQuality,
  mediaObjectKey,
  sanitizedSourceLocator,
  resolveSourceUrl,
  processAsset,
};
