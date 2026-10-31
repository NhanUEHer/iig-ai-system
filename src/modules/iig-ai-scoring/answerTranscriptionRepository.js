const db = require('../../config/db');
const { deduplicationKey } = require('./orchestratorRepository');

function mapOutbox(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.scoring_run_id,
    eventType: row.event_type,
    payload: row.payload || {},
    publishAttempts: Number(row.publish_attempts || 0),
    lockedBy: row.locked_by,
  };
}

function permanentError(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function mapTask(row) {
  if (!row) return null;
  return {
    runId: row.scoring_run_id,
    questionRunId: row.question_run_id,
    questionAttemptId: row.question_attempt_id,
    transcriptionId: row.transcription_id,
    transcriptionStatus: row.transcription_status,
    questionRunStatus: row.question_run_status,
    aiInput: row.ai_input,
    questionNumber: Number(row.question_number),
    scorerType: row.scorer_type,
    mediaAssetId: row.media_asset_id,
    storageProvider: row.canonical_storage_provider,
    storageBucket: row.canonical_storage_bucket,
    storageKey: row.canonical_storage_key,
    mimeType: row.canonical_mime_type,
    audioChecksum: row.audio_checksum_sha256,
  };
}

class AnswerTranscriptionRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    return this.db.transaction(async executor => {
      await executor.query(
        `UPDATE iig_ai_model_executions
         SET status = 'FAILED', error_code = 'IIG_AI_STT_LEASE_EXPIRED',
             error_message = 'Worker lease expired.', completed_at = CURRENT_TIMESTAMP
         WHERE stage = 'ANSWER_STT' AND status = 'PROCESSING'
           AND started_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')`,
        [staleMs]
      );
      await executor.query(
        `UPDATE iig_ai_answer_transcriptions
         SET status = 'FAILED', error_code = 'IIG_AI_STT_LEASE_EXPIRED',
             error_message = 'Worker lease expired.', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'PROCESSING'
           AND updated_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')`,
        [staleMs]
      );
      const events = await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
             available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
             updated_at = CURRENT_TIMESTAMP
         WHERE event_type = 'ANSWER_TRANSCRIPTION_REQUESTED' AND status = 'PROCESSING'
           AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
         RETURNING id`,
        [staleMs]
      );
      return events.rowCount || events.rows.length;
    });
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT id FROM iig_ai_scoring_outbox
           WHERE event_type = 'ANSWER_TRANSCRIPTION_REQUESTED'
             AND status IN ('PENDING', 'FAILED')
             AND available_at <= CURRENT_TIMESTAMP
           ORDER BY available_at, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE iig_ai_scoring_outbox event
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

  async claimBatchForNextSubmission(workerId, limit = 11) {
    const boundedLimit = Math.max(1, Math.min(11, Number.parseInt(limit, 10) || 11));
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate_submission AS (
           SELECT scoring_run.submission_id
           FROM iig_ai_scoring_outbox event
           JOIN iig_ai_scoring_runs scoring_run ON scoring_run.id = event.scoring_run_id
           WHERE event.event_type = 'ANSWER_TRANSCRIPTION_REQUESTED'
             AND event.status IN ('PENDING', 'FAILED')
             AND event.available_at <= CURRENT_TIMESTAMP
           ORDER BY event.available_at, event.created_at
           FOR UPDATE OF event SKIP LOCKED
           LIMIT 1
         ), candidates AS (
           SELECT event.id
           FROM iig_ai_scoring_outbox event
           JOIN iig_ai_scoring_runs scoring_run ON scoring_run.id = event.scoring_run_id
           JOIN candidate_submission selected
             ON selected.submission_id = scoring_run.submission_id
           WHERE event.event_type = 'ANSWER_TRANSCRIPTION_REQUESTED'
             AND event.status IN ('PENDING', 'FAILED')
             AND event.available_at <= CURRENT_TIMESTAMP
           ORDER BY event.available_at, event.created_at
           FOR UPDATE OF event SKIP LOCKED
           LIMIT $2
         )
         UPDATE iig_ai_scoring_outbox event
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $1,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         FROM candidates
         WHERE event.id = candidates.id
         RETURNING event.*`,
        [workerId, boundedLimit]
      );
      return result.rows.map(mapOutbox);
    });
  }

  async loadTask(event) {
    const payload = event.payload || {};
    const result = await this.db.query(
      `SELECT question_run.scoring_run_id, question_run.id AS question_run_id,
              question_run.question_attempt_id, question_run.status AS question_run_status,
              transcription.id AS transcription_id,
              transcription.status AS transcription_status,
              attempt.ai_input, question.question_number, question.scorer_type,
              media.id AS media_asset_id, media.canonical_storage_provider,
              media.canonical_storage_bucket, media.canonical_storage_key,
              media.canonical_mime_type,
              media.checksum_sha256 AS audio_checksum_sha256
       FROM iig_ai_question_runs question_run
       JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       JOIN iig_ai_answer_transcriptions transcription
         ON transcription.id = question_run.transcription_id
       JOIN iig_media_assets media ON media.id = transcription.media_asset_id
       JOIN iig_ai_scoring_runs scoring_run ON scoring_run.id = question_run.scoring_run_id
       WHERE question_run.id = $1 AND transcription.id = $2
         AND question_run.scoring_run_id = $3
         AND question_run.question_attempt_id = $4
         AND media.id = $5
         AND media.status = 'READY'
         AND scoring_run.status IN ('TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS')`,
      [
        payload.questionRunId,
        payload.transcriptionId,
        event.runId,
        payload.questionAttemptId,
        payload.mediaAssetId,
      ]
    );
    const task = mapTask(result.rows[0]);
    if (!task) {
      throw permanentError(
        'Answer STT event does not resolve to one ready transcription task.',
        'IIG_AI_STT_TASK_NOT_FOUND'
      );
    }
    if (!task.storageKey || !task.audioChecksum) {
      throw permanentError(
        'Answer STT task has no checksum-addressed canonical audio.',
        'IIG_AI_STT_AUDIO_NOT_READY'
      );
    }
    return task;
  }

  async startTask({ event, task, config, requestHash }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
         FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return { started: false, reason: 'LEASE_LOST' };

      const state = await executor.query(
        `SELECT transcription.status AS transcription_status,
                question_run.status AS question_run_status
         FROM iig_ai_answer_transcriptions transcription
         JOIN iig_ai_question_runs question_run ON question_run.transcription_id = transcription.id
         WHERE transcription.id = $1 AND question_run.id = $2
         FOR UPDATE OF transcription, question_run`,
        [task.transcriptionId, task.questionRunId]
      );
      const current = state.rows[0];
      if (!current) {
        throw permanentError('Answer STT task disappeared before processing.', 'IIG_AI_STT_TASK_NOT_FOUND');
      }
      if (current.transcription_status === 'COMPLETED'
        || current.transcription_status === 'REVIEW'
        || current.question_run_status !== 'TRANSCRIBING') {
        await executor.query(
          `UPDATE iig_ai_scoring_outbox
           SET status = 'PUBLISHED', published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
               locked_at = NULL, locked_by = NULL, last_error = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [event.id]
        );
        return { started: false, reason: 'TASK_ALREADY_TERMINAL' };
      }

      await executor.query(
        `UPDATE iig_ai_answer_transcriptions
         SET status = 'PROCESSING', attempt_count = attempt_count + 1,
             error_code = NULL, error_message = NULL,
             started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [task.transcriptionId]
      );
      const execution = await executor.query(
        `INSERT INTO iig_ai_model_executions
           (scoring_run_id, question_run_id, stage, provider, model_name,
            model_version, prompt_version, request_hash, status)
         VALUES ($1, $2, 'ANSWER_STT', $3, $4, $5, $6, $7, 'PROCESSING')
         RETURNING id`,
        [
          task.runId,
          task.questionRunId,
          config.provider,
          config.modelName,
          config.modelVersion,
          config.promptVersion,
          requestHash,
        ]
      );
      return { started: true, modelExecutionId: execution.rows[0].id };
    });
  }

  async completeTask({ event, task, modelExecutionId, providerResult, responseHash, featureVersion }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
         FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return { completed: false, reason: 'LEASE_LOST' };

      const { result, outcome, usage = {} } = providerResult;
      const lineageOutput = {
        providerRunId: providerResult.providerRunId,
        taskId: providerResult.taskId,
        workflowStatus: providerResult.workflowStatus,
        usage,
      };
      const rawOutput = providerResult.rawOutput
        ? { ...providerResult.rawOutput, lineage: lineageOutput }
        : lineageOutput;
      const parsedOutput = providerResult.parsedOutput || {
        schemaVersion: result.schemaVersion,
        status: result.status,
        transcript: result.transcript,
        detectedLanguage: result.detectedLanguage,
        speechDetected: result.speechDetected,
        confidence: result.confidence,
        flags: result.flags,
      };
      const latencyMs = usage.elapsedTime == null ? null : Math.max(0, Math.round(usage.elapsedTime * 1000));
      const totalPrice = Number(usage.totalPrice);
      const estimatedCost = Number.isFinite(totalPrice) && totalPrice >= 0
        && (!usage.currency || String(usage.currency).toUpperCase() === 'USD')
        ? totalPrice
        : null;
      await executor.query(
        `UPDATE iig_ai_model_executions
         SET status = 'COMPLETED', response_hash = $2,
             input_tokens = $3, output_tokens = $4, latency_ms = $5,
             estimated_cost_usd = $6, provider_request_id = $7,
             raw_output = $8::jsonb, parsed_output = $9::jsonb,
             error_code = NULL, error_message = NULL,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING'`,
        [
          modelExecutionId,
          responseHash,
          Math.max(0, Number(usage.inputTokens) || 0),
          Math.max(0, Number(usage.outputTokens) || 0),
          latencyMs,
          estimatedCost,
          providerResult.providerRunId || null,
          JSON.stringify(rawOutput),
          JSON.stringify(parsedOutput),
        ]
      );

      let questionStatus;
      let transcriptionStatus;
      const upstreamZeroStatus = [
        'READ_TEXT_ALOUD',
        'DESCRIBE_PICTURE',
        'RESPOND_TO_QUESTIONS',
        'RESPOND_USING_INFORMATION',
        'EXPRESS_AN_OPINION',
      ].includes(task.scorerType)
        && [
          'NO_SPEECH',
          'WRONG_LANGUAGE_VI',
          'WRONG_LANGUAGE_OTHER',
          'UNINTELLIGIBLE',
        ].includes(result.status)
        ? result.status
        : null;
      const upstreamZeroReason = upstreamZeroStatus === 'UNINTELLIGIBLE'
        ? 'NO_SPEECH'
        : upstreamZeroStatus;
      if (outcome.action === 'CONTINUE') {
        questionStatus = 'EXTRACTING_FEATURES';
        transcriptionStatus = 'COMPLETED';
      } else if (upstreamZeroReason) {
        questionStatus = 'LLM_SCORING';
        transcriptionStatus = 'REVIEW';
      } else if (outcome.action === 'INVALID_AUDIO') {
        questionStatus = 'INVALID_AUDIO';
        transcriptionStatus = 'REVIEW';
      } else if (outcome.action === 'REVIEW_REQUIRED') {
        questionStatus = 'REVIEW_REQUIRED';
        transcriptionStatus = 'REVIEW';
      } else {
        throw permanentError('Non-terminal STT outcome cannot be completed.', 'IIG_AI_STT_OUTCOME_INVALID');
      }

      await executor.query(
        `UPDATE iig_ai_answer_transcriptions
         SET status = $2, transcript = $3, language_code = $4,
             confidence = $5, provider_metadata = $6::jsonb,
             error_code = $7, error_message = $8,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING'`,
        [
          task.transcriptionId,
          transcriptionStatus,
          transcriptionStatus === 'COMPLETED' ? result.transcript : null,
          result.detectedLanguage,
          result.confidence,
          JSON.stringify({
            providerRunId: providerResult.providerRunId,
            taskId: providerResult.taskId,
            workflowStatus: providerResult.workflowStatus,
            evidenceSchemaVersion: providerResult.rawOutput?.schemaVersion || null,
            flags: result.flags,
            status: result.status,
          }),
          transcriptionStatus === 'REVIEW' ? result.status : null,
          transcriptionStatus === 'REVIEW' ? `Answer STT returned ${result.status}.` : null,
        ]
      );

      let upstreamZeroFeatureSetId = null;
      if (upstreamZeroReason) {
        const featureSet = await executor.query(
          `INSERT INTO iig_ai_feature_sets
             (question_attempt_id, transcription_id, status, feature_version,
              input_fingerprint, features)
           VALUES ($1, $2, 'READY', $3, $4, $5::jsonb)
           ON CONFLICT ON CONSTRAINT uq_iig_ai_feature_sets_input
           DO UPDATE SET status = 'READY', features = EXCLUDED.features,
                         error_code = NULL, error_message = NULL,
                         updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [
            task.questionAttemptId,
            task.transcriptionId,
            featureVersion,
            responseHash,
            JSON.stringify({
              schemaVersion: 2,
              featureVersion,
              scorerType: task.scorerType,
              completion: {
                deterministic: 'READY',
                speech: 'NOT_REQUIRED',
                taskSemantic: 'NOT_REQUIRED',
              },
              upstreamZeroReason,
            }),
          ]
        );
        upstreamZeroFeatureSetId = featureSet.rows[0].id;
      }
      await executor.query(
        `UPDATE iig_ai_question_runs
         SET status = $2::varchar(32), flags = $3::jsonb,
             feature_set_id = COALESCE($6::uuid, feature_set_id),
             scoring_disposition = CASE WHEN $7::text IS NOT NULL
               THEN 'ZERO_CANDIDATE' ELSE scoring_disposition END,
             zero_reason = COALESCE($7::text, zero_reason),
             zero_origin = CASE WHEN $7::text IS NOT NULL
               THEN 'CANDIDATE' ELSE zero_origin END,
             resolution_metadata = CASE WHEN $7::text IS NOT NULL
               THEN COALESCE(resolution_metadata, '{}'::jsonb)
                    || jsonb_build_object('answerSttStatus', $8::text)
               ELSE resolution_metadata END,
             error_code = $4, error_message = $5,
             completed_at = CASE WHEN $2::varchar(32) IN ('INVALID_AUDIO', 'REVIEW_REQUIRED')
               THEN CURRENT_TIMESTAMP ELSE completed_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'TRANSCRIBING'`,
        [
          task.questionRunId,
          questionStatus,
          JSON.stringify(result.flags || []),
          (questionStatus === 'EXTRACTING_FEATURES' || upstreamZeroReason) ? null : result.status,
          (questionStatus === 'EXTRACTING_FEATURES' || upstreamZeroReason)
            ? null
            : `Answer STT returned ${result.status}.`,
          upstreamZeroFeatureSetId,
          upstreamZeroReason,
          upstreamZeroStatus,
        ]
      );

      if (outcome.action === 'CONTINUE') {
        await executor.query(
          `INSERT INTO iig_ai_scoring_outbox
             (scoring_run_id, event_type, deduplication_key, payload)
           VALUES ($1, 'FEATURE_EXTRACTION_REQUESTED', $2, $3::jsonb)
           ON CONFLICT (deduplication_key) DO NOTHING`,
          [
            task.runId,
            deduplicationKey(`iig-ai-question-run:${task.questionRunId}:features`, {
              featureVersion,
              transcriptionId: task.transcriptionId,
            }),
            JSON.stringify({
              scoringRunId: task.runId,
              questionRunId: task.questionRunId,
              questionAttemptId: task.questionAttemptId,
              transcriptionId: task.transcriptionId,
              featureVersion,
            }),
          ]
        );
      } else if (upstreamZeroReason) {
        await executor.query(
          `INSERT INTO iig_ai_scoring_outbox
             (scoring_run_id, event_type, deduplication_key, payload)
           VALUES ($1, 'QUESTION_SCORING_REQUESTED', $2, $3::jsonb)
           ON CONFLICT (deduplication_key) DO NOTHING`,
          [
            task.runId,
            deduplicationKey(`iig-ai-question-run:${task.questionRunId}:score`, {
              featureSetId: upstreamZeroFeatureSetId,
              featureVersion,
              upstreamZeroReason,
            }),
            JSON.stringify({
              scoringRunId: task.runId,
              questionRunId: task.questionRunId,
              featureSetId: upstreamZeroFeatureSetId,
              upstreamZeroReason,
            }),
          ]
        );
      }

      await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
             locked_at = NULL, locked_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id]
      );
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, question_run_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'ANSWER_TRANSCRIPTION_COMPLETED', 'TRANSCRIBING', $3, $4::jsonb)`,
        [
          task.runId,
          task.questionRunId,
          questionStatus,
          JSON.stringify({
            transcriptionId: task.transcriptionId,
            providerRunId: providerResult.providerRunId,
            outputStatus: result.status,
          }),
        ]
      );
      await executor.query(
        `UPDATE iig_ai_scoring_runs scoring_run
         SET status = CASE
               WHEN EXISTS (
                 SELECT 1 FROM iig_ai_question_runs question_run
                 WHERE question_run.scoring_run_id = scoring_run.id
                   AND question_run.status = 'TRANSCRIBING'
               ) THEN 'TRANSCRIBING'
               WHEN EXISTS (
                 SELECT 1 FROM iig_ai_question_runs question_run
                 WHERE question_run.scoring_run_id = scoring_run.id
                   AND question_run.status IN ('EXTRACTING_FEATURES', 'EVIDENCE_PENDING')
               ) THEN 'EXTRACTING_FEATURES'
               WHEN EXISTS (
                 SELECT 1 FROM iig_ai_question_runs question_run
                 WHERE question_run.scoring_run_id = scoring_run.id
                   AND question_run.status = 'LLM_SCORING'
               ) THEN 'SCORING_QUESTIONS'
               WHEN EXISTS (
                 SELECT 1 FROM iig_ai_question_runs question_run
                 WHERE question_run.scoring_run_id = scoring_run.id
                   AND question_run.status = 'REVIEW_REQUIRED'
               ) THEN 'REVIEW_REQUIRED'
               ELSE 'EXTRACTING_FEATURES'
             END,
             review_questions = (
               SELECT COUNT(*) FROM iig_ai_question_runs question_run
               WHERE question_run.scoring_run_id = scoring_run.id
                 AND question_run.status = 'REVIEW_REQUIRED'
             ),
             failed_questions = (
               SELECT COUNT(*) FROM iig_ai_question_runs question_run
               WHERE question_run.scoring_run_id = scoring_run.id
                 AND question_run.status IN ('FAILED', 'INVALID_AUDIO')
             ),
             updated_at = CURRENT_TIMESTAMP
         WHERE scoring_run.id = $1`,
        [task.runId]
      );
      return { completed: true, questionStatus, outputStatus: result.status };
    });
  }

  async markRetry({ event, task, modelExecutionId, error, delayMs }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      if (modelExecutionId) {
        await executor.query(
          `UPDATE iig_ai_model_executions
           SET status = 'FAILED', error_code = $2, error_message = $3,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'PROCESSING'`,
          [modelExecutionId, error.code, String(error.message).slice(0, 2000)]
        );
      }
      if (task?.transcriptionId) {
        await executor.query(
          `UPDATE iig_ai_answer_transcriptions
           SET status = 'FAILED', error_code = $2, error_message = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status IN ('PENDING', 'PROCESSING', 'FAILED')`,
          [task.transcriptionId, error.code, String(error.message).slice(0, 2000)]
        );
      }
      await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'FAILED', available_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
             locked_at = NULL, locked_by = NULL, last_error = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id, delayMs, String(error.message).slice(0, 2000)]
      );
      return true;
    });
  }

  async markDeadLetter({ event, task, modelExecutionId, error }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      if (modelExecutionId) {
        await executor.query(
          `UPDATE iig_ai_model_executions
           SET status = 'FAILED', error_code = $2, error_message = $3,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'PROCESSING'`,
          [modelExecutionId, error.code, String(error.message).slice(0, 2000)]
        );
      }
      if (task?.transcriptionId) {
        await executor.query(
          `UPDATE iig_ai_answer_transcriptions
           SET status = 'FAILED', error_code = $2, error_message = $3,
               completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [task.transcriptionId, error.code, String(error.message).slice(0, 2000)]
        );
      }
      if (task?.questionRunId) {
        await executor.query(
          `UPDATE iig_ai_question_runs
           SET status = 'FAILED', error_code = $2, error_message = $3,
               completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [task.questionRunId, error.code, String(error.message).slice(0, 2000)]
        );
      }
      await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'DEAD_LETTER', locked_at = NULL, locked_by = NULL,
             last_error = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_ai_scoring_runs
         SET status = 'FAILED', failed_questions = GREATEST(failed_questions, 1),
             error_code = $2, error_message = $3,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status IN ('TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS')`,
        [event.runId, error.code, String(error.message).slice(0, 2000)]
      );
      return true;
    });
  }
}

const repository = new AnswerTranscriptionRepository();
repository.AnswerTranscriptionRepository = AnswerTranscriptionRepository;
repository.mapOutbox = mapOutbox;
repository.mapTask = mapTask;
repository.permanentError = permanentError;

module.exports = repository;
