const db = require('../../config/db');
const speakingCompletionRepository = require('./speakingCompletionRepository');
const extendedRepository = require('./extendedSpeakingQuestionScoringRepository');
const { PROFILE } = require('./expressOpinionProfile');

const EVENT_TYPE = 'QUESTION_SCORING_REQUESTED';
const TERMINAL_QUESTION_STATUSES = [
  'SCORED', 'INVALID_INPUT', 'INVALID_AUDIO', 'REVIEW_REQUIRED', 'FAILED', 'SKIPPED',
];

function permanentError(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function mapEvent(row) {
  return row ? {
    id: row.id, runId: row.scoring_run_id, eventType: row.event_type,
    payload: row.payload || {}, publishAttempts: Number(row.publish_attempts || 0),
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
    features: row.features || {},
    aiInput: row.ai_input,
    scorerType: row.scorer_type,
    questionNumber: Number(row.question_number),
    transcript: row.transcript,
    keycode: row.keycode,
    audioStorageProvider: row.audio_storage_provider,
    audioStorageBucket: row.audio_storage_bucket,
    audioStorageKey: row.audio_storage_key,
    audioChecksum: row.audio_checksum,
    scoringDisposition: row.scoring_disposition || 'NORMAL',
    zeroReason: row.zero_reason || null,
    zeroOrigin: row.zero_origin || null,
    resolutionMetadata: row.resolution_metadata || {},
    upstreamZeroReason: row.zero_reason || null,
  } : null;
}

class ExpressOpinionQuestionScoringRepository extends extendedRepository.ExtendedSpeakingQuestionScoringRepository {
  constructor(database = db) { super(database); }

  async recoverStale(staleMs) {
    return this.db.transaction(async executor => {
      await executor.query(
        `UPDATE iig_ai_model_executions execution
         SET status = 'FAILED', error_code = 'IIG_AI_EXPRESS_OPINION_SCORING_LEASE_EXPIRED',
             error_message = 'Worker lease expired.', completed_at = CURRENT_TIMESTAMP
         WHERE execution.stage = 'QUESTION_SCORING' AND execution.status = 'PROCESSING'
           AND execution.started_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
           AND EXISTS (
             SELECT 1 FROM iig_ai_question_runs question_run
             JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
             JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
             WHERE question_run.id = execution.question_run_id
               AND question.scorer_type = $2 AND question.question_number = 11
           )`,
        [staleMs, PROFILE.scorerType]
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
               AND question.scorer_type = $3 AND question.question_number = 11
           ) RETURNING event.id`,
        [EVENT_TYPE, staleMs, PROFILE.scorerType]
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
             AND question.scorer_type = $3 AND question.question_number = 11
           ORDER BY event.available_at, event.created_at
           FOR UPDATE OF event SKIP LOCKED LIMIT 1
         )
         UPDATE iig_ai_scoring_outbox event
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $2,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         FROM candidate WHERE event.id = candidate.id RETURNING event.*`,
        [EVENT_TYPE, workerId, PROFILE.scorerType]
      );
      return mapEvent(result.rows[0]);
    });
  }

  async loadTask(event) {
    const payload = event.payload || {};
    const result = await this.db.query(
      `SELECT question_run.scoring_run_id, question_run.id AS question_run_id,
              question_run.question_attempt_id, question_run.feature_set_id,
              question_run.input_fingerprint, feature_set.features, attempt.ai_input,
              question.scorer_type, question.question_number,
              transcription.transcript, submission.keycode,
              audio.canonical_storage_provider AS audio_storage_provider,
              audio.canonical_storage_bucket AS audio_storage_bucket,
              audio.canonical_storage_key AS audio_storage_key,
              audio.checksum_sha256 AS audio_checksum,
              question_run.scoring_disposition, question_run.zero_reason,
              question_run.zero_origin, question_run.resolution_metadata
       FROM iig_ai_question_runs question_run
       JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       JOIN iig_submissions submission ON submission.id = attempt.submission_id
       LEFT JOIN iig_ai_answer_transcriptions transcription ON transcription.id = question_run.transcription_id
       LEFT JOIN iig_media_assets audio ON audio.id = transcription.media_asset_id
       JOIN iig_ai_feature_sets feature_set ON feature_set.id = question_run.feature_set_id
       JOIN iig_ai_scoring_runs scoring_run ON scoring_run.id = question_run.scoring_run_id
       WHERE question_run.id = $1 AND question_run.scoring_run_id = $2
         AND question_run.feature_set_id = $3 AND question_run.status = 'LLM_SCORING'
         AND question.scorer_type = $4 AND question.question_number = 11
         AND feature_set.status = 'READY'
         AND (question_run.scoring_disposition <> 'NORMAL' OR (
           transcription.status IN ('COMPLETED', 'REVIEW') AND audio.status = 'READY'
         ))
         AND scoring_run.status IN ('TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS')`,
      [payload.questionRunId, event.runId, payload.featureSetId, PROFILE.scorerType]
    );
    const task = mapTask(result.rows[0]);
    if (!task) throw permanentError('Express Opinion event does not resolve to one ready Q11 task.', 'IIG_AI_EXPRESS_OPINION_SCORING_TASK_NOT_FOUND');
    const question = task.aiInput?.question || {};
    if ((task.scoringDisposition === 'NORMAL' && (
      !task.audioStorageKey || !task.audioChecksum || !String(task.transcript || '').trim()
    ))
        || (task.scoringDisposition === 'NORMAL'
          && !String(question.questionText || question.promptText || '').trim())) {
      throw permanentError('Express Opinion scoring input is incomplete.', 'IIG_AI_EXPRESS_OPINION_SCORING_INPUT_MISSING');
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
             error_code = 'IIG_AI_EXPRESS_OPINION_SCORING_LEASE_LOST',
             completed_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'PROCESSING'`,
          [modelExecutionId]
        );
        return { completed: false, reason: 'LEASE_LOST' };
      }
      const result = providerResult.result;
      const usage = providerResult.usage || {};
      const estimatedCost = Number.isFinite(Number(usage.totalPrice))
        && String(usage.currency || '').toUpperCase() === 'USD' ? Number(usage.totalPrice) : null;
      const normalized = {
        schemaVersion: result.schemaVersion,
        scorerType: result.scorerType,
        responseProfile: result.responseProfile,
        pronunciationScore: result.pronunciationScore,
        intonationFluencyScore: result.intonationFluencyScore,
        grammarScore: result.grammarScore,
        vocabularyScore: result.vocabularyScore,
        cohesionScore: result.cohesionScore,
        relevanceScore: result.relevanceScore,
        completenessScore: result.completenessScore,
        holisticScorePreliminary: result.holisticScorePreliminary,
        questionScoreFinal: result.questionScoreFinal,
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
             latency_ms = $7, estimated_cost_usd = $8, provider_request_id = $9,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING'`,
        [modelExecutionId, responseHash,
          JSON.stringify({ taskId: providerResult.taskId, workflowStatus: providerResult.workflowStatus, usage }),
          JSON.stringify(normalized), Number(usage.inputTokens || 0), Number(usage.outputTokens || 0),
          usage.elapsedTime == null ? null : Math.round(Number(usage.elapsedTime) * 1000),
          estimatedCost, providerResult.providerRunId || null]
      );
      await executor.query(
        `UPDATE iig_ai_question_runs
         SET status = 'SCORED', llm_score = $2, criteria_scores = $3::jsonb,
             flags = $4::jsonb, error_code = NULL, error_message = NULL,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'LLM_SCORING'`,
        [task.questionRunId, result.questionScoreFinal, JSON.stringify(normalized),
          JSON.stringify(result.zeroReason ? [result.zeroReason]
            : [...new Set(result.errors.map(item => item.errorType))])]
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
          score: result.questionScoreFinal, holisticScorePreliminary: result.holisticScorePreliminary,
          zeroReason: result.zeroReason, modelExecutionId,
        })]
      );
      const questionScores = {
        s_q11: {
          scorerType: PROFILE.scorerType,
          responseProfile: PROFILE.responseProfile,
          pronunciationScore: result.pronunciationScore,
          intonationFluencyScore: result.intonationFluencyScore,
          grammarScore: result.grammarScore,
          vocabularyScore: result.vocabularyScore,
          cohesionScore: result.cohesionScore,
          relevanceScore: result.relevanceScore,
          completenessScore: result.completenessScore,
          holisticScorePreliminary: result.holisticScorePreliminary,
          finalScore: result.questionScoreFinal,
        },
      };
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
        [task.runId, `${PROFILE.aggregationVersionPrefix}%`, JSON.stringify(questionScores),
          result.questionScoreFinal, JSON.stringify({
            schemaVersion: 'express-opinion-singleton-group-result-v1',
            sourceQuestionId: 's_q11', modelExecutionId,
          }), task.questionAttemptId]
      );
      for (const group of groups.rows) {
        await executor.query(
          `INSERT INTO iig_ai_scoring_events
             (scoring_run_id, group_result_id, event_type, from_status, to_status, details)
           VALUES ($1, $2, 'GROUP_SCORING_COMPLETED', 'WAITING', 'COMPLETED', $3::jsonb)`,
          [task.runId, group.id, JSON.stringify({
            finalScore: result.questionScoreFinal, decisionCode: 'SINGLE_QUESTION_SCORE',
          })]
        );
      }
      await executor.query(
        `UPDATE iig_ai_scoring_outbox SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
             locked_at = NULL, locked_by = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id]
      );
      const counts = await this.refreshRunProgress(executor, task.runId);
      const groupCountsResult = await executor.query(
        `SELECT COUNT(*)::integer AS total,
                COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'FAILED', 'REVIEW_REQUIRED', 'SKIPPED'))::integer AS terminal,
                COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS failed,
                COUNT(*) FILTER (WHERE status = 'REVIEW_REQUIRED')::integer AS review
         FROM iig_ai_group_results WHERE scoring_run_id = $1`,
        [task.runId]
      );
      const groupCounts = groupCountsResult.rows[0];
      if (counts.total === counts.terminal && Number(groupCounts.total) === Number(groupCounts.terminal)) {
        const runStatus = Number(groupCounts.failed) > 0 ? 'COMPLETED_WITH_ISSUES'
          : Number(groupCounts.review) > 0 ? 'REVIEW_REQUIRED' : 'COMPLETED';
        await executor.query(
          `UPDATE iig_ai_scoring_runs SET status = $2, completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [task.runId, runStatus]
        );
        await speakingCompletionRepository.refreshByRun(executor, task.runId);
      }
      return { completed: true, counts, groupResults: groups.rowCount || groups.rows.length };
    });
  }
}

const repository = new ExpressOpinionQuestionScoringRepository();
repository.ExpressOpinionQuestionScoringRepository = ExpressOpinionQuestionScoringRepository;
repository.mapEvent = mapEvent;
repository.mapTask = mapTask;
repository.PROFILE = PROFILE;
repository.TERMINAL_QUESTION_STATUSES = TERMINAL_QUESTION_STATUSES;

module.exports = repository;
