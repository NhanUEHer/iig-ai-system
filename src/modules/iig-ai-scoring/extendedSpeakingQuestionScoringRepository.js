const db = require('../../config/db');
const { deduplicationKey } = require('./orchestratorRepository');
const runStateRepository = require('./scoringRunStateRepository');

const EVENT_TYPE = 'QUESTION_SCORING_REQUESTED';
const SCORER_TYPES = Object.freeze(['RESPOND_TO_QUESTIONS', 'RESPOND_USING_INFORMATION']);
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

class ExtendedSpeakingQuestionScoringRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    return this.db.transaction(async executor => {
      await executor.query(
        `UPDATE iig_ai_model_executions execution
         SET status = 'FAILED', error_code = 'IIG_AI_EXTENDED_SPEAKING_SCORING_LEASE_EXPIRED',
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
           )
         RETURNING event.id`,
        [EVENT_TYPE, staleMs, SCORER_TYPES]
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
           JOIN iig_ai_question_runs question_run
             ON question_run.id = (event.payload->>'questionRunId')::uuid
           JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
           JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
           WHERE event.event_type = $1
             AND event.status IN ('PENDING', 'FAILED')
             AND event.available_at <= CURRENT_TIMESTAMP
             AND question.scorer_type = ANY($3::text[])
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
              question_run.input_fingerprint, feature_set.features, attempt.ai_input,
              question.scorer_type, question.question_number,
              transcription.transcript, submission.keycode,
              audio.canonical_storage_provider AS audio_storage_provider,
              audio.canonical_storage_bucket AS audio_storage_bucket,
              audio.canonical_storage_key AS audio_storage_key,
              audio.checksum_sha256 AS audio_checksum,
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
       LEFT JOIN iig_ai_answer_transcriptions transcription
         ON transcription.id = question_run.transcription_id
       LEFT JOIN iig_media_assets audio ON audio.id = transcription.media_asset_id
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
         AND question_run.feature_set_id = $3
         AND question_run.status = 'LLM_SCORING'
         AND question.scorer_type = ANY($4::text[])
         AND question.question_number BETWEEN 5 AND 10
         AND feature_set.status = 'READY'
         AND (question_run.scoring_disposition <> 'NORMAL' OR (
           transcription.status IN ('COMPLETED', 'REVIEW') AND audio.status = 'READY'
           AND (context_image.status IS NULL OR context_image.status = 'READY')
         ))
         AND scoring_run.status IN ('TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS')`,
      [payload.questionRunId, event.runId, payload.featureSetId, SCORER_TYPES]
    );
    const task = mapTask(result.rows[0]);
    if (!task) {
      throw permanentError(
        'Extended speaking event does not resolve to one ready Q5-Q10 task.',
        'IIG_AI_EXTENDED_SPEAKING_SCORING_TASK_NOT_FOUND'
      );
    }
    const question = task.aiInput?.question || {};
    if ((task.scoringDisposition === 'NORMAL' && (
      !task.audioStorageKey || !task.audioChecksum || !String(task.transcript || '').trim()
    ))
        || (task.scoringDisposition === 'NORMAL'
          && !String(question.questionText || question.promptText || '').trim())) {
      throw permanentError(
        'Extended speaking scoring input is incomplete.',
        'IIG_AI_EXTENDED_SPEAKING_SCORING_INPUT_MISSING'
      );
    }
    if (task.scoringDisposition === 'NORMAL' && task.scorerType === 'RESPOND_USING_INFORMATION'
        && !String(question.contextText || '').trim() && !task.contextImageStorageKey) {
      throw permanentError(
        'Respond Using Information has no context text or context image.',
        'IIG_AI_RESPOND_INFORMATION_CONTEXT_MISSING'
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
        `SELECT status FROM iig_ai_question_runs
         WHERE id = $1 AND scoring_run_id = $2 FOR UPDATE`,
        [task.questionRunId, task.runId]
      );
      if (state.rows[0]?.status !== 'LLM_SCORING') {
        await executor.query(
          `UPDATE iig_ai_scoring_outbox
           SET status = 'PUBLISHED', published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
               locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [event.id]
        );
        return { started: false, reason: 'TASK_ALREADY_TERMINAL' };
      }
      await executor.query(
        `UPDATE iig_ai_scoring_runs SET status = 'SCORING_QUESTIONS', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'EXTRACTING_FEATURES'`,
        [task.runId]
      );
      const execution = await executor.query(
        `INSERT INTO iig_ai_model_executions
           (scoring_run_id, question_run_id, stage, provider, model_name,
            model_version, prompt_version, request_hash, status)
         VALUES ($1, $2, 'QUESTION_SCORING', $3, $4, $5, $6, $7, 'PROCESSING')
         RETURNING id`,
        [
          task.runId, task.questionRunId, lineage.provider, lineage.modelName,
          lineage.modelVersion, lineage.promptVersion, requestHash,
        ]
      );
      return { started: true, modelExecutionId: execution.rows[0].id };
    });
  }

  async recordProgress({ event, task, progress }) {
    if (progress.eventType === 'QUESTION_COMPLETED') return true;
    const patch = progress.eventType === 'SCORE_READY' ? { score: progress.data }
      : progress.eventType === 'ERRORS_READY' ? { errors: progress.data }
        : progress.eventType === 'COMMENT_READY' ? { comment: progress.data }
          : {};
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      await executor.query(
        `UPDATE iig_ai_question_runs
         SET criteria_scores = criteria_scores || $2::jsonb, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'LLM_SCORING'`,
        [task.questionRunId, JSON.stringify(patch)]
      );
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, question_run_id, event_type, from_status, to_status, details)
         SELECT $1::uuid, $2::uuid, $3::varchar(80), 'LLM_SCORING', 'LLM_SCORING', $4::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM iig_ai_scoring_events
           WHERE scoring_run_id = $1::uuid AND question_run_id = $2::uuid
             AND event_type = $3::varchar(80)
         )`,
        [task.runId, task.questionRunId, progress.eventType, JSON.stringify({
          schemaVersion: progress.schemaVersion,
          sequence: progress.sequence,
          data: progress.data,
        })]
      );
      return true;
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
             error_code = 'IIG_AI_EXTENDED_SPEAKING_SCORING_LEASE_LOST',
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
        responseProfile: result.responseProfile,
        pronunciationScore: result.pronunciationScore,
        intonationFluencyScore: result.intonationFluencyScore,
        grammarScore: result.grammarScore,
        vocabularyScore: result.vocabularyScore,
        cohesionScore: result.cohesionScore,
        relevanceScore: result.relevanceScore,
        completenessScore: result.completenessScore,
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
          modelExecutionId, responseHash,
          JSON.stringify({
            taskId: providerResult.taskId,
            workflowStatus: providerResult.workflowStatus,
            usage,
          }),
          JSON.stringify(normalized), Number(usage.inputTokens || 0),
          Number(usage.outputTokens || 0),
          usage.elapsedTime == null ? null : Math.round(Number(usage.elapsedTime) * 1000),
          estimatedCost, providerResult.providerRunId || null,
        ]
      );
      await executor.query(
        `UPDATE iig_ai_question_runs
         SET status = 'SCORED', llm_score = $2, criteria_scores = $3::jsonb,
             flags = $4::jsonb, error_code = NULL, error_message = NULL,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'LLM_SCORING'`,
        [
          task.questionRunId, result.questionScoreRounded, JSON.stringify(normalized),
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
           SELECT 1 FROM iig_ai_scoring_events
           WHERE scoring_run_id = $1 AND question_run_id = $2
             AND event_type = 'QUESTION_COMPLETED'
         )`,
        [task.runId, task.questionRunId, JSON.stringify({
          score: result.questionScoreRounded,
          zeroReason: result.zeroReason,
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
      const counts = await this.refreshRunProgress(executor, task.runId);
      const groupEvents = await this.publishReadyGroups(executor, task.runId);
      await executor.query(
        `UPDATE iig_ai_scoring_runs
         SET status = CASE WHEN $2::integer = $3::integer THEN 'AGGREGATING_GROUPS'
                           ELSE 'SCORING_QUESTIONS' END,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [task.runId, counts.terminal, counts.total]
      );
      return { completed: true, counts, groupEvents };
    });
  }

  async refreshRunProgress(executor, runId) {
    return runStateRepository.refreshQuestionProgress(executor, runId);
  }

  async publishReadyGroups(executor, runId) {
    const groups = await executor.query(
      `SELECT group_result.id, group_result.score_group_id, group_result.aggregation_version
       FROM iig_ai_group_results group_result
       WHERE group_result.scoring_run_id = $1 AND group_result.status = 'WAITING'
         AND group_result.aggregation_version LIKE 'respond-q5-q10-%'
         AND NOT EXISTS (
           SELECT 1 FROM iig_exam_question_score_groups mapping
           JOIN iig_question_attempts attempt ON attempt.exam_question_id = mapping.question_id
           JOIN iig_ai_question_runs question_run
             ON question_run.question_attempt_id = attempt.id
            AND question_run.scoring_run_id = group_result.scoring_run_id
           WHERE mapping.score_group_id = group_result.score_group_id
             AND question_run.status <> 'SCORED'
         )
       FOR UPDATE OF group_result`,
      [runId]
    );
    let published = 0;
    for (const group of groups.rows) {
      const scoreRows = await executor.query(
        `SELECT question.question_number, question.scorer_type,
                question_run.criteria_scores->>'responseProfile' AS response_profile,
                question_run.criteria_scores->>'pronunciationScore' AS pronunciation_score,
                question_run.criteria_scores->>'intonationFluencyScore' AS intonation_fluency_score,
                question_run.criteria_scores->>'grammarScore' AS grammar_score,
                question_run.criteria_scores->>'vocabularyScore' AS vocabulary_score,
                question_run.criteria_scores->>'cohesionScore' AS cohesion_score,
                question_run.criteria_scores->>'relevanceScore' AS relevance_score,
                question_run.criteria_scores->>'completenessScore' AS completeness_score,
                question_run.criteria_scores->>'questionScoreRounded' AS final_score
         FROM iig_exam_question_score_groups mapping
         JOIN iig_question_attempts attempt ON attempt.exam_question_id = mapping.question_id
         JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
         JOIN iig_ai_question_runs question_run
           ON question_run.question_attempt_id = attempt.id
          AND question_run.scoring_run_id = $1
         WHERE mapping.score_group_id = $2 AND question_run.status = 'SCORED'
           AND question.question_number BETWEEN 5 AND 10
         ORDER BY question.question_number`,
        [runId, group.score_group_id]
      );
      const questionScores = Object.fromEntries(scoreRows.rows.map(row => [
        `s_q${Number(row.question_number)}`,
        {
          scorerType: row.scorer_type,
          responseProfile: row.response_profile,
          pronunciationScore: Number(row.pronunciation_score),
          intonationFluencyScore: Number(row.intonation_fluency_score),
          grammarScore: Number(row.grammar_score),
          vocabularyScore: Number(row.vocabulary_score),
          cohesionScore: Number(row.cohesion_score),
          relevanceScore: Number(row.relevance_score),
          completenessScore: Number(row.completeness_score),
          finalScore: Number(row.final_score),
        },
      ]));
      await executor.query(
        `UPDATE iig_ai_group_results SET question_scores = $2::jsonb, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'WAITING'`,
        [group.id, JSON.stringify(questionScores)]
      );
      const result = await executor.query(
        `INSERT INTO iig_ai_scoring_outbox
           (scoring_run_id, event_type, deduplication_key, payload)
         VALUES ($1, 'GROUP_SCORING_REQUESTED', $2, $3::jsonb)
         ON CONFLICT (deduplication_key) DO NOTHING RETURNING id`,
        [
          runId,
          deduplicationKey(`iig-ai-group-result:${group.id}:score`, {
            aggregationVersion: group.aggregation_version,
          }),
          JSON.stringify({
            scoringRunId: runId,
            groupResultId: group.id,
            scoreGroupId: group.score_group_id,
            aggregationVersion: group.aggregation_version,
          }),
        ]
      );
      published += result.rowCount || result.rows.length;
    }
    return published;
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
      if (status === 'DEAD_LETTER' && task?.questionRunId) {
        await executor.query(
          `UPDATE iig_ai_question_runs
           SET status = 'FAILED', error_code = $2, error_message = $3,
               completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'LLM_SCORING'`,
          [task.questionRunId, error.code, String(error.message).slice(0, 2000)]
        );
      }
      return true;
    });
  }
}

const repository = new ExtendedSpeakingQuestionScoringRepository();
repository.ExtendedSpeakingQuestionScoringRepository = ExtendedSpeakingQuestionScoringRepository;
repository.SCORER_TYPES = SCORER_TYPES;
repository.mapEvent = mapEvent;
repository.mapTask = mapTask;

module.exports = repository;
