const db = require('../../config/db');

function mapOutbox(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload || {},
    publishAttempts: Number(row.publish_attempts || 0),
    lockedBy: row.locked_by,
  };
}

class SourceFetchRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    const result = await this.db.query(
      `UPDATE iig_ingestion_outbox
       SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
           available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
           updated_at = CURRENT_TIMESTAMP
       WHERE event_type = 'SOURCE_FETCH_REQUESTED' AND status = 'PROCESSING'
         AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
       RETURNING id`,
      [staleMs]
    );
    return result.rowCount || result.rows.length;
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT id FROM iig_ingestion_outbox
           WHERE event_type = 'SOURCE_FETCH_REQUESTED'
             AND status IN ('PENDING', 'FAILED')
             AND available_at <= CURRENT_TIMESTAMP
           ORDER BY available_at, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE iig_ingestion_outbox event
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $1,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         FROM candidate
         WHERE event.id = candidate.id
         RETURNING event.*`,
        [workerId]
      );
      return mapOutbox(result.rows[0]);
    });
  }

  async claimById(eventId, workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `UPDATE iig_ingestion_outbox
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $2,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND event_type = 'SOURCE_FETCH_REQUESTED'
           AND status IN ('PENDING', 'FAILED')
           AND available_at <= CURRENT_TIMESTAMP
         RETURNING *`,
        [eventId, workerId]
      );
      return mapOutbox(result.rows[0]);
    });
  }

  async findOutboxStatus(eventId) {
    const result = await this.db.query(
      `SELECT status, available_at FROM iig_ingestion_outbox
       WHERE id = $1 AND event_type = 'SOURCE_FETCH_REQUESTED'`,
      [eventId]
    );
    return result.rows[0] || null;
  }

  async findJob(jobId) {
    const result = await this.db.query(
      `SELECT id, partner, keycode, source_scoring_id, status
       FROM iig_scoring_jobs WHERE id = $1`,
      [jobId]
    );
    return result.rows[0] || null;
  }

  async markFetching(jobId) {
    const result = await this.db.query(
      `UPDATE iig_scoring_jobs
       SET status = 'FETCHING_SOURCE', started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
           error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('ACCEPTED', 'FETCHING_SOURCE', 'SOURCE_FETCH_FAILED')
       RETURNING id`,
      [jobId]
    );
    return Boolean(result.rows[0]);
  }

  async completeFetch({ event, job, normalized, snapshotDays = 7 }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
         FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;

      await executor.query(
        `INSERT INTO iig_source_snapshots
           (scoring_job_id, snapshot_type, source_endpoint, payload_hash, payload, expires_at)
         VALUES ($1, 'BATCH_DETAIL', $2, $3, $4::jsonb,
                 CURRENT_TIMESTAMP + ($5 * INTERVAL '1 day'))
         ON CONFLICT (scoring_job_id, snapshot_type, payload_hash) DO NOTHING`,
        [
          job.id,
          '/api-admin-old/api/Scoring/course-scoring/detail/questions',
          normalized.payloadHash,
          JSON.stringify(normalized.payload),
          snapshotDays,
        ]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs
         SET status = 'SYNCING_EXAM', total_questions = $2,
             ready_questions = 0, invalid_questions = 0, pending_questions = $2,
             next_retry_at = NULL, error_code = NULL, error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [job.id, normalized.questionCount]
      );
      await executor.query(
        `INSERT INTO iig_ingestion_outbox
           (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
         VALUES ('IIG_SCORING_JOB', $1, 'SOURCE_SYNC_REQUESTED', $2, $3::jsonb)
         ON CONFLICT (deduplication_key) DO NOTHING`,
        [
          job.id,
          `iig-scoring-job:${job.id}:source-sync:${normalized.payloadHash}:v1`,
          JSON.stringify({
            jobId: job.id,
            snapshotHash: normalized.payloadHash,
            mockTestId: normalized.mockTestId,
          }),
        ]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, event_type, from_status, to_status, details)
         VALUES ($1, 'SOURCE_FETCH_COMPLETED', 'FETCHING_SOURCE', 'SYNCING_EXAM', $2::jsonb)`,
        [job.id, JSON.stringify({
          questionCount: normalized.questionCount,
          mockTestId: normalized.mockTestId,
          payloadHash: normalized.payloadHash,
        })]
      );
      await executor.query(
        `UPDATE iig_ingestion_outbox
         SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
             locked_at = NULL, locked_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id]
      );
      return true;
    });
  }

  async markRetry({ event, jobId, error, delayMs }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
         FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      await executor.query(
        `UPDATE iig_ingestion_outbox
         SET status = 'FAILED', available_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
             locked_at = NULL, locked_by = NULL, last_error = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id, delayMs, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs
         SET status = 'FETCHING_SOURCE', retry_count = retry_count + 1,
             next_retry_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
             error_code = $3, error_message = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [jobId, delayMs, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, event_type, from_status, to_status, details)
         VALUES ($1, 'SOURCE_FETCH_RETRY_SCHEDULED', 'FETCHING_SOURCE', 'FETCHING_SOURCE', $2::jsonb)`,
        [jobId, JSON.stringify({ code: error.code, attempt: event.publishAttempts, delayMs })]
      );
      return true;
    });
  }

  async markDeadLetter({ event, jobId, error }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
         FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      await executor.query(
        `UPDATE iig_ingestion_outbox
         SET status = 'DEAD_LETTER', locked_at = NULL, locked_by = NULL,
             last_error = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs
         SET status = 'SOURCE_FETCH_FAILED', completed_at = CURRENT_TIMESTAMP,
             next_retry_at = NULL, error_code = $2, error_message = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [jobId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, event_type, from_status, to_status, details)
         VALUES ($1, 'SOURCE_FETCH_DEAD_LETTERED', 'FETCHING_SOURCE', 'SOURCE_FETCH_FAILED', $2::jsonb)`,
        [jobId, JSON.stringify({ code: error.code, attempt: event.publishAttempts })]
      );
      return true;
    });
  }
}

const repository = new SourceFetchRepository();
repository.SourceFetchRepository = SourceFetchRepository;
repository.mapOutbox = mapOutbox;

module.exports = repository;
