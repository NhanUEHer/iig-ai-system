const db = require('../../config/db');
const baseRepository = require('./writingQuestionScoringRepository');
const { profileForScorerType } = require('./writingProfiles');
const writingCompletionRepository = require('./writingCompletionRepository');

const EVENT_TYPE = 'QUESTION_SCORING_REQUESTED';
const SCORER_TYPES = ['RESPOND_TO_WRITTEN_REQUEST', 'WRITE_OPINION_ESSAY'];
const TERMINAL_QUESTION_STATUSES = [
  'SCORED', 'INVALID_INPUT', 'INVALID_AUDIO', 'REVIEW_REQUIRED', 'FAILED', 'SKIPPED',
];
const TERMINAL_GROUP_STATUSES = ['COMPLETED', 'FAILED', 'REVIEW_REQUIRED', 'SKIPPED'];

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
    inputFingerprint: row.input_fingerprint,
    aiInput: row.ai_input,
    scorerType: row.scorer_type,
    questionNumber: Number(row.question_number),
    keycode: row.keycode,
    contextImageStorageProvider: row.context_image_storage_provider,
    contextImageStorageBucket: row.context_image_storage_bucket,
    contextImageStorageKey: row.context_image_storage_key,
    contextImageChecksum: row.context_image_checksum,
    scoringDisposition: row.scoring_disposition || 'NORMAL',
    zeroReason: row.zero_reason || null,
    zeroOrigin: row.zero_origin || null,
    resolutionMetadata: row.resolution_metadata || {},
    upstreamZeroReason: row.zero_reason || null,
  } : null;
}

function aggregationVersionPrefixFor(scorerType) {
  if (scorerType === 'RESPOND_TO_WRITTEN_REQUEST') {
    return 'written-request-q6-q7-singleton-';
  }
  if (scorerType === 'WRITE_OPINION_ESSAY') return 'opinion-essay-q8-singleton-';
  throw permanentError(
    `Unsupported extended Writing scorer type: ${scorerType}.`,
    'IIG_AI_EXTENDED_WRITING_PROFILE_INVALID'
  );
}

class ExtendedWritingQuestionScoringRepository
  extends baseRepository.WritingQuestionScoringRepository {
  constructor(database = db) {
    super(database);
  }

  async recoverStale(staleMs) {
    return this.db.transaction(async executor => {
      await executor.query(
        `UPDATE iig_ai_model_executions execution
         SET status = 'FAILED', error_code = 'IIG_AI_EXTENDED_WRITING_SCORING_LEASE_EXPIRED',
             error_message = 'Worker lease expired.', completed_at = CURRENT_TIMESTAMP
         WHERE execution.stage = 'QUESTION_SCORING' AND execution.status = 'PROCESSING'
           AND execution.started_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
           AND EXISTS (
             SELECT 1 FROM iig_ai_question_runs question_run
             JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
             JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
             WHERE question_run.id = execution.question_run_id
               AND question.scorer_type = ANY($2::text[])
           )`,
        [staleMs, SCORER_TYPES]
      );
      const result = await executor.query(
        `UPDATE iig_ai_scoring_outbox event
         SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
             available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
             updated_at = CURRENT_TIMESTAMP
         WHERE event.event_type = $1 AND event.status = 'PROCESSING'
           AND event.locked_at < CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond')
           AND EXISTS (
             SELECT 1 FROM iig_ai_question_runs question_run
             JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
             JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
             WHERE question_run.id = (event.payload->>'questionRunId')::uuid
               AND question.scorer_type = ANY($3::text[])
           ) RETURNING event.id`,
        [EVENT_TYPE, staleMs, SCORER_TYPES]
      );
      return result.rowCount || result.rows.length;
    });
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT event.id FROM iig_ai_scoring_outbox event
           JOIN iig_ai_question_runs question_run
             ON question_run.id = (event.payload->>'questionRunId')::uuid
           JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
           JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
           WHERE event.event_type = $1 AND event.status IN ('PENDING', 'FAILED')
             AND event.available_at <= CURRENT_TIMESTAMP
             AND question.scorer_type = ANY($3::text[])
           ORDER BY event.available_at, event.created_at
           FOR UPDATE OF event SKIP LOCKED LIMIT 1
         )
         UPDATE iig_ai_scoring_outbox event
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $2,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         FROM candidate WHERE event.id = candidate.id RETURNING event.*`,
        [EVENT_TYPE, workerId, SCORER_TYPES]
      );
      return mapEvent(result.rows[0]);
    });
  }

  async loadTask(event) {
    const payload = event.payload || {};
    const result = await this.db.query(
      `SELECT question_run.scoring_run_id, question_run.id AS question_run_id,
              question_run.question_attempt_id, question_run.feature_set_id,
              question_run.input_fingerprint, attempt.ai_input,
              question.scorer_type, question.question_number, submission.keycode,
              context_image.canonical_storage_provider AS context_image_storage_provider,
              context_image.canonical_storage_bucket AS context_image_storage_bucket,
              context_image.canonical_storage_key AS context_image_storage_key,
              context_image.checksum_sha256 AS context_image_checksum,
              question_run.scoring_disposition, question_run.zero_reason,
              question_run.zero_origin, question_run.resolution_metadata
       FROM iig_ai_question_runs question_run
       JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       JOIN iig_submissions submission ON submission.id = attempt.submission_id
       JOIN iig_ai_feature_sets feature_set ON feature_set.id = question_run.feature_set_id
       JOIN iig_ai_scoring_runs scoring_run ON scoring_run.id = question_run.scoring_run_id
       LEFT JOIN LATERAL (
         SELECT asset.canonical_storage_provider, asset.canonical_storage_bucket,
                asset.canonical_storage_key, asset.checksum_sha256, asset.status
         FROM iig_media_assets asset
         WHERE asset.exam_question_id = question.id
           AND asset.asset_role = 'CONTEXT_IMAGE' AND asset.asset_index = 0
         ORDER BY asset.created_at, asset.id LIMIT 1
       ) context_image ON TRUE
       WHERE question_run.id = $1 AND question_run.scoring_run_id = $2
         AND question_run.feature_set_id = $3 AND question_run.status = 'LLM_SCORING'
         AND question.scorer_type = ANY($4::text[])
         AND ((question.scorer_type = 'RESPOND_TO_WRITTEN_REQUEST'
               AND question.question_number BETWEEN 6 AND 7)
           OR (question.scorer_type = 'WRITE_OPINION_ESSAY'
               AND question.question_number = 8))
         AND feature_set.status = 'READY'
         AND (question_run.scoring_disposition <> 'NORMAL'
              OR context_image.status IS NULL OR context_image.status = 'READY')
         AND scoring_run.status IN ('TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS')`,
      [
        payload.questionRunId,
        event.runId,
        payload.featureSetId,
        SCORER_TYPES,
      ]
    );
    const task = mapTask(result.rows[0]);
    if (!task) {
      throw permanentError(
        'Extended Writing event does not resolve to one ready Q6-Q8 task.',
        'IIG_AI_EXTENDED_WRITING_SCORING_TASK_NOT_FOUND'
      );
    }
    const question = task.aiInput?.question || {};
    const hasDirections = String(question.questionText || question.promptText || '').trim();
    const hasTextPrompt = String(question.contextText || '').trim();
    const hasPrompt = task.scorerType === 'RESPOND_TO_WRITTEN_REQUEST'
      ? hasDirections && (hasTextPrompt || task.contextImageStorageKey)
      : String(question.questionText || question.promptText || question.contextText || '').trim();
    if (task.scoringDisposition === 'NORMAL' && (!hasPrompt
        || !String(task.aiInput?.response?.text || '').trim())) {
      throw permanentError(
        'Extended Writing scoring input is incomplete.',
        'IIG_AI_EXTENDED_WRITING_SCORING_INPUT_MISSING'
      );
    }
    return task;
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
             error_code = 'IIG_AI_EXTENDED_WRITING_SCORING_LEASE_LOST',
             completed_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'PROCESSING'`,
          [modelExecutionId]
        );
        return { completed: false, reason: 'LEASE_LOST' };
      }

      const result = providerResult.result;
      const usage = providerResult.usage || {};
      const estimatedCost = Number.isFinite(Number(usage.totalPrice))
        && String(usage.currency || '').toUpperCase() === 'USD'
        ? Number(usage.totalPrice) : null;
      const normalized = {
        schemaVersion: result.schemaVersion,
        scorerType: result.scorerType,
        groupCode: result.groupCode,
        componentScores: result.componentScores,
        questionScoreRaw: result.questionScoreRaw,
        questionScoreRounded: result.questionScoreRounded,
        zeroReason: result.zeroReason,
        scoringDisposition: result.scoringDisposition,
        zeroOrigin: result.zeroOrigin,
        resolutionMetadata: result.resolutionMetadata,
        ruleSignals: result.ruleSignals,
        appliedRules: result.appliedRules,
        errors: result.errors,
        comment: result.comment,
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
          modelExecutionId,
          responseHash,
          JSON.stringify({
            taskId: providerResult.taskId,
            workflowStatus: providerResult.workflowStatus,
            usage,
          }),
          JSON.stringify(normalized),
          Number(usage.inputTokens || 0),
          Number(usage.outputTokens || 0),
          usage.elapsedTime == null ? null : Math.round(Number(usage.elapsedTime) * 1000),
          estimatedCost,
          providerResult.providerRunId || null,
        ]
      );
      await executor.query(
        `UPDATE iig_ai_question_runs
         SET status = 'SCORED', llm_score = $2, criteria_scores = $3::jsonb,
             flags = $4::jsonb, error_code = NULL, error_message = NULL,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'LLM_SCORING'`,
        [
          task.questionRunId,
          result.questionScoreRounded,
          JSON.stringify(normalized),
          JSON.stringify(result.zeroReason
            ? [result.zeroReason]
            : [...new Set(result.errors.map(item => item.errorType))]),
        ]
      );
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, question_run_id, event_type, from_status, to_status, details)
         SELECT $1, $2, 'QUESTION_COMPLETED', 'LLM_SCORING', 'SCORED', $3::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM iig_ai_scoring_events WHERE scoring_run_id = $1
             AND question_run_id = $2 AND event_type = 'QUESTION_COMPLETED'
         )`,
        [task.runId, task.questionRunId, JSON.stringify({
          score: result.questionScoreRounded,
          zeroReason: result.zeroReason,
          modelExecutionId,
        })]
      );

      const questionId = `w_q${task.questionNumber}`;
      const questionScores = {
        [questionId]: {
          scorerType: task.scorerType,
          ...result.componentScores,
          finalScore: result.questionScoreRounded,
        },
      };
      const aggregationVersionPrefix = aggregationVersionPrefixFor(task.scorerType);
      const groups = await executor.query(
        `UPDATE iig_ai_group_results group_result
         SET status = 'COMPLETED', question_scores = $3::jsonb,
             llm_group_score = $4, final_score = $4,
             decision_code = 'SINGLE_QUESTION_SCORE', decision_metadata = $5::jsonb,
             error_code = NULL, error_message = NULL,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE group_result.scoring_run_id = $1 AND group_result.status = 'WAITING'
           AND group_result.aggregation_version LIKE $2
           AND EXISTS (
             SELECT 1 FROM iig_exam_question_score_groups mapping
             JOIN iig_question_attempts attempt ON attempt.exam_question_id = mapping.question_id
             WHERE mapping.score_group_id = group_result.score_group_id
               AND attempt.id = $6
           )
         RETURNING group_result.id`,
        [
          task.runId,
          `${aggregationVersionPrefix}%`,
          JSON.stringify(questionScores),
          result.questionScoreRounded,
          JSON.stringify({
            schemaVersion: 'writing-singleton-group-result-v1',
            sourceQuestionId: questionId,
            scorerType: task.scorerType,
            modelExecutionId,
          }),
          task.questionAttemptId,
        ]
      );
      if ((groups.rowCount || groups.rows.length) !== 1) {
        throw permanentError(
          `Expected exactly one singleton score group for ${questionId}.`,
          'IIG_AI_EXTENDED_WRITING_SCORE_GROUP_INVALID'
        );
      }
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, group_result_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'GROUP_SCORING_COMPLETED', 'WAITING', 'COMPLETED', $3::jsonb)`,
        [task.runId, groups.rows[0].id, JSON.stringify({
          finalScore: result.questionScoreRounded,
          decisionCode: 'SINGLE_QUESTION_SCORE',
          sourceQuestionId: questionId,
        })]
      );
      await executor.query(
        `UPDATE iig_ai_scoring_outbox SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
             locked_at = NULL, locked_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id]
      );

      const counts = await this.refreshRunProgress(executor, task.runId);
      await this.completeRunIfTerminal(executor, task.runId, counts);
      return { completed: true, counts, groupResults: 1 };
    });
  }

  async completeRunIfTerminal(executor, runId, questionCounts = null) {
    const counts = questionCounts || await this.refreshRunProgress(executor, runId);
    const groupResult = await executor.query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE status = ANY($2::text[]))::integer AS terminal,
              COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS failed,
              COUNT(*) FILTER (WHERE status = 'REVIEW_REQUIRED')::integer AS review
       FROM iig_ai_group_results WHERE scoring_run_id = $1`,
      [runId, TERMINAL_GROUP_STATUSES]
    );
    const groups = groupResult.rows[0];
    if (counts.total === counts.terminal
        && Number(groups.total) > 0
        && Number(groups.total) === Number(groups.terminal)) {
      const runStatus = Number(groups.failed) > 0 || counts.failed > 0
        ? 'COMPLETED_WITH_ISSUES'
        : Number(groups.review) > 0 || counts.review > 0
          ? 'REVIEW_REQUIRED'
          : 'COMPLETED';
      await executor.query(
        `UPDATE iig_ai_scoring_runs SET status = $2, completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [runId, runStatus]
      );
      await writingCompletionRepository.refreshByRun(executor, runId);
    }
    return groups;
  }

  async markDeadLetter({ event, task, modelExecutionId, error }) {
    const updated = await super.markDeadLetter({
      event,
      task,
      modelExecutionId,
      error,
    });
    if (!updated || !task?.questionAttemptId) return updated;
    return this.db.transaction(async executor => {
      await executor.query(
        `UPDATE iig_ai_group_results group_result
         SET status = 'FAILED', error_code = $3, error_message = $4,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE group_result.scoring_run_id = $1 AND group_result.status = 'WAITING'
           AND group_result.aggregation_version LIKE $2
           AND EXISTS (
             SELECT 1 FROM iig_exam_question_score_groups mapping
             JOIN iig_question_attempts attempt ON attempt.exam_question_id = mapping.question_id
             WHERE mapping.score_group_id = group_result.score_group_id
               AND attempt.id = $5
           )`,
        [
          task.runId,
          `${aggregationVersionPrefixFor(task.scorerType)}%`,
          error.code,
          String(error.message).slice(0, 2000),
          task.questionAttemptId,
        ]
      );
      const counts = await this.refreshRunProgress(executor, task.runId);
      await this.completeRunIfTerminal(executor, task.runId, counts);
      return true;
    });
  }
}

const repository = new ExtendedWritingQuestionScoringRepository();
repository.ExtendedWritingQuestionScoringRepository = ExtendedWritingQuestionScoringRepository;
repository.EVENT_TYPE = EVENT_TYPE;
repository.SCORER_TYPES = SCORER_TYPES;
repository.TERMINAL_QUESTION_STATUSES = TERMINAL_QUESTION_STATUSES;
repository.mapEvent = mapEvent;
repository.mapTask = mapTask;
repository.aggregationVersionPrefixFor = aggregationVersionPrefixFor;

module.exports = repository;
