const db = require('../../config/db');
const { deduplicationKey } = require('./orchestratorRepository');
const { mergeEvidence } = require('./evidenceResultMerger');

const EVENT_BY_STAGE = Object.freeze({
  SPEECH_EVIDENCE: 'SPEECH_EVIDENCE_REQUESTED',
  TASK_EVIDENCE: 'TASK_EVIDENCE_REQUESTED',
});

function permanentError(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function mapEvent(row) {
  return row ? {
    id: row.id,
    runId: row.scoring_run_id,
    eventType: row.event_type,
    payload: row.payload || {},
    publishAttempts: Number(row.publish_attempts || 0),
    lockedBy: row.locked_by,
  } : null;
}

function mapTask(row) {
  return row ? {
    runId: row.scoring_run_id,
    questionRunId: row.question_run_id,
    questionAttemptId: row.question_attempt_id,
    featureSetId: row.feature_set_id,
    featureVersion: row.feature_version,
    features: row.features,
    aiInput: row.ai_input,
    scorerType: row.scorer_type,
    transcript: row.transcript,
    answerSttRawOutput: row.answer_stt_raw_output || null,
    answerSttProviderRequestId: row.answer_stt_provider_request_id || null,
  } : null;
}

class EvidenceWorkerRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(stage, staleMs) {
    const eventType = EVENT_BY_STAGE[stage];
    const result = await this.db.query(
      `UPDATE iig_ai_scoring_outbox
       SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
           available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
           updated_at = CURRENT_TIMESTAMP
       WHERE event_type = $1 AND status = 'PROCESSING'
         AND locked_at < CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond')
       RETURNING id`,
      [eventType, staleMs]
    );
    return result.rowCount || result.rows.length;
  }

  async claimNext(stage, workerId, options = {}) {
    const eventType = EVENT_BY_STAGE[stage];
    if (!eventType) throw permanentError('Unsupported evidence stage.', 'IIG_AI_EVIDENCE_STAGE_UNSUPPORTED');
    const scorerTypes = Array.isArray(options.scorerTypes) && options.scorerTypes.length
      ? options.scorerTypes.map(value => String(value).trim().toUpperCase()).filter(Boolean)
      : null;
    const evidenceContractVersion = String(options.evidenceContractVersion || '').trim() || null;
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT id FROM iig_ai_scoring_outbox
           WHERE event_type = $1 AND status IN ('PENDING', 'FAILED')
             AND available_at <= CURRENT_TIMESTAMP
             AND ($3::text[] IS NULL OR payload->>'scorerType' = ANY($3::text[]))
             AND ($4::text IS NULL OR payload->>'evidenceContractVersion' = $4::text)
           ORDER BY available_at, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE iig_ai_scoring_outbox event
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $2,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         FROM candidate WHERE event.id = candidate.id
         RETURNING event.*`,
        [eventType, workerId, scorerTypes, evidenceContractVersion]
      );
      return mapEvent(result.rows[0]);
    });
  }

  async loadTask(event, stage) {
    if (event.eventType !== EVENT_BY_STAGE[stage]) {
      throw permanentError('Evidence event type does not match worker stage.', 'IIG_AI_EVIDENCE_EVENT_MISMATCH');
    }
    const payload = event.payload || {};
    const result = await this.db.query(
      `SELECT question_run.scoring_run_id, question_run.id AS question_run_id,
              question_run.question_attempt_id, question_run.feature_set_id,
              feature_set.feature_version, feature_set.features,
              attempt.ai_input, question.scorer_type, transcription.transcript,
              answer_execution.raw_output AS answer_stt_raw_output,
              answer_execution.provider_request_id AS answer_stt_provider_request_id
       FROM iig_ai_question_runs question_run
       JOIN iig_ai_feature_sets feature_set ON feature_set.id = question_run.feature_set_id
       JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       LEFT JOIN iig_ai_answer_transcriptions transcription
         ON transcription.id = question_run.transcription_id
       LEFT JOIN LATERAL (
         SELECT execution.raw_output, execution.provider_request_id
         FROM iig_ai_model_executions execution
         WHERE execution.question_run_id = question_run.id
           AND execution.stage = 'ANSWER_STT'
           AND execution.status = 'COMPLETED'
         ORDER BY execution.created_at DESC
         LIMIT 1
       ) answer_execution ON TRUE
       WHERE question_run.id = $1 AND question_run.scoring_run_id = $2
         AND question_run.question_attempt_id = $3 AND feature_set.id = $4
         AND question_run.status = 'EXTRACTING_FEATURES'
         AND feature_set.status IN ('PENDING', 'PROCESSING')`,
      [payload.questionRunId, event.runId, payload.questionAttemptId, payload.featureSetId]
    );
    const task = mapTask(result.rows[0]);
    if (!task) throw permanentError('Evidence task is not active.', 'IIG_AI_EVIDENCE_TASK_NOT_FOUND');
    const activeContract = task.features?.evidenceContract?.contractVersion || null;
    if (!activeContract || payload.evidenceContractVersion !== activeContract) {
      throw permanentError('Evidence contract version does not match feature set.', 'IIG_AI_EVIDENCE_CONTRACT_MISMATCH');
    }
    return task;
  }

  async startExecution({ event, task, stage, lineage, requestHash }) {
    const result = await this.db.query(
      `INSERT INTO iig_ai_model_executions
         (scoring_run_id, question_run_id, stage, provider, model_name,
          model_version, prompt_version, request_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PROCESSING')
       RETURNING id`,
      [
        task.runId,
        task.questionRunId,
        stage,
        lineage.provider,
        lineage.modelName,
        lineage.modelVersion || null,
        lineage.promptVersion || null,
        requestHash,
      ]
    );
    return result.rows[0]?.id;
  }

  async completeTask({ event, task, stage, executionId, providerResult, normalizedEvidence }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) {
        await executor.query(
          `UPDATE iig_ai_model_executions
           SET status = 'CANCELLED', error_code = 'IIG_AI_EVIDENCE_LEASE_LOST',
               error_message = 'Evidence event lease was lost before completion.',
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'PROCESSING'`,
          [executionId]
        );
        return { completed: false, reason: 'LEASE_LOST' };
      }
      const featureResult = await executor.query(
        `SELECT status, features FROM iig_ai_feature_sets
         WHERE id = $1 AND question_attempt_id = $2 FOR UPDATE`,
        [task.featureSetId, task.questionAttemptId]
      );
      if (!featureResult.rows[0]) {
        throw permanentError('Feature set no longer exists.', 'IIG_AI_EVIDENCE_FEATURE_SET_NOT_FOUND');
      }
      const merged = mergeEvidence(featureResult.rows[0].features, stage, normalizedEvidence);
      await executor.query(
        `UPDATE iig_ai_feature_sets
         SET features = $2::jsonb, status = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [task.featureSetId, JSON.stringify(merged.features), merged.ready ? 'READY' : 'PENDING']
      );
      await executor.query(
        `UPDATE iig_ai_model_executions
         SET status = 'COMPLETED', response_hash = $2, raw_output = $3::jsonb,
             parsed_output = $4::jsonb, input_tokens = $5, output_tokens = $6,
             cached_tokens = $7, latency_ms = $8, estimated_cost_usd = $9,
             provider_request_id = $10, completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING'`,
        [
          executionId,
          providerResult.responseHash || null,
          JSON.stringify(providerResult.output || {}),
          JSON.stringify(normalizedEvidence),
          Number(providerResult.usage?.inputTokens || 0),
          Number(providerResult.usage?.outputTokens || 0),
          Number(providerResult.usage?.cachedTokens || 0),
          providerResult.latencyMs ?? null,
          providerResult.estimatedCostUsd ?? null,
          providerResult.providerRequestId || null,
        ]
      );
      if (merged.ready) await this.publishScoring(executor, task);
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, question_run_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, $3, 'EXTRACTING_FEATURES', $4, $5::jsonb)`,
        [
          task.runId,
          task.questionRunId,
          `${stage}_COMPLETED`,
          merged.ready ? 'LLM_SCORING' : 'EXTRACTING_FEATURES',
          JSON.stringify({ featureSetId: task.featureSetId, executionId, ready: merged.ready }),
        ]
      );
      await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
             locked_at = NULL, locked_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id]
      );
      return { completed: true, ready: merged.ready, featureSetId: task.featureSetId };
    });
  }

  async publishScoring(executor, task) {
    await executor.query(
      `UPDATE iig_ai_question_runs SET status = 'LLM_SCORING', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'EXTRACTING_FEATURES'`,
      [task.questionRunId]
    );
    await executor.query(
      `INSERT INTO iig_ai_scoring_outbox
         (scoring_run_id, event_type, deduplication_key, payload)
       VALUES ($1, 'QUESTION_SCORING_REQUESTED', $2, $3::jsonb)
       ON CONFLICT (deduplication_key) DO NOTHING`,
      [
        task.runId,
        deduplicationKey(`iig-ai-question-run:${task.questionRunId}:score`, {
          featureSetId: task.featureSetId,
          featureVersion: task.featureVersion,
        }),
        JSON.stringify({
          scoringRunId: task.runId,
          questionRunId: task.questionRunId,
          featureSetId: task.featureSetId,
        }),
      ]
    );
  }

  async markRetry({ event, task, executionId, error, delayMs }) {
    return this.failEvent({ event, task, executionId, error, status: 'FAILED', delayMs });
  }

  async markDeadLetter({ event, task, executionId, error }) {
    return this.failEvent({ event, task, executionId, error, status: 'DEAD_LETTER', delayMs: null });
  }

  async failEvent({ event, task, executionId, error, status, delayMs }) {
    return this.db.transaction(async executor => {
      const failedEvent = await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = $2, available_at = CASE WHEN $3::bigint IS NULL THEN available_at
               ELSE CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond') END,
             locked_at = NULL, locked_by = NULL, last_error = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $5`,
        [event.id, status, delayMs, String(error.message).slice(0, 2000), event.lockedBy]
      );
      if (!failedEvent.rowCount) return false;
      if (executionId) {
        await executor.query(
          `UPDATE iig_ai_model_executions
           SET status = 'FAILED', error_code = $2, error_message = $3,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'PROCESSING'`,
          [executionId, error.code, String(error.message).slice(0, 2000)]
        );
      }
      if (status === 'DEAD_LETTER' && task?.questionRunId) {
        await executor.query(
          `UPDATE iig_ai_feature_sets
           SET status = 'FAILED', error_code = $2, error_message = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status IN ('PENDING', 'PROCESSING')`,
          [task.featureSetId, error.code, String(error.message).slice(0, 2000)]
        );
        await executor.query(
          `UPDATE iig_ai_question_runs
           SET status = 'FAILED', error_code = $2, error_message = $3,
               completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'EXTRACTING_FEATURES'`,
          [task.questionRunId, error.code, String(error.message).slice(0, 2000)]
        );
        await executor.query(
          `INSERT INTO iig_ai_scoring_events
             (scoring_run_id, question_run_id, event_type, from_status, to_status, details)
           VALUES ($1, $2, $3, 'EXTRACTING_FEATURES', 'FAILED', $4::jsonb)`,
          [
            task.runId,
            task.questionRunId,
            `${event.eventType}_DEAD_LETTERED`,
            JSON.stringify({ code: error.code, attempt: event.publishAttempts, executionId }),
          ]
        );
      }
      return true;
    });
  }
}

const repository = new EvidenceWorkerRepository();
repository.EvidenceWorkerRepository = EvidenceWorkerRepository;
repository.EVENT_BY_STAGE = EVENT_BY_STAGE;
repository.mapEvent = mapEvent;
repository.mapTask = mapTask;

module.exports = repository;
