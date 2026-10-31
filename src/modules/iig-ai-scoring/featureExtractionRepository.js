const db = require('../../config/db');
const { deduplicationKey } = require('./orchestratorRepository');
const { SPEAKING_TYPES } = require('./featureExtractor');

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
    questionRunStatus: row.question_run_status,
    aiInput: row.ai_input,
    scorerType: row.scorer_type,
    transcriptionId: row.transcription_id,
    transcriptionStatus: row.transcription_status,
    transcript: row.transcript,
  };
}

class FeatureExtractionRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    const result = await this.db.query(
      `UPDATE iig_ai_scoring_outbox
       SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
           available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
           updated_at = CURRENT_TIMESTAMP
       WHERE event_type = 'FEATURE_EXTRACTION_REQUESTED' AND status = 'PROCESSING'
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
           SELECT id FROM iig_ai_scoring_outbox
           WHERE event_type = 'FEATURE_EXTRACTION_REQUESTED'
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

  async loadTask(event) {
    const payload = event.payload || {};
    const result = await this.db.query(
      `SELECT question_run.scoring_run_id, question_run.id AS question_run_id,
              question_run.question_attempt_id, question_run.status AS question_run_status,
              attempt.ai_input, question.scorer_type,
              transcription.id AS transcription_id,
              transcription.status AS transcription_status,
              transcription.transcript
       FROM iig_ai_question_runs question_run
       JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       JOIN iig_ai_scoring_runs scoring_run ON scoring_run.id = question_run.scoring_run_id
       LEFT JOIN iig_ai_answer_transcriptions transcription
         ON transcription.id = question_run.transcription_id
       WHERE question_run.id = $1
         AND question_run.scoring_run_id = $2
         AND question_run.question_attempt_id = $3
         AND question_run.status = 'EXTRACTING_FEATURES'
         AND scoring_run.status IN ('TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS')`,
      [payload.questionRunId, event.runId, payload.questionAttemptId]
    );
    const task = mapTask(result.rows[0]);
    if (!task) {
      throw permanentError(
        'Feature event does not resolve to one active question task.',
        'IIG_AI_FEATURE_TASK_NOT_FOUND'
      );
    }
    if (SPEAKING_TYPES.has(task.scorerType)
      && (task.transcriptionStatus !== 'COMPLETED' || !String(task.transcript || '').trim())) {
      throw permanentError(
        'Speaking feature extraction requires a completed answer transcription.',
        'IIG_AI_FEATURE_TRANSCRIPTION_NOT_READY'
      );
    }
    if (payload.transcriptionId && payload.transcriptionId !== task.transcriptionId) {
      throw permanentError(
        'Feature event transcription identity does not match the question run.',
        'IIG_AI_FEATURE_TRANSCRIPTION_MISMATCH'
      );
    }
    return task;
  }

  async completeTask({ event, task, extracted, featureVersion }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
         FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return { completed: false, reason: 'LEASE_LOST' };

      const question = await executor.query(
        `SELECT status, feature_set_id
         FROM iig_ai_question_runs
         WHERE id = $1 AND scoring_run_id = $2
         FOR UPDATE`,
        [task.questionRunId, task.runId]
      );
      if (!question.rows[0]) {
        throw permanentError('Feature question run disappeared.', 'IIG_AI_FEATURE_TASK_NOT_FOUND');
      }
      if (question.rows[0].status !== 'EXTRACTING_FEATURES') {
        await executor.query(
          `UPDATE iig_ai_scoring_outbox
           SET status = 'PUBLISHED', published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
               locked_at = NULL, locked_by = NULL, last_error = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [event.id]
        );
        return { completed: false, reason: 'TASK_ALREADY_ADVANCED' };
      }

      const completion = extracted.features.completion || {};
      const requiresEvidence = completion.speech === 'PENDING'
        || completion.taskSemantic === 'PENDING';
      const featureResult = await executor.query(
        `INSERT INTO iig_ai_feature_sets
           (question_attempt_id, transcription_id, status, feature_version,
            input_fingerprint, features)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT ON CONSTRAINT uq_iig_ai_feature_sets_input
         DO UPDATE SET updated_at = CURRENT_TIMESTAMP
         RETURNING id, status`,
        [
          task.questionAttemptId,
          task.transcriptionId || null,
          requiresEvidence ? 'PENDING' : 'READY',
          featureVersion,
          extracted.inputFingerprint,
          JSON.stringify(extracted.features),
        ]
      );
      const featureSet = featureResult.rows[0];
      await executor.query(
        `UPDATE iig_ai_question_runs
         SET feature_set_id = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [task.questionRunId, featureSet.id]
      );

      const pendingStages = [];
      if (featureSet.status !== 'READY' && completion.speech === 'PENDING') {
        const eventType = 'SPEECH_EVIDENCE_REQUESTED';
        await executor.query(
          `INSERT INTO iig_ai_scoring_outbox
             (scoring_run_id, event_type, deduplication_key, payload)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (deduplication_key) DO NOTHING`,
          [
            task.runId,
            eventType,
            deduplicationKey(`iig-ai-feature-set:${featureSet.id}:speech-evidence`, {
              featureVersion,
              inputFingerprint: extracted.inputFingerprint,
            }),
            JSON.stringify({
              scoringRunId: task.runId,
              questionRunId: task.questionRunId,
              questionAttemptId: task.questionAttemptId,
              featureSetId: featureSet.id,
              transcriptionId: task.transcriptionId,
              scorerType: task.scorerType,
              taskProfile: extracted.features.task.profile,
              featureVersion,
              evidenceContractVersion: extracted.features.evidenceContract?.contractVersion || null,
            }),
          ]
        );
        pendingStages.push('SPEECH_EVIDENCE');
      }
      if (featureSet.status !== 'READY' && completion.taskSemantic === 'PENDING') {
        const eventType = 'TASK_EVIDENCE_REQUESTED';
        await executor.query(
          `INSERT INTO iig_ai_scoring_outbox
             (scoring_run_id, event_type, deduplication_key, payload)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (deduplication_key) DO NOTHING`,
          [
            task.runId,
            eventType,
            deduplicationKey(`iig-ai-feature-set:${featureSet.id}:task-evidence`, {
              featureVersion,
              inputFingerprint: extracted.inputFingerprint,
              taskProfile: extracted.features.task.profile,
            }),
            JSON.stringify({
              scoringRunId: task.runId,
              questionRunId: task.questionRunId,
              questionAttemptId: task.questionAttemptId,
              featureSetId: featureSet.id,
              transcriptionId: task.transcriptionId,
              scorerType: task.scorerType,
              taskProfile: extracted.features.task.profile,
              featureVersion,
              evidenceContractVersion: extracted.features.evidenceContract?.contractVersion || null,
            }),
          ]
        );
        pendingStages.push('TASK_EVIDENCE');
      }

      if (!pendingStages.length && featureSet.status !== 'READY') {
        throw permanentError(
          'Feature extraction produced no pending evidence stage but the feature set is not ready.',
          'IIG_AI_FEATURE_PLAN_INVALID'
        );
      }
      if (!pendingStages.length) {
        await executor.query(
          `UPDATE iig_ai_question_runs
           SET status = 'LLM_SCORING', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
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
              featureSetId: featureSet.id,
              featureVersion,
            }),
            JSON.stringify({
              scoringRunId: task.runId,
              questionRunId: task.questionRunId,
              featureSetId: featureSet.id,
            }),
          ]
        );
      }

      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, question_run_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'COMMON_FEATURES_EXTRACTED', 'EXTRACTING_FEATURES',
                 'EXTRACTING_FEATURES', $3::jsonb)`,
        [task.runId, task.questionRunId, JSON.stringify({
          featureSetId: featureSet.id,
          featureVersion,
          schemaVersion: extracted.features.schemaVersion,
          pendingStages,
        })]
      );
      await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
             locked_at = NULL, locked_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id]
      );
      return { completed: true, featureSetId: featureSet.id, pendingStages };
    });
  }

  async markRetry({ event, error, delayMs }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
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

  async markDeadLetter({ event, task, error }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      await executor.query(
        `UPDATE iig_ai_scoring_outbox
         SET status = 'DEAD_LETTER', locked_at = NULL, locked_by = NULL,
             last_error = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id, String(error.message).slice(0, 2000)]
      );
      if (task?.questionRunId) {
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
           VALUES ($1, $2, 'FEATURE_EXTRACTION_DEAD_LETTERED',
                   'EXTRACTING_FEATURES', 'FAILED', $3::jsonb)`,
          [task.runId, task.questionRunId, JSON.stringify({
            code: error.code,
            attempt: event.publishAttempts,
          })]
        );
      }
      return true;
    });
  }
}

const repository = new FeatureExtractionRepository();
repository.FeatureExtractionRepository = FeatureExtractionRepository;
repository.mapOutbox = mapOutbox;
repository.mapTask = mapTask;
repository.permanentError = permanentError;

module.exports = repository;
