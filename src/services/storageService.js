/**
 * storageService.js
 * S3-compatible storage client for Cloudflare R2.
 * Used to upload cleaned audio files and generate pre-signed URLs.
 */
const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

const R2_ENDPOINT   = process.env.R2_ENDPOINT   || '';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY  || '';
const R2_SECRET_KEY = process.env.R2_SECRET_KEY  || '';
const R2_BUCKET     = process.env.R2_BUCKET      || 'ai-scoring-audio';
const R2_CLEAN_AUDIO_PREFIX = process.env.R2_CLEAN_AUDIO_PREFIX || 'cleaned-audio';
const R2_GENERATED_AUDIO_PREFIX = process.env.R2_GENERATED_AUDIO_PREFIX || 'dialogues';
const AUDIO_STORAGE_MODE = process.env.AUDIO_STORAGE_MODE || 'local';

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
  if (AUDIO_STORAGE_MODE === 'r2' && !isR2Configured()) {
    throw new Error('AUDIO_STORAGE_MODE=r2 requires complete R2 credentials.');
  }
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

/**
 * Generate a pre-signed GET URL for an R2 object key.
 * @param {string} r2KeyOrStoredUrl - either "r2:<key>" (stored format) or raw "<key>"
 * @returns {Promise<string>}       - temporary HTTPS URL valid for 7 days
 */
async function getSignedAudioUrl(r2KeyOrStoredUrl) {
  const client = getClient();
  const key = r2KeyOrStoredUrl.startsWith('r2:')
    ? r2KeyOrStoredUrl.slice(3)
    : r2KeyOrStoredUrl;

  const command = new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key });
  // Verify object exists (throws if not)
  await client.send(command);

  const getCommand = { Bucket: R2_BUCKET, Key: key };
  const url = await getSignedUrl(
    client,
    new (require('@aws-sdk/client-s3').GetObjectCommand)(getCommand),
    { expiresIn: SIGNED_URL_EXPIRY_SECONDS }
  );
  return url;
}

/**
 * Delete an object from R2.
 */
async function deleteFile(r2KeyOrStoredUrl) {
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

module.exports = { uploadFile, getSignedAudioUrl, deleteFile, isR2Key, isR2Configured, requireR2, objectKey, audioStorageMode: AUDIO_STORAGE_MODE };
