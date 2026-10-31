const db = require('../../config/db');
const writingCompletionRepository = require('./writingCompletionRepository');

const EVENT_TYPE = 'GROUP_SCORING_REQUESTED';
const AGGREGATION_PREFIX = 'write-sentence-q1-q5-';

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
    groupResultId: row.group_result_id,
    scoreGroupId: row.score_group_id,
    aggregationVersion: row.aggregation_version,
    questionScores: row.question_scores || {},
    keycode: row.keycode,
  } : null;
}

class WritingQ1Q5GroupScoringRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    return this.db.transaction(async executor => {
      await executor.query(
        `UPDATE iig_ai_model_executions
         SET status = 'FAILED', error_code = 'IIG_AI_WRITE_SENTENCE_GROUP_LEASE_EXPIRED',
             error_message = 'Worker lease expired.', completed_at = CURRENT_TIMESTAMP
         WHERE stage = 'GROUP_CALIBRATION' AND status = 'PROCESSING'
           AND started_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
           AND EXISTS (
             SELECT 1 FROM iig_ai_group_results group_result
             WHERE group_result.id = iig_ai_model_executions.group_result_id
               AND group_result.aggregation_version LIKE $2
           )`,
        [staleMs, `${AGGREGATION_PREFIX}%`]
      );
      await executor.query(
        `UPDATE iig_ai_group_results group_result
         SET status = 'WAITING', error_code = NULL, error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE status = 'AGGREGATING' AND aggregation_version LIKE $3
           AND EXISTS (
             SELECT 1 FROM iig_ai_scoring_outbox event
             WHERE event.scoring_run_id = group_result.scoring_run_id
               AND (event.payload->>'groupResultId')::uuid = group_result.id
               AND event.event_type = $1 AND event.status = 'PROCESSING'
               AND event.locked_at < CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond')
           )`,
        [EVENT_TYPE, staleMs, `${AGGREGATION_PREFIX}%`]
      );
      const result = await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
             available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
             updated_at = CURRENT_TIMESTAMP
         WHERE event_type = $1 AND status = 'PROCESSING'
           AND locked_at < CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond')
           AND EXISTS (
             SELECT 1 FROM iig_ai_group_results group_result
             WHERE group_result.id = (iig_ai_scoring_outbox.payload->>'groupResultId')::uuid
               AND group_result.aggregation_version LIKE $3
           )
         RETURNING id`,
        [EVENT_TYPE, staleMs, `${AGGREGATION_PREFIX}%`]
      );
      return result.rowCount || result.rows.length;
    });
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT event.id
           FROM iig_ai_scoring_outbox event
           JOIN iig_ai_group_results group_result
             ON group_result.id = (event.payload->>'groupResultId')::uuid
            AND group_result.scoring_run_id = event.scoring_run_id
           WHERE event.event_type = $1
             AND event.status IN ('PENDING', 'FAILED')
             AND event.available_at <= CURRENT_TIMESTAMP
             AND group_result.status = 'WAITING'
             AND group_result.aggregation_version LIKE $3
           ORDER BY event.available_at, event.created_at
           FOR UPDATE OF event SKIP LOCKED
           LIMIT 1
         )
         UPDATE iig_ai_scoring_outbox event
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $2,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         FROM candidate WHERE event.id = candidate.id
         RETURNING event.*`,
        [EVENT_TYPE, workerId, `${AGGREGATION_PREFIX}%`]
      );
      return mapEvent(result.rows[0]);
    });
  }

  async loadTask(event) {
    const groupResultId = event.payload?.groupResultId;
    const result = await this.db.query(
      `SELECT group_result.scoring_run_id, group_result.id AS group_result_id,
              group_result.score_group_id, group_result.aggregation_version,
              group_result.question_scores, submission.keycode
       FROM iig_ai_group_results group_result
       JOIN iig_ai_scoring_runs scoring_run ON scoring_run.id = group_result.scoring_run_id
       JOIN iig_submissions submission ON submission.id = scoring_run.submission_id
       WHERE group_result.id = $1 AND group_result.scoring_run_id = $2
         AND group_result.status = 'WAITING'
         AND group_result.aggregation_version LIKE $3
         AND scoring_run.status IN ('SCORING_QUESTIONS', 'AGGREGATING_GROUPS')`,
      [groupResultId, event.runId, `${AGGREGATION_PREFIX}%`]
    );
    const task = mapTask(result.rows[0]);
    if (!task) {
      throw permanentError(
        'Writing Q1-Q5 group event does not resolve to one waiting group.',
        'IIG_AI_WRITE_SENTENCE_GROUP_TASK_NOT_FOUND'
      );
    }
    const ids = Object.keys(task.questionScores).sort();
    if (ids.length !== 5 || ids.some((id, index) => id !== `w_q${index + 1}`)) {
      throw permanentError(
        'Writing Q1-Q5 group requires exactly the locked w_q1 through w_q5 scores.',
        'IIG_AI_WRITE_SENTENCE_GROUP_INPUT_INVALID'
      );
    }
    return task;
  }

  async startTask({ event, task, lineage, requestHash }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return { started: false, reason: 'LEASE_LOST' };
      const state = await executor.query(
        `UPDATE iig_ai_group_results
         SET status = 'AGGREGATING', error_code = NULL, error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND scoring_run_id = $2 AND status = 'WAITING'
         RETURNING id`,
        [task.groupResultId, task.runId]
      );
      if (!state.rows[0]) {
        await executor.query(
          `UPDATE iig_ai_scoring_outbox
           SET status = 'PUBLISHED', published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
               locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [event.id]
        );
        return { started: false, reason: 'GROUP_ALREADY_TERMINAL' };
      }
      const execution = await executor.query(
        `INSERT INTO iig_ai_model_executions
           (scoring_run_id, group_result_id, stage, provider, model_name,
            model_version, prompt_version, request_hash, status)
         VALUES ($1, $2, 'GROUP_CALIBRATION', $3, $4, $5, $6, $7, 'PROCESSING')
         RETURNING id`,
        [
          task.runId, task.groupResultId, lineage.provider, lineage.modelName,
          lineage.modelVersion, lineage.promptVersion, requestHash,
        ]
      );
      return { started: true, modelExecutionId: execution.rows[0].id };
    });
  }

  async completeTask({ event, task, modelExecutionId, providerResult, responseHash }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) {
        await executor.query(
          `UPDATE iig_ai_model_executions SET status = 'CANCELLED',
             error_code = 'IIG_AI_WRITE_SENTENCE_GROUP_LEASE_LOST', completed_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'PROCESSING'`,
          [modelExecutionId]
        );
        return { completed: false, reason: 'LEASE_LOST' };
      }
      const result = providerResult.result;
      const usage = providerResult.usage || {};
      const estimatedCost = Number.isFinite(Number(usage.totalPrice))
        && String(usage.currency || '').toUpperCase() === 'USD'
        ? Number(usage.totalPrice) : null;
      const parsedOutput = {
        schemaVersion: result.schemaVersion,
        groupCode: result.groupCode,
        groupFinalScore: result.groupFinalScore,
        groupRawTotal: result.groupRawTotal,
        groupAverage: result.groupAverage,
        questionScores: result.questionScores,
        appliedRules: result.appliedRules,
        versions: result.versions,
      };
      await executor.query(
        `UPDATE iig_ai_model_executions
         SET status = 'COMPLETED', response_hash = $2, raw_output = $3::jsonb,
             parsed_output = $4::jsonb, input_tokens = $5, output_tokens = $6,
             latency_ms = $7, estimated_cost_usd = $8,
             provider_request_id = $9, completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING'`,
        [
          modelExecutionId, responseHash,
          JSON.stringify({
            taskId: providerResult.taskId,
            workflowStatus: providerResult.workflowStatus,
            usage,
          }),
          JSON.stringify(parsedOutput), Number(usage.inputTokens || 0),
          Number(usage.outputTokens || 0),
          usage.elapsedTime == null ? null : Math.round(Number(usage.elapsedTime) * 1000),
          estimatedCost, providerResult.providerRunId || null,
        ]
      );
      await executor.query(
        `UPDATE iig_ai_group_results
         SET status = 'COMPLETED', llm_group_score = $2, final_score = $2,
             decision_code = 'LLM_GROUP_SCORE',
             decision_metadata = $3::jsonb, error_code = NULL, error_message = NULL,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'AGGREGATING'`,
        [task.groupResultId, result.groupFinalScore, JSON.stringify({
          schemaVersion: result.schemaVersion,
          groupCode: result.groupCode,
          groupRawTotal: result.groupRawTotal,
          groupAverage: result.groupAverage,
          questionScores: result.questionScores,
          appliedRules: result.appliedRules,
          versions: result.versions,
          modelExecutionId,
        })]
      );
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, group_result_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'GROUP_SCORING_COMPLETED', 'AGGREGATING', 'COMPLETED', $3::jsonb)`,
        [task.runId, task.groupResultId, JSON.stringify({
          finalScore: result.groupFinalScore,
          modelExecutionId,
        })]
      );
      await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
             locked_at = NULL, locked_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id]
      );
      const groupCounts = await this.refreshRunStatus(executor, task.runId);
      return { completed: true, groupCounts };
    });
  }

  async refreshRunStatus(executor, runId) {
    const result = await executor.query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE status = 'COMPLETED')::integer AS completed,
              COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS failed,
              COUNT(*) FILTER (WHERE status = 'REVIEW_REQUIRED')::integer AS review
       FROM iig_ai_group_results WHERE scoring_run_id = $1`,
      [runId]
    );
    const counts = result.rows[0];
    const total = Number(counts.total || 0);
    const completed = Number(counts.completed || 0);
    const failed = Number(counts.failed || 0);
    const review = Number(counts.review || 0);
    const terminal = completed + failed + review;
    if (total > 0 && terminal === total) {
      const status = failed > 0 ? 'COMPLETED_WITH_ISSUES'
        : review > 0 ? 'REVIEW_REQUIRED' : 'COMPLETED';
      await executor.query(
        `UPDATE iig_ai_scoring_runs
         SET status = $2, completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [runId, status]
      );
      await writingCompletionRepository.refreshByRun(executor, runId);
    }
    return { total, completed, failed, review, terminal };
  }

  async markRetry({ event, task, modelExecutionId, error, delayMs }) {
    return this.failEvent({ event, task, modelExecutionId, error, status: 'FAILED', delayMs });
  }

  async markDeadLetter({ event, task, modelExecutionId, error }) {
    return this.failEvent({ event, task, modelExecutionId, error, status: 'DEAD_LETTER' });
  }

  async failEvent({ event, task, modelExecutionId, error, status, delayMs = null }) {
    return this.db.transaction(async executor => {
      const updated = await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = $2::varchar(30),
             available_at = CASE WHEN $3::bigint IS NULL THEN available_at
               ELSE CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond') END,
             locked_at = NULL, locked_by = NULL, last_error = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $5`,
        [event.id, status, delayMs, String(error.message).slice(0, 2000), event.lockedBy]
      );
      if (!updated.rowCount) return false;
      if (modelExecutionId) {
        await executor.query(
          `UPDATE iig_ai_model_executions
           SET status = 'FAILED', error_code = $2, error_message = $3,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'PROCESSING'`,
          [modelExecutionId, error.code, String(error.message).slice(0, 2000)]
        );
      }
      if (task?.groupResultId) {
        const groupStatus = status === 'DEAD_LETTER' ? 'FAILED' : 'WAITING';
        await executor.query(
          `UPDATE iig_ai_group_results
           SET status = $2::varchar(30), error_code = $3, error_message = $4,
               completed_at = CASE WHEN $2::varchar(30) = 'FAILED' THEN CURRENT_TIMESTAMP ELSE NULL END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'AGGREGATING'`,
          [task.groupResultId, groupStatus, error.code, String(error.message).slice(0, 2000)]
        );
        if (status === 'DEAD_LETTER') {
          await executor.query(
            `INSERT INTO iig_ai_scoring_events
               (scoring_run_id, group_result_id, event_type, from_status, to_status, details)
             VALUES ($1, $2, 'GROUP_SCORING_DEAD_LETTERED',
                     'AGGREGATING', 'FAILED', $3::jsonb)`,
            [task.runId, task.groupResultId, JSON.stringify({
              code: error.code,
              attempt: event.publishAttempts,
              modelExecutionId,
            })]
          );
          await this.refreshRunStatus(executor, task.runId);
        }
      }
      return true;
    });
  }
}

const repository = new WritingQ1Q5GroupScoringRepository();
repository.WritingQ1Q5GroupScoringRepository = WritingQ1Q5GroupScoringRepository;
repository.EVENT_TYPE = EVENT_TYPE;
repository.mapEvent = mapEvent;
repository.mapTask = mapTask;

module.exports = repository;
