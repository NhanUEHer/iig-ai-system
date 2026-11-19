const DEFAULTS = Object.freeze({
  publicBaseUrl: null,
  storagePrefix: 'secure-lectures',
  maxUploadMb: 20,
  heartbeatSec: 30,
  sessionTtlSec: 90,
  ticketTtlSec: 60,
  logRetentionDays: 180,
});

function positiveNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadConfig(env = process.env) {
  return Object.freeze({
    publicBaseUrl: env.SECURE_LECTURES_PUBLIC_BASE_URL || DEFAULTS.publicBaseUrl,
    storagePrefix: env.SECURE_LECTURES_STORAGE_PREFIX || DEFAULTS.storagePrefix,
    maxUploadMb: positiveNumber(env.SECURE_LECTURES_MAX_UPLOAD_MB, DEFAULTS.maxUploadMb),
    heartbeatSec: positiveNumber(env.SECURE_LECTURES_HEARTBEAT_SEC, DEFAULTS.heartbeatSec),
    sessionTtlSec: positiveNumber(env.SECURE_LECTURES_SESSION_TTL_SEC, DEFAULTS.sessionTtlSec),
    ticketTtlSec: positiveNumber(env.SECURE_LECTURES_TICKET_TTL_SEC, DEFAULTS.ticketTtlSec),
    logRetentionDays: positiveNumber(
      env.SECURE_LECTURES_LOG_RETENTION_DAYS,
      DEFAULTS.logRetentionDays,
    ),
  });
}

const config = loadConfig();

module.exports = { ...config, DEFAULTS, loadConfig };
