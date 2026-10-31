const db = require('../../config/db');
const speakingCompletionRepository = require('./speakingCompletionRepository');

const EVENT_TYPE = 'GROUP_SCORING_REQUESTED';
const AGGREGATION_PREFIX = 'respond-q5-q10-';

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
    unavailableQuestionIds: row.unavailable_question_ids || [],
    keycode: row.keycode,
  } : null;
}

class Q5Q10GroupScoringRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    return this.db.transaction(async executor => {
      await executor.query(
        `UPDATE iig_ai_model_executions execution
         SET status = 'FAILED', error_code = 'IIG_AI_Q5_Q10_GROUP_LEASE_EXPIRED',
             error_message = 'Worker lease expired.', completed_at = CURRENT_TIMESTAMP
         WHERE execution.stage = 'GROUP_CALIBRATION' AND execution.status = 'PROCESSING'
           AND execution.started_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
           AND EXISTS (
             SELECT 1 FROM iig_ai_group_results group_result
             WHERE group_result.id = execution.group_result_id
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
        `UPDATE iig_ai_scoring_outbox event
         SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
             available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
             updated_at = CURRENT_TIMESTAMP
         WHERE event.event_type = $1 AND event.status = 'PROCESSING'
           AND event.locked_at < CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond')
           AND EXISTS (
             SELECT 1 FROM iig_ai_group_results group_result
             WHERE group_result.id = (event.payload->>'groupResultId')::uuid
               AND group_result.aggregation_version LIKE $3
           )
         RETURNING event.id`,
        [EVENT_TYPE, staleMs, `${AGGREGATION_PREFIX}%`]
      );
      return result.rowCount || result.rows.length;
    });
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT event.id FROM iig_ai_scoring_outbox event
           JOIN iig_ai_group_results group_result
             ON group_result.id = (event.payload->>'groupResultId')::uuid
            AND group_result.scoring_run_id = event.scoring_run_id
           WHERE event.event_type = $1 AND event.status IN ('PENDING', 'FAILED')
             AND event.available_at <= CURRENT_TIMESTAMP
             AND group_result.status = 'WAITING'
             AND group_result.aggregation_version LIKE $3
           ORDER BY event.available_at, event.created_at
           FOR UPDATE OF event SKIP LOCKED LIMIT 1
         )
         UPDATE iig_ai_scoring_outbox event
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $2,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         FROM candidate WHERE event.id = candidate.id RETURNING event.*`,
        [EVENT_TYPE, workerId, `${AGGREGATION_PREFIX}%`]
      );
      return mapEvent(result.rows[0]);
    });
  }

  async loadTask(event) {
    const result = await this.db.query(
      `SELECT group_result.scoring_run_id, group_result.id AS group_result_id,
              group_result.score_group_id, group_result.aggregation_version,
              group_result.question_scores, submission.keycode,
              COALESCE((
                SELECT JSONB_AGG('s_q' || question.question_number ORDER BY question.question_number)
                FROM iig_exam_question_score_groups mapping
                JOIN iig_exam_questions question ON question.id = mapping.question_id
                JOIN iig_question_attempts attempt
                  ON attempt.exam_question_id = question.id
                 AND attempt.submission_id = scoring_run.submission_id
                WHERE mapping.score_group_id = group_result.score_group_id
                  AND attempt.readiness_status = 'INVALID_INPUT'
                  AND attempt.scoring_disposition = 'INVALID_PROMPT_SOURCE'
              ), '[]'::jsonb) AS unavailable_question_ids
       FROM iig_ai_group_results group_result
       JOIN iig_ai_scoring_runs scoring_run ON scoring_run.id = group_result.scoring_run_id
       JOIN iig_submissions submission ON submission.id = scoring_run.submission_id
       WHERE group_result.id = $1 AND group_result.scoring_run_id = $2
         AND group_result.status = 'WAITING'
         AND group_result.aggregation_version LIKE $3
         AND scoring_run.status IN ('SCORING_QUESTIONS', 'AGGREGATING_GROUPS')`,
      [event.payload?.groupResultId, event.runId, `${AGGREGATION_PREFIX}%`]
    );
    const task = mapTask(result.rows[0]);
    if (!task) {
      throw permanentError('Q5-Q10 group event does not resolve to a waiting group.', 'IIG_AI_Q5_Q10_GROUP_TASK_NOT_FOUND');
    }
    return task;
  }

  async skipIncompleteGroup({ event, task, missingQuestionIds }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return { completed: false, reason: 'LEASE_LOST' };
      const metadata = {
        reason: 'SOURCE_QUESTIONS_UNAVAILABLE',
        missingQuestionIds,
        availableQuestionIds: Object.keys(task.questionScores).sort(),
      };
      const updated = await executor.query(
        `UPDATE iig_ai_group_results
         SET status = 'SKIPPED', decision_code = 'SOURCE_QUESTIONS_UNAVAILABLE',
             decision_metadata = $3::jsonb,
             error_code = 'IIG_AI_Q5_Q10_GROUP_SOURCE_INCOMPLETE',
             error_message = 'Group scoring was skipped because one or more source questions were unavailable.',
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND scoring_run_id = $2 AND status = 'WAITING'
         RETURNING id`,
        [task.groupResultId, task.runId, JSON.stringify(metadata)]
      );
      await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'PUBLISHED', published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
             locked_at = NULL, locked_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id]
      );
      if (updated.rows[0]) {
        await executor.query(
          `INSERT INTO iig_ai_scoring_events
             (scoring_run_id, group_result_id, event_type, from_status, to_status, details)
           VALUES ($1, $2, 'GROUP_SCORING_SKIPPED', 'WAITING', 'SKIPPED', $3::jsonb)`,
          [task.runId, task.groupResultId, JSON.stringify(metadata)]
        );
      }
      return {
        completed: true,
        skipped: true,
        groupCounts: await this.refreshRunStatus(executor, task.runId),
      };
    });
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
         WHERE id = $1 AND scoring_run_id = $2 AND status = 'WAITING' RETURNING id`,
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
             error_code = 'IIG_AI_Q5_Q10_GROUP_LEASE_LOST', completed_at = CURRENT_TIMESTAMP
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
          JSON.stringify({ taskId: providerResult.taskId, workflowStatus: providerResult.workflowStatus, usage }),
          JSON.stringify(parsedOutput), Number(usage.inputTokens || 0),
          Number(usage.outputTokens || 0),
          usage.elapsedTime == null ? null : Math.round(Number(usage.elapsedTime) * 1000),
          estimatedCost, providerResult.providerRunId || null,
        ]
      );
      await executor.query(
        `UPDATE iig_ai_group_results
         SET status = 'COMPLETED', llm_group_score = $2, final_score = $2,
             decision_code = 'LLM_GROUP_SCORE', decision_metadata = $3::jsonb,
             error_code = NULL, error_message = NULL,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'AGGREGATING'`,
        [task.groupResultId, result.groupFinalScore, JSON.stringify({ ...parsedOutput, modelExecutionId })]
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
      return { completed: true, groupCounts: await this.refreshRunStatus(executor, task.runId) };
    });
  }

  async refreshRunStatus(executor, runId) {
    const result = await executor.query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE status = 'COMPLETED')::integer AS completed,
              COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS failed,
              COUNT(*) FILTER (WHERE status = 'REVIEW_REQUIRED')::integer AS review,
              COUNT(*) FILTER (WHERE status = 'SKIPPED')::integer AS skipped
       FROM iig_ai_group_results WHERE scoring_run_id = $1`,
      [runId]
    );
    const counts = result.rows[0];
    const normalized = {
      total: Number(counts.total || 0),
      completed: Number(counts.completed || 0),
      failed: Number(counts.failed || 0),
      review: Number(counts.review || 0),
      skipped: Number(counts.skipped || 0),
    };
    normalized.terminal = normalized.completed + normalized.failed
      + normalized.review + normalized.skipped;
    if (normalized.total > 0 && normalized.terminal === normalized.total) {
      const status = normalized.failed > 0 || normalized.skipped > 0 ? 'COMPLETED_WITH_ISSUES'
        : normalized.review > 0 ? 'REVIEW_REQUIRED' : 'COMPLETED';
      await executor.query(
        `UPDATE iig_ai_scoring_runs SET status = $2, completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [runId, status]
      );
      await speakingCompletionRepository.refreshByRun(executor, runId);
    }
    return normalized;
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
         SET status = $2,
             available_at = CASE WHEN $3::bigint IS NULL THEN available_at
               ELSE CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond') END,
             locked_at = NULL, locked_by = NULL, last_error = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $5`,
        [event.id, status, delayMs, String(error.message).slice(0, 2000), event.lockedBy]
      );
      if (!updated.rowCount) return false;
      if (modelExecutionId) {
        await executor.query(
          `UPDATE iig_ai_model_executions SET status = 'FAILED', error_code = $2,
             error_message = $3, completed_at = CURRENT_TIMESTAMP
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
        if (status === 'DEAD_LETTER') await this.refreshRunStatus(executor, task.runId);
      }
      return true;
    });
  }
}

const repository = new Q5Q10GroupScoringRepository();
repository.Q5Q10GroupScoringRepository = Q5Q10GroupScoringRepository;
repository.EVENT_TYPE = EVENT_TYPE;
repository.AGGREGATION_PREFIX = AGGREGATION_PREFIX;

module.exports = repository;
