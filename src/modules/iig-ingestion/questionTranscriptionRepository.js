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

class QuestionTranscriptionRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    return this.db.transaction(async executor => {
      const events = await executor.query(
        `UPDATE iig_ingestion_outbox
         SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
             available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
             updated_at = CURRENT_TIMESTAMP
         WHERE event_type = 'QUESTION_TRANSCRIPTION_REQUESTED' AND status = 'PROCESSING'
           AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
         RETURNING id`,
        [staleMs]
      );
      await executor.query(
        `UPDATE iig_exam_question_transcriptions
         SET status = 'FAILED', error_code = 'IIG_STT_LEASE_EXPIRED',
             error_message = 'Worker lease expired.', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'PROCESSING'
           AND updated_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')`,
        [staleMs]
      );
      return events.rowCount || events.rows.length;
    });
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT id FROM iig_ingestion_outbox
           WHERE event_type = 'QUESTION_TRANSCRIPTION_REQUESTED'
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

  async loadTasks(jobId) {
    const result = await this.db.query(
      `SELECT DISTINCT ON (transcription.id)
         transcription.id, transcription.exam_question_id, transcription.media_asset_id,
         transcription.target_type, question.question_number, question.scorer_type, question.context_text,
         section.section_type, asset.canonical_storage_provider,
         asset.canonical_storage_bucket, asset.canonical_storage_key,
         asset.canonical_mime_type
       FROM iig_submissions submission
       JOIN iig_question_attempts attempt ON attempt.submission_id = submission.id
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       JOIN iig_exam_sections section ON section.id = question.section_id
       JOIN iig_exam_question_transcriptions transcription
         ON transcription.exam_question_id = question.id
       JOIN iig_media_assets asset ON asset.id = transcription.media_asset_id
       WHERE submission.scoring_job_id = $1
         AND attempt.readiness_status = 'PENDING_TRANSCRIPTION'
         AND transcription.status IN ('PENDING', 'FAILED')
         AND asset.status = 'READY'
         AND asset.asset_role = transcription.target_type || '_AUDIO'
       ORDER BY transcription.id, question.sort_order`,
      [jobId]
    );
    return result.rows;
  }

  async markTaskProcessing(taskId) {
    const result = await this.db.query(
      `UPDATE iig_exam_question_transcriptions
       SET status = 'PROCESSING', attempt_count = attempt_count + 1,
           error_code = NULL, error_message = NULL, started_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('PENDING', 'FAILED')
       RETURNING id`,
      [taskId]
    );
    return Boolean(result.rows[0]);
  }

  async markTaskCompleted({ taskId, transcript, agentId, metadata }) {
    await this.db.query(
      `UPDATE iig_exam_question_transcriptions
       SET status = 'COMPLETED', transcript = $2, agent_id = $3,
           provider_metadata = $4::jsonb, error_code = NULL, error_message = NULL,
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'PROCESSING'`,
      [taskId, transcript, agentId || null, JSON.stringify(metadata || {})]
    );
  }

  async markTaskFailed(taskId, error) {
    await this.db.query(
      `UPDATE iig_exam_question_transcriptions
       SET status = 'FAILED', error_code = $2, error_message = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'PROCESSING'`,
      [taskId, error.code, String(error.message).slice(0, 2000)]
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
      return true;
    });
  }

  async completeEvent(event) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      const submission = await executor.query(
        `SELECT id FROM iig_submissions WHERE scoring_job_id = $1 FOR UPDATE`,
        [event.jobId]
      );
      const submissionId = submission.rows[0]?.id;
      if (!submissionId) {
        throw Object.assign(new Error('Question transcription job has no canonical submission.'), {
          code: 'IIG_SUBMISSION_MISSING', retryable: false,
        });
      }
      await executor.query(
        `UPDATE iig_submissions SET status = 'VALIDATING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [submissionId]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs SET status = 'VALIDATING', next_retry_at = NULL,
           error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.jobId]
      );
      await executor.query(
        `INSERT INTO iig_ingestion_outbox
           (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
         VALUES ('IIG_SCORING_JOB', $1, 'INPUT_VALIDATION_REQUESTED', $2, $3::jsonb)
         ON CONFLICT (deduplication_key) DO NOTHING`,
        [
          event.jobId,
          `iig-scoring-job:${event.jobId}:input-validation:post-question-stt:v1`,
          JSON.stringify({ jobId: event.jobId, submissionId }),
        ]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, submission_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'QUESTION_TRANSCRIPTION_COMPLETED', 'TRANSCRIBING', 'VALIDATING', '{}'::jsonb)`,
        [event.jobId, submissionId]
      );
      await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
           locked_at = NULL, locked_by = NULL, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id]
      );
      return { submissionId };
    });
  }

  async completeWithReview({ event, error }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      const submission = await executor.query(
        `SELECT id FROM iig_submissions WHERE scoring_job_id = $1 FOR UPDATE`,
        [event.jobId]
      );
      const submissionId = submission.rows[0]?.id;
      if (!submissionId) {
        throw Object.assign(new Error('Question transcription job has no canonical submission.'), {
          code: 'IIG_SUBMISSION_MISSING', retryable: false,
        });
      }
      await executor.query(
        `UPDATE iig_exam_question_transcriptions transcription
         SET status = 'REVIEW', error_code = COALESCE(error_code, $2),
             error_message = COALESCE(error_message, $3), updated_at = CURRENT_TIMESTAMP
         FROM iig_question_attempts attempt
         WHERE attempt.submission_id = $1
           AND attempt.exam_question_id = transcription.exam_question_id
           AND transcription.status = 'FAILED'`,
        [submissionId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_question_attempts attempt SET readiness_status = 'REVIEW',
           validation_errors = validation_errors || $2::jsonb, updated_at = CURRENT_TIMESTAMP
         WHERE attempt.submission_id = $1 AND attempt.readiness_status = 'PENDING_TRANSCRIPTION'
           AND EXISTS (
             SELECT 1 FROM iig_exam_question_transcriptions transcription
             WHERE transcription.exam_question_id = attempt.exam_question_id
               AND transcription.status = 'REVIEW'
           )`,
        [submissionId, JSON.stringify([{
          code: error.code,
          field: 'question.transcription',
          message: String(error.message).slice(0, 2000),
        }])]
      );
      await executor.query(
        `UPDATE iig_submissions SET status = 'VALIDATING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [submissionId]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs SET status = 'VALIDATING', next_retry_at = NULL,
           error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.jobId]
      );
      await executor.query(
        `INSERT INTO iig_ingestion_outbox
           (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
         VALUES ('IIG_SCORING_JOB', $1, 'INPUT_VALIDATION_REQUESTED', $2, $3::jsonb)
         ON CONFLICT (deduplication_key) DO NOTHING`,
        [
          event.jobId,
          `iig-scoring-job:${event.jobId}:input-validation:post-content-stt-review:v1`,
          JSON.stringify({ jobId: event.jobId, submissionId }),
        ]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, submission_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'CONTENT_TRANSCRIPTION_REVIEW_REQUIRED', 'TRANSCRIBING', 'VALIDATING', $3::jsonb)`,
        [event.jobId, submissionId, JSON.stringify({ code: error.code })]
      );
      await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
           locked_at = NULL, locked_by = NULL, last_error = $2,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id, String(error.message).slice(0, 2000)]
      );
      return { submissionId };
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
        `UPDATE iig_scoring_jobs SET status = 'FAILED', completed_at = CURRENT_TIMESTAMP,
           next_retry_at = NULL, error_code = $2, error_message = $3,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.jobId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_submissions SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE scoring_job_id = $1`,
        [event.jobId]
      );
      await executor.query(
        `UPDATE iig_question_attempts attempt SET readiness_status = 'REVIEW',
           validation_errors = validation_errors || $2::jsonb, updated_at = CURRENT_TIMESTAMP
         FROM iig_submissions submission
         WHERE attempt.submission_id = submission.id AND submission.scoring_job_id = $1
           AND attempt.readiness_status = 'PENDING_TRANSCRIPTION'`,
        [event.jobId, JSON.stringify([{ code: error.code, field: 'question.questionText', message: error.message }])]
      );
      return true;
    });
  }
}

const repository = new QuestionTranscriptionRepository();
repository.QuestionTranscriptionRepository = QuestionTranscriptionRepository;
repository.mapOutbox = mapOutbox;

module.exports = repository;
