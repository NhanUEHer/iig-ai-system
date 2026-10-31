const db = require('../../config/db');
const speakingCompletionRepository = require('../iig-ai-scoring/speakingCompletionRepository');
const writingCompletionRepository = require('../iig-ai-scoring/writingCompletionRepository');

function scoringGroup(result) {
  const type = result.scorerType || result.aiInput?.question?.scorerType;
  const number = Number(result.questionNumber ?? result.aiInput?.question?.number);
  if (type === 'READ_TEXT_ALOUD' && [1, 2].includes(number)) return 'READ_TEXT_ALOUD';
  if (type === 'DESCRIBE_PICTURE' && [3, 4].includes(number)) return 'DESCRIBE_PICTURE';
  if (['RESPOND_TO_QUESTIONS', 'RESPOND_USING_INFORMATION'].includes(type)
      && [5, 6, 7, 8, 9, 10].includes(number)) return 'RESPOND_Q5_Q10';
  if (type === 'EXPRESS_AN_OPINION' && number === 11) return 'EXPRESS_OPINION';
  if (type === 'WRITE_SENTENCE_PICTURE' && [1, 2, 3, 4, 5].includes(number)) {
    return 'WRITE_SENTENCE_Q1_Q5';
  }
  if (type === 'RESPOND_TO_WRITTEN_REQUEST' && [6, 7].includes(number)) {
    return 'WRITTEN_REQUEST_Q6_Q7';
  }
  if (type === 'WRITE_OPINION_ESSAY' && number === 8) return 'OPINION_ESSAY_Q8';
  return null;
}

function eligibleScoringGroups(results, pendingTranscriptions = 0) {
  if (pendingTranscriptions > 0) return [];
  const resultGroups = new Map();
  for (const result of results) {
    const group = scoringGroup(result);
    if (!group) continue;
    const statuses = resultGroups.get(group) || [];
    statuses.push(result.status);
    resultGroups.set(group, statuses);
  }
  return [...resultGroups.entries()]
    .filter(([, statuses]) => statuses.every(status => status === 'READY_FOR_AI'))
    .map(([group]) => group);
}

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

class InputValidationRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    const result = await this.db.query(
      `UPDATE iig_ingestion_outbox
       SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
           available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
           updated_at = CURRENT_TIMESTAMP
       WHERE event_type = 'INPUT_VALIDATION_REQUESTED' AND status = 'PROCESSING'
         AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
       RETURNING id`,
      [staleMs]
    );
    return result.rowCount || result.rows.length;
  }

  async enqueueResolutionReconciliation() {
    const result = await this.db.query(
      `INSERT INTO iig_ingestion_outbox
         (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
       SELECT 'IIG_SCORING_JOB', job.id, 'INPUT_VALIDATION_REQUESTED',
              'iig-scoring-job:' || job.id || ':input-validation:resolution-v2',
              JSONB_BUILD_OBJECT('jobId', job.id, 'submissionId', submission.id,
                                 'reason', 'INVALID_PROMPT_SOURCE_RECONCILIATION')
       FROM iig_scoring_jobs job
       JOIN iig_submissions submission ON submission.scoring_job_id = job.id
       WHERE job.status IN ('READY_FOR_AI', 'INVALID_INPUT')
         AND submission.ai_scoring_status = 'PROCESSING'
         AND EXISTS (
           SELECT 1 FROM iig_question_attempts attempt
           WHERE attempt.submission_id = submission.id
             AND attempt.readiness_status = 'INVALID_INPUT'
             AND attempt.scoring_disposition = 'INVALID_PROMPT_SOURCE'
         )
       ON CONFLICT (deduplication_key) DO NOTHING
       RETURNING id`,
      []
    );
    return result.rowCount || result.rows.length;
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT id FROM iig_ingestion_outbox
           WHERE event_type = 'INPUT_VALIDATION_REQUESTED'
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

  async loadAttempts(jobId) {
    const result = await this.db.query(
      `SELECT attempt.id AS attempt_id, attempt.submission_id, attempt.exam_version_id,
         attempt.exam_question_id, attempt.answer_text, attempt.readiness_status,
         attempt.validation_errors, attempt.ai_input,
         question.source_question_id, question.question_number,
         question.sort_order, question.scorer_type, question.title,
         COALESCE(NULLIF(BTRIM(question.question_text), ''), question_transcription.transcript) AS question_text,
         question.prompt_text,
         COALESCE(NULLIF(BTRIM(question.context_text), ''), context_transcription.transcript) AS context_text,
         section.section_type,
         catalog.source_mock_test_id,
         COALESCE((
           SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
             'id', asset.id, 'asset_role', asset.asset_role, 'asset_index', asset.asset_index,
             'is_required', asset.is_required, 'status', asset.status,
             'source_file_id', asset.source_file_id,
             'canonical_storage_provider', asset.canonical_storage_provider,
             'canonical_storage_bucket', asset.canonical_storage_bucket,
             'canonical_storage_key', asset.canonical_storage_key,
             'canonical_mime_type', asset.canonical_mime_type,
             'checksum_sha256', asset.checksum_sha256,
             'duration_seconds', asset.duration_seconds,
             'quality_metrics', asset.quality_metrics,
             'error_code', asset.error_code,
             'failure_origin', asset.failure_origin,
             'failure_class', asset.failure_class,
             'attempt_count', asset.attempt_count,
             'retry_exhausted', asset.retry_exhausted
           ) ORDER BY asset.asset_role, asset.asset_index)
           FROM iig_media_assets asset
           WHERE asset.question_attempt_id = attempt.id
              OR asset.exam_question_id = attempt.exam_question_id
         ), '[]'::jsonb) AS assets,
         COALESCE((
           SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
             'id', score_group.id, 'key', score_group.group_key,
             'name', score_group.name, 'minScore', score_group.min_score,
             'maxScore', score_group.max_score
           ) ORDER BY score_group.sort_order)
           FROM iig_exam_question_score_groups mapping
           JOIN iig_exam_score_groups score_group ON score_group.id = mapping.score_group_id
           WHERE mapping.question_id = question.id
         ), '[]'::jsonb) AS score_groups
       FROM iig_question_attempts attempt
       JOIN iig_submissions submission ON submission.id = attempt.submission_id
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       LEFT JOIN iig_exam_question_transcriptions question_transcription
         ON question_transcription.exam_question_id = question.id
        AND question_transcription.target_type = 'QUESTION'
        AND question_transcription.status = 'COMPLETED'
       LEFT JOIN iig_exam_question_transcriptions context_transcription
         ON context_transcription.exam_question_id = question.id
        AND context_transcription.target_type = 'CONTEXT'
        AND context_transcription.status = 'COMPLETED'
       JOIN iig_exam_sections section ON section.id = question.section_id
       JOIN iig_exam_versions version ON version.id = attempt.exam_version_id
       JOIN iig_exam_catalog catalog ON catalog.id = version.exam_id
       WHERE submission.scoring_job_id = $1
       ORDER BY question.sort_order`,
      [jobId]
    );
    return result.rows;
  }

  async completeValidation({ event, results }) {
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
        throw Object.assign(new Error('Validation job does not have a canonical submission.'), {
          code: 'IIG_SUBMISSION_MISSING', retryable: false,
        });
      }
      let pendingTranscriptions = 0;
      let transcriptionTasks = 0;
      for (const result of results) {
        const canonicalTasks = (result.aiInput?.transcriptionRequired || [])
          .filter(task => ['question', 'context'].includes(task.target));
        const persistedStatus = result.status === 'READY_FOR_AI' && canonicalTasks.length
          ? 'PENDING_TRANSCRIPTION'
          : result.status;
        await executor.query(
          `UPDATE iig_question_attempts SET readiness_status = $2::varchar,
             validation_errors = $3::jsonb, ai_input = $4::jsonb,
             scoring_disposition = $6::varchar, zero_reason = $7,
             zero_origin = $8, resolution_metadata = $9::jsonb,
             resolved_at = CURRENT_TIMESTAMP,
             processing_version = 'iig-ai-input-v2',
             ready_at = CASE WHEN $2::varchar = 'READY_FOR_AI' THEN CURRENT_TIMESTAMP ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND submission_id = $5`,
          [
            result.attemptId, persistedStatus, JSON.stringify(result.errors),
            result.aiInput ? JSON.stringify(result.aiInput) : null, submissionId,
            result.resolution?.scoringDisposition || 'NORMAL',
            result.resolution?.zeroReason || null,
            result.resolution?.zeroOrigin || null,
            JSON.stringify(result.resolution?.metadata || {}),
          ]
        );
        if (result.resolution?.scoringDisposition !== 'NORMAL') {
          const resolutionEvent = result.resolution.scoringDisposition === 'INVALID_PROMPT_SOURCE'
            ? 'QUESTION_SOURCE_INVALID'
            : (result.resolution.scoringDisposition === 'REVIEW_REQUIRED'
              ? 'QUESTION_REVIEW_REQUIRED'
              : 'QUESTION_ZERO_RESOLVED');
          await executor.query(
            `INSERT INTO iig_processing_events
               (scoring_job_id, submission_id, question_attempt_id, event_type,
                from_status, to_status, details)
             VALUES ($1, $2, $3, $4, 'VALIDATING', $5, $6::jsonb)`,
            [
              event.jobId, submissionId, result.attemptId, resolutionEvent, persistedStatus,
              JSON.stringify({
                scoringDisposition: result.resolution.scoringDisposition,
                zeroReason: result.resolution.zeroReason,
                zeroOrigin: result.resolution.zeroOrigin,
              }),
            ]
          );
        }
        if (persistedStatus === 'PENDING_TRANSCRIPTION') {
          for (const task of canonicalTasks) {
            const targetType = task.target.toUpperCase();
            const assetRole = `${targetType}_AUDIO`;
            const transcription = await executor.query(
              `INSERT INTO iig_exam_question_transcriptions
                 (exam_question_id, media_asset_id, target_type, status)
               SELECT attempt.exam_question_id, asset.id, $4, 'PENDING'
               FROM iig_question_attempts attempt
               JOIN iig_media_assets asset ON asset.exam_question_id = attempt.exam_question_id
               WHERE attempt.id = $1 AND attempt.submission_id = $2
                 AND asset.id = $3 AND asset.asset_role = $5
                 AND asset.status = 'READY'
               ON CONFLICT (exam_question_id, target_type) DO UPDATE SET
                 media_asset_id = EXCLUDED.media_asset_id,
                 status = CASE
                   WHEN iig_exam_question_transcriptions.status = 'COMPLETED'
                     THEN iig_exam_question_transcriptions.status
                   ELSE 'PENDING'
                 END,
                 error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
               RETURNING id`,
              [result.attemptId, submissionId, task.assetId, targetType, assetRole]
            );
            if (!transcription.rows[0]) {
              throw Object.assign(new Error(`${targetType} transcription asset is not ready or does not belong to the attempt.`), {
                code: 'IIG_CONTENT_TRANSCRIPTION_ASSET_INVALID', retryable: false,
              });
            }
            transcriptionTasks += 1;
          }
          pendingTranscriptions += 1;
        }
      }
      const ready = results.filter(result => result.status === 'READY_FOR_AI').length - pendingTranscriptions;
      const invalid = results.filter(result => result.status !== 'READY_FOR_AI').length;
      const jobStatus = pendingTranscriptions > 0
        ? 'TRANSCRIBING'
        : (ready > 0 ? 'READY_FOR_AI' : 'INVALID_INPUT');
      const submissionStatus = pendingTranscriptions > 0
        ? 'TRANSCRIBING'
        : (invalid > 0 ? 'COMPLETED_WITH_ISSUES' : 'READY_FOR_AI');
      const scoringGroups = eligibleScoringGroups(results, pendingTranscriptions);
      await executor.query(
        `UPDATE iig_submissions SET status = $2::varchar,
           ready_at = CASE WHEN $2::varchar = 'READY_FOR_AI' THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [submissionId, submissionStatus]
      );
      await speakingCompletionRepository.refreshBySubmission(executor, submissionId);
      await writingCompletionRepository.refreshBySubmission(executor, submissionId);
      await executor.query(
        `UPDATE iig_scoring_jobs SET status = $2::varchar, total_questions = $3,
           ready_questions = $4, invalid_questions = $5, pending_questions = $6,
           next_retry_at = NULL, error_code = NULL, error_message = NULL,
           completed_at = CASE
             WHEN $2::varchar IN ('READY_FOR_AI', 'INVALID_INPUT') THEN CURRENT_TIMESTAMP
             ELSE NULL
           END,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.jobId, jobStatus, results.length, ready, invalid, pendingTranscriptions]
      );
      if (pendingTranscriptions > 0) {
        await executor.query(
          `INSERT INTO iig_ingestion_outbox
             (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
           VALUES ('IIG_SCORING_JOB', $1, 'QUESTION_TRANSCRIPTION_REQUESTED', $2, $3::jsonb)
           ON CONFLICT (deduplication_key) DO NOTHING`,
          [
            event.jobId,
            `iig-scoring-job:${event.jobId}:question-transcription:v1`,
            JSON.stringify({ jobId: event.jobId, submissionId }),
          ]
        );
      }
      if (jobStatus === 'READY_FOR_AI' && scoringGroups.length) {
        await executor.query(
          `INSERT INTO iig_ingestion_outbox
             (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
           VALUES ('IIG_SCORING_JOB', $1, 'AI_SCORING_RUNS_REQUESTED', $2, $3::jsonb)
           ON CONFLICT (deduplication_key) DO NOTHING`,
          [
            event.jobId,
            `iig-scoring-job:${event.jobId}:ai-scoring-runs:v1`,
            JSON.stringify({ jobId: event.jobId, submissionId, groups: scoringGroups }),
          ]
        );
      }
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, submission_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'INPUT_VALIDATION_COMPLETED', 'VALIDATING', $3, $4::jsonb)`,
        [event.jobId, submissionId, jobStatus, JSON.stringify({
          totalQuestions: results.length, readyQuestions: ready, invalidQuestions: invalid,
          pendingTranscriptions, transcriptionTasks,
        })]
      );
      await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
           locked_at = NULL, locked_by = NULL, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id]
      );
      return {
        submissionId,
        status: jobStatus,
        readyQuestions: ready,
        invalidQuestions: invalid,
        pendingTranscriptions,
        scoringGroups,
      };
    });
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
         VALUES ($1, 'INPUT_VALIDATION_RETRY_SCHEDULED', 'VALIDATING', 'VALIDATING', $2::jsonb)`,
        [event.jobId, JSON.stringify({ code: error.code, attempt: event.publishAttempts, delayMs })]
      );
      return true;
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
        `INSERT INTO iig_processing_events
           (scoring_job_id, event_type, from_status, to_status, details)
         VALUES ($1, 'INPUT_VALIDATION_DEAD_LETTERED', 'VALIDATING', 'FAILED', $2::jsonb)`,
        [event.jobId, JSON.stringify({ code: error.code, attempt: event.publishAttempts })]
      );
      return true;
    });
  }
}

const repository = new InputValidationRepository();
repository.InputValidationRepository = InputValidationRepository;
repository.mapOutbox = mapOutbox;
repository.scoringGroup = scoringGroup;
repository.eligibleScoringGroups = eligibleScoringGroups;

module.exports = repository;
