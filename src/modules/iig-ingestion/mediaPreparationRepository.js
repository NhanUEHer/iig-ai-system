const db = require('../../config/db');

function mapOutbox(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.aggregate_id,
    payload: row.payload || {},
    publishAttempts: Number(row.publish_attempts || 0),
    lockedBy: row.locked_by,
  };
}

class MediaPreparationRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    const result = await this.db.query(
      `UPDATE iig_ingestion_outbox
       SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
           available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
           updated_at = CURRENT_TIMESTAMP
       WHERE event_type = 'MEDIA_PREPARATION_REQUESTED' AND status = 'PROCESSING'
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
           WHERE event_type = 'MEDIA_PREPARATION_REQUESTED'
             AND status IN ('PENDING', 'FAILED') AND available_at <= CURRENT_TIMESTAMP
           ORDER BY available_at, created_at
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE iig_ingestion_outbox event
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $1,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         FROM candidate WHERE event.id = candidate.id
         RETURNING event.*`,
        [workerId]
      );
      return mapOutbox(result.rows[0]);
    });
  }

  async listPendingAssets(jobId) {
    const result = await this.db.query(
      `SELECT asset.*
       FROM iig_media_assets asset
       WHERE asset.status IN ('DISCOVERED', 'RESOLVING', 'DOWNLOADING', 'CONVERTING',
                              'UPLOADING', 'QUALITY_CHECK', 'PENDING_RETRY')
         AND (
           asset.question_attempt_id IN (
             SELECT attempt.id FROM iig_question_attempts attempt
             JOIN iig_submissions submission ON submission.id = attempt.submission_id
             WHERE submission.scoring_job_id = $1
           )
           OR asset.exam_question_id IN (
             SELECT attempt.exam_question_id FROM iig_question_attempts attempt
             JOIN iig_submissions submission ON submission.id = attempt.submission_id
             WHERE submission.scoring_job_id = $1
           )
         )
       ORDER BY CASE WHEN asset.asset_role = 'STUDENT_AUDIO' THEN 0 ELSE 1 END,
                asset.created_at, asset.id`,
      [jobId]
    );
    return result.rows;
  }

  async markAssetProcessing(assetId) {
    await this.db.query(
      `UPDATE iig_media_assets SET status = 'RESOLVING', error_code = NULL,
         error_message = NULL, failure_origin = NULL, failure_class = NULL,
         retry_exhausted = FALSE, attempt_count = attempt_count + 1,
         last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [assetId]
    );
  }

  async markAssetResult(assetId, result) {
    await this.db.query(
      `UPDATE iig_media_assets SET
         source_format = $2, source_mime_type = COALESCE($3, source_mime_type),
         canonical_storage_provider = $4, canonical_storage_bucket = $5,
         canonical_storage_key = $6, canonical_mime_type = $7,
         checksum_sha256 = $8, file_size_bytes = $9, duration_seconds = $10,
         status = $11, quality_metrics = $12::jsonb, processing_version = $13,
         error_code = $14, source_locator = $15::jsonb,
         error_message = NULL, failure_origin = NULL, failure_class = NULL,
         retry_exhausted = FALSE, processed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        assetId, result.sourceFormat, result.sourceMimeType, result.provider,
        result.bucket, result.key, result.canonicalMimeType, result.checksumSha256,
        result.fileSizeBytes, result.durationSeconds, result.status,
        JSON.stringify(result.qualityMetrics || {}), result.processingVersion,
        result.errorCode || null, JSON.stringify(result.sourceLocator || {}),
      ]
    );
  }

  async markAssetRetry(assetId, error, classification) {
    await this.db.query(
      `UPDATE iig_media_assets SET status = 'PENDING_RETRY', error_code = $2,
         error_message = $3, failure_origin = $4, failure_class = $5,
         retry_exhausted = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [
        assetId, error.code, String(error.message).slice(0, 2000),
        classification.failureOrigin, classification.failureClass,
      ]
    );
  }

  async markAssetFailure(assetId, error, classification) {
    await this.db.query(
      `UPDATE iig_media_assets SET status = 'FAILED', error_code = $2,
         error_message = $3, failure_origin = $4, failure_class = $5,
         retry_exhausted = $6, processed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [
        assetId, error.code, String(error.message).slice(0, 2000),
        classification.failureOrigin, classification.failureClass,
        classification.retryExhausted,
      ]
    );
  }

  async markRetry({ event, error, delayMs }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'FAILED',
           available_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
           locked_at = NULL, locked_by = NULL, last_error = $3,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id, delayMs, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs SET retry_count = retry_count + 1,
           next_retry_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
           error_code = $3, error_message = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.jobId, delayMs, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, event_type, from_status, to_status, details)
         VALUES ($1, 'MEDIA_RETRY_SCHEDULED', 'PREPARING_MEDIA', 'PREPARING_MEDIA', $2::jsonb)`,
        [event.jobId, JSON.stringify({ code: error.code, attempt: event.publishAttempts, delayMs })]
      );
      return true;
    });
  }

  async completeMedia(event) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      const submissionResult = await executor.query(
        `SELECT id FROM iig_submissions WHERE scoring_job_id = $1 FOR UPDATE`,
        [event.jobId]
      );
      const submissionId = submissionResult.rows[0]?.id;
      if (!submissionId) {
        throw Object.assign(new Error('Media job does not have a canonical submission.'), {
          code: 'IIG_SUBMISSION_MISSING', retryable: false,
        });
      }
      await executor.query(
        `WITH asset_counts AS (
           SELECT attempt.id,
             COUNT(asset.id) FILTER (WHERE asset.is_required)::int AS total_count,
             COUNT(asset.id) FILTER (WHERE asset.is_required AND asset.status = 'READY')::int AS ready_count,
             BOOL_OR(asset.is_required AND asset.status = 'INVALID_AUDIO') AS has_invalid_audio,
             BOOL_OR(asset.is_required AND asset.status = 'FAILED'
               AND asset.asset_role <> 'STUDENT_AUDIO') AS has_failed_prompt,
             BOOL_OR(asset.is_required AND asset.status = 'FAILED'
               AND asset.asset_role = 'STUDENT_AUDIO') AS has_failed_student_audio,
             COALESCE(
               JSONB_AGG(JSONB_BUILD_OBJECT(
                 'assetId', asset.id,
                 'role', asset.asset_role,
                 'code', asset.error_code,
                 'failureOrigin', asset.failure_origin,
                 'failureClass', asset.failure_class,
                 'attemptCount', asset.attempt_count,
                 'retryExhausted', asset.retry_exhausted
               ))
                 FILTER (WHERE asset.is_required AND asset.status IN ('INVALID_AUDIO', 'FAILED')),
               '[]'::jsonb
             ) AS errors
           FROM iig_question_attempts attempt
           LEFT JOIN iig_media_assets asset
             ON asset.question_attempt_id = attempt.id
             OR asset.exam_question_id = attempt.exam_question_id
           WHERE attempt.submission_id = $1
           GROUP BY attempt.id
         )
         UPDATE iig_question_attempts attempt SET
           required_asset_count = counts.total_count,
           ready_asset_count = counts.ready_count,
           readiness_status = CASE
             WHEN counts.has_failed_prompt THEN 'INVALID_INPUT'
             WHEN counts.has_invalid_audio THEN 'INVALID_AUDIO'
             WHEN counts.has_failed_student_audio THEN 'VALIDATING'
             ELSE 'VALIDATING'
           END,
           validation_errors = counts.errors,
           updated_at = CURRENT_TIMESTAMP
         FROM asset_counts counts WHERE attempt.id = counts.id`,
        [submissionId]
      );
      const progress = await executor.query(
        `SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE readiness_status = 'INVALID_AUDIO')::int AS invalid_audio,
           COUNT(*) FILTER (WHERE readiness_status = 'INVALID_INPUT')::int AS invalid_input
         FROM iig_question_attempts WHERE submission_id = $1`,
        [submissionId]
      );
      const counts = progress.rows[0];
      const invalid = Number(counts.invalid_audio) + Number(counts.invalid_input);
      const total = Number(counts.total);
      await executor.query(
        `UPDATE iig_submissions SET status = 'VALIDATING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [submissionId]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs SET status = 'VALIDATING', total_questions = $2,
           ready_questions = 0, invalid_questions = $3,
           pending_questions = $2::integer - $3::integer,
           next_retry_at = NULL, error_code = NULL, error_message = NULL,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.jobId, total, invalid]
      );
      await executor.query(
        `INSERT INTO iig_ingestion_outbox
           (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
         VALUES ('IIG_SCORING_JOB', $1, 'INPUT_VALIDATION_REQUESTED', $2, $3::jsonb)
         ON CONFLICT (deduplication_key) DO NOTHING`,
        [
          event.jobId,
          `iig-scoring-job:${event.jobId}:input-validation:v1`,
          JSON.stringify({ jobId: event.jobId, submissionId }),
        ]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, submission_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'MEDIA_PREPARATION_COMPLETED', 'PREPARING_MEDIA', 'VALIDATING', $3::jsonb)`,
        [event.jobId, submissionId, JSON.stringify({ totalQuestions: total, invalidQuestions: invalid })]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, submission_id, question_attempt_id, event_type,
            from_status, to_status, details)
         SELECT $1, $2, attempt.id, 'SOURCE_MEDIA_RETRY_EXHAUSTED',
                'PREPARING_MEDIA', 'VALIDATING',
                JSONB_BUILD_OBJECT(
                  'assetId', asset.id,
                  'assetRole', asset.asset_role,
                  'code', asset.error_code,
                  'failureClass', asset.failure_class,
                  'attemptCount', asset.attempt_count
                )
         FROM iig_question_attempts attempt
         JOIN iig_media_assets asset ON asset.question_attempt_id = attempt.id
         WHERE attempt.submission_id = $2
           AND asset.status = 'FAILED'
           AND asset.asset_role = 'STUDENT_AUDIO'
           AND asset.retry_exhausted = TRUE`,
        [event.jobId, submissionId]
      );
      await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
           locked_at = NULL, locked_by = NULL, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id]
      );
      return { submissionId, totalQuestions: total, invalidQuestions: invalid };
    });
  }

  async markDeadLetter({ event, error }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'DEAD_LETTER', locked_at = NULL,
           locked_by = NULL, last_error = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs SET status = 'MEDIA_FAILED', completed_at = CURRENT_TIMESTAMP,
           next_retry_at = NULL, error_code = $2, error_message = $3,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.jobId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, event_type, from_status, to_status, details)
         VALUES ($1, 'MEDIA_PREPARATION_DEAD_LETTERED', 'PREPARING_MEDIA', 'MEDIA_FAILED', $2::jsonb)`,
        [event.jobId, JSON.stringify({ code: error.code, attempt: event.publishAttempts })]
      );
      return true;
    });
  }
}

const repository = new MediaPreparationRepository();
repository.MediaPreparationRepository = MediaPreparationRepository;
repository.mapOutbox = mapOutbox;

module.exports = repository;
