const crypto = require('node:crypto');
const redis = require('../../../config/redis');
const config = require('../config');
const { createBlobStore } = require('../stores/blobStore');
const { createMaintenanceRepository } = require('../repositories/maintenanceRepository');

const INTERVAL_MS = 60 * 60 * 1000;
const LOCK_KEY = 'sl:maintenance:hourly';
const LOCK_TTL_SEC = 55 * 60;

function createSecureLectureMaintenance({
  repository = createMaintenanceRepository(),
  blobStore = createBlobStore(),
  // With Redis, only one instance runs each hour. Without Redis the deployment is
  // single-instance (sessions also fall back to the DB), so run locally: every
  // step is idempotent, and skipping forever would never close stale sessions.
  lock = {
    acquire: async () => {
      if (!redis.configured()) return true;
      return (await redis.set(LOCK_KEY, crypto.randomUUID(), { NX: true, EX: LOCK_TTL_SEC })) === 'OK';
    },
  },
  sessionTtlSec = config.sessionTtlSec,
  logRetentionDays = config.logRetentionDays,
  archiveDays = 30,
  logger = console,
} = {}) {
  async function run() {
    if (!await lock.acquire()) return { skipped: true, reason: 'lock_unavailable' };
    const summary = {
      skipped: false,
      timedOutSessions: await repository.closeStaleSessions(Math.ceil(sessionTtlSec)),
      deletedLogs: await repository.deleteExpiredLogs(Math.ceil(logRetentionDays)),
      deletedVersions: 0,
      blobErrors: 0,
    };
    const candidates = await repository.listArchivedVersions(archiveDays);
    for (const version of candidates) {
      try {
        await blobStore.remove(version.storage_key);
        if (await repository.deleteArchivedVersion(version.id, version.lecture_id, archiveDays)) summary.deletedVersions += 1;
      } catch (error) {
        summary.blobErrors += 1;
        logger.error('[SecureLectureMaintenance] Blob cleanup failed:', error.message);
      }
    }
    logger.log(`[SecureLectureMaintenance] timed_out=${summary.timedOutSessions} logs=${summary.deletedLogs} versions=${summary.deletedVersions} errors=${summary.blobErrors}`);
    return summary;
  }

  let timer = null;
  function start() {
    if (timer) return timer;
    timer = setInterval(() => run().catch(error => logger.error('[SecureLectureMaintenance] Job failed:', error.message)), INTERVAL_MS);
    timer.unref?.();
    run().catch(error => logger.error('[SecureLectureMaintenance] Initial run failed:', error.message));
    return timer;
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  return { run, start, stop };
}

const maintenance = createSecureLectureMaintenance();
module.exports = { ...maintenance, createSecureLectureMaintenance, INTERVAL_MS, LOCK_KEY, LOCK_TTL_SEC };
