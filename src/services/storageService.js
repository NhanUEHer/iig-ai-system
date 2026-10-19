/**
 * storageService.js
 * S3-compatible storage client for Cloudflare R2.
 * Used to upload cleaned audio files and generate pre-signed URLs.
 */
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

const R2_ENDPOINT   = process.env.R2_ENDPOINT   || '';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY  || '';
const R2_SECRET_KEY = process.env.R2_SECRET_KEY  || '';
const R2_BUCKET     = process.env.R2_BUCKET      || 'ai-scoring-audio';
const R2_CLEAN_AUDIO_PREFIX = process.env.R2_CLEAN_AUDIO_PREFIX || 'cleaned-audio';
const R2_GENERATED_AUDIO_PREFIX = process.env.R2_GENERATED_AUDIO_PREFIX || 'dialogues';
// MEDIA_STORAGE_MODE is the canonical switch because this service stores image,
// video, documents and audio. Keep AUDIO_STORAGE_MODE as a compatibility alias.
const MEDIA_STORAGE_MODE = process.env.MEDIA_STORAGE_MODE || process.env.AUDIO_STORAGE_MODE || 'local';
const LOCAL_MEDIA_ROOT = path.join(__dirname, '../../public/question-bank-media');

// URL expiry: 7 days (Dify calls + frontend playback)
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

let _client = null;

function getClient() {
  if (!_client) {
    if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
      throw new Error('R2 credentials not configured. Set R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY in .env');
    }
    _client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY,
        secretAccessKey: R2_SECRET_KEY,
      },
    });
  }
  return _client;
}

/**
 * Check if R2 is configured
 */
function isR2Configured() {
  return !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY);
}

function requireR2() {
  if (MEDIA_STORAGE_MODE === 'r2' && !isR2Configured()) {
    throw new Error('MEDIA_STORAGE_MODE=r2 requires complete R2 credentials.');
  }
}

function requireProductionR2() {
  const production = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  if (production && MEDIA_STORAGE_MODE !== 'r2') {
    throw new Error('Production requires MEDIA_STORAGE_MODE=r2. Local persistent media is disabled.');
  }
  requireR2();
}

function objectKey(kind, fileName) {
  const prefix = kind === 'generated' ? R2_GENERATED_AUDIO_PREFIX : R2_CLEAN_AUDIO_PREFIX;
  return `${prefix.replace(/^\/+|\/+$/g, '')}/${String(fileName).replace(/^\/+/, '')}`;
}

/**
 * Upload a local file to R2.
 * @param {string} localFilePath - absolute path to local file
 * @param {string} r2Key         - object key in R2 bucket, e.g. "cleaned-audio/xxx.wav"
 * @returns {Promise<string>}    - the R2 key stored (prefix "r2:")
 */
async function uploadFile(localFilePath, r2Key) {
  const client = getClient();
  const fileBuffer = fs.readFileSync(localFilePath);
  const ext = path.extname(localFilePath).toLowerCase();
  const contentType = ext === '.wav'  ? 'audio/wav'
                    : ext === '.mp3'  ? 'audio/mpeg'
                    : ext === '.ogg'  ? 'audio/ogg'
                    : 'application/octet-stream';

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await client.send(command);
  console.log(`[R2] Uploaded: ${r2Key}`);
  return `r2:${r2Key}`;
}

async function uploadBuffer(buffer, r2Key, contentType = 'application/octet-stream', options = {}) {
  const saveLocal = () => {
    const safeKey = String(r2Key).replace(/^\/+/, '').replace(/\.\.(?:\/|\\)/g, '');
    const target = path.join(LOCAL_MEDIA_ROOT, safeKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    return `local:${safeKey}`;
  };
  const production = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  if (production && (options.preferLocal || MEDIA_STORAGE_MODE !== 'r2' || !isR2Configured())) {
    throw new Error('Production media upload requires configured R2 storage.');
  }
  if (options.preferLocal || MEDIA_STORAGE_MODE !== 'r2' || !isR2Configured()) {
    return saveLocal();
  }
  try {
    await getClient().send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: r2Key, Body: buffer, ContentType: contentType }));
    return `r2:${r2Key}`;
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
    if (isProduction) throw error;
    console.warn(`[Storage] R2 upload failed in local development; using local storage: ${error.message}`);
    return saveLocal();
  }
}

/**
 * Generate a pre-signed GET URL for an R2 object key.
 * @param {string} r2KeyOrStoredUrl - either "r2:<key>" (stored format) or raw "<key>"
 * @returns {Promise<string>}       - temporary HTTPS URL valid for 7 days
 */
async function getSignedAudioUrl(r2KeyOrStoredUrl) {
  const localKey = r2KeyOrStoredUrl.startsWith('local:') ? r2KeyOrStoredUrl.slice(6) : r2KeyOrStoredUrl;
  if (r2KeyOrStoredUrl.startsWith('local:') || fs.existsSync(path.join(LOCAL_MEDIA_ROOT, localKey))) {
    return `/question-bank-media/${localKey.split('/').map(encodeURIComponent).join('/')}`;
  }
  const client = getClient();
  const key = r2KeyOrStoredUrl.startsWith('r2:')
    ? r2KeyOrStoredUrl.slice(3)
    : r2KeyOrStoredUrl;

  const getCommand = { Bucket: R2_BUCKET, Key: key };
  const url = await getSignedUrl(
    client,
    new (require('@aws-sdk/client-s3').GetObjectCommand)(getCommand),
    { expiresIn: SIGNED_URL_EXPIRY_SECONDS }
  );
  return url;
}

async function createSignedUploadUrl(r2Key, contentType, expiresIn = 900) {
  requireR2();
  const key = String(r2Key || '').replace(/^r2:/, '').replace(/^\/+/, '');
  if (!key) throw new Error('R2 object key is required.');
  const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(getClient(), command, { expiresIn: Math.max(60, Math.min(3600, Number(expiresIn) || 900)) });
}

async function headObject(r2KeyOrStoredUrl) {
  const key = String(r2KeyOrStoredUrl || '').replace(/^r2:/, '').replace(/^\/+/, '');
  const result = await getClient().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  return { size: Number(result.ContentLength || 0), contentType: result.ContentType || null, etag: String(result.ETag || '').replaceAll('"', '') || null };
}

async function downloadBuffer(r2KeyOrStoredUrl) {
  const localKey = r2KeyOrStoredUrl.startsWith('local:') ? r2KeyOrStoredUrl.slice(6) : r2KeyOrStoredUrl;
  if (r2KeyOrStoredUrl.startsWith('local:') || fs.existsSync(path.join(LOCAL_MEDIA_ROOT, localKey))) {
    const safeKey = localKey.replace(/\.\.(?:\/|\\)/g, '');
    return { buffer: fs.readFileSync(path.join(LOCAL_MEDIA_ROOT, safeKey)), contentType: 'application/octet-stream' };
  }
  const key = r2KeyOrStoredUrl.startsWith('r2:') ? r2KeyOrStoredUrl.slice(3) : r2KeyOrStoredUrl;
  const response = await getClient().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  return {
    buffer: Buffer.from(await response.Body.transformToByteArray()),
    contentType: response.ContentType || 'application/octet-stream',
  };
}

/**
 * Delete an object from R2.
 */
async function deleteFile(r2KeyOrStoredUrl) {
  const localKey = r2KeyOrStoredUrl.startsWith('local:') ? r2KeyOrStoredUrl.slice(6) : r2KeyOrStoredUrl;
  if (r2KeyOrStoredUrl.startsWith('local:') || fs.existsSync(path.join(LOCAL_MEDIA_ROOT, localKey))) {
    const safeKey = localKey.replace(/\.\.(?:\/|\\)/g, '');
    fs.rmSync(path.join(LOCAL_MEDIA_ROOT, safeKey), { force: true });
    return;
  }
  const client = getClient();
  const key = r2KeyOrStoredUrl.startsWith('r2:')
    ? r2KeyOrStoredUrl.slice(3)
    : r2KeyOrStoredUrl;
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  console.log(`[R2] Deleted: ${key}`);
}

/**
 * Returns true if a stored URL is an R2 key reference.
 */
function isR2Key(storedUrl) {
  return typeof storedUrl === 'string' && storedUrl.startsWith('r2:');
}

module.exports = {
  uploadFile, uploadBuffer, downloadBuffer, getSignedAudioUrl,
  getSignedUrl: getSignedAudioUrl, deleteFile, isR2Key, isR2Configured,
  createSignedUploadUrl, headObject,
  requireR2, requireProductionR2, objectKey,
  mediaStorageMode: MEDIA_STORAGE_MODE,
  audioStorageMode: MEDIA_STORAGE_MODE,
};
