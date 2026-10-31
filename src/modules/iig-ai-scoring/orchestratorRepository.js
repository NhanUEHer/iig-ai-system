const crypto = require('node:crypto');
const db = require('../../config/db');

const SPEAKING_TYPES = new Set([
  'READ_TEXT_ALOUD',
  'DESCRIBE_PICTURE',
  'RESPOND_TO_QUESTIONS',
  'RESPOND_USING_INFORMATION',
  'EXPRESS_AN_OPINION',
]);

const WRITING_TYPES = new Set([
  'WRITE_SENTENCE_PICTURE',
  'RESPOND_TO_WRITTEN_REQUEST',
  'WRITE_OPINION_ESSAY',
]);

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

function deduplicationKey(prefix, identity) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return `${prefix}:${digest}:v1`;
}

class OrchestratorRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    const result = await this.db.query(
      `UPDATE iig_ai_scoring_outbox
       SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
           available_at = CURRENT_TIMESTAMP,
           last_error = 'Worker lease expired.', updated_at = CURRENT_TIMESTAMP
       WHERE event_type = 'AI_SCORING_REQUESTED' AND status = 'PROCESSING'
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
           WHERE event_type = 'AI_SCORING_REQUESTED'
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

  async dispatchRun({ event, sttConfig, rtaSttConfig, featureVersion }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ai_scoring_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2
         FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return { dispatched: false, reason: 'LEASE_LOST' };

      const runResult = await executor.query(
        `SELECT * FROM iig_ai_scoring_runs WHERE id = $1 FOR UPDATE`,
        [event.runId]
      );
      const run = runResult.rows[0];
      if (!run) {
        throw permanentError('The AI scoring run does not exist.', 'IIG_AI_SCORING_RUN_NOT_FOUND');
      }
      if (run.status !== 'QUEUED') {
        await executor.query(
          `UPDATE iig_ai_scoring_outbox
           SET status = 'PUBLISHED', published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
               locked_at = NULL, locked_by = NULL, last_error = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [event.id]
        );
        return { dispatched: false, reason: 'RUN_ALREADY_STARTED', runStatus: run.status };
      }

      const tasksResult = await executor.query(
        `SELECT question_run.id AS question_run_id,
                question_run.question_attempt_id,
                question_run.input_fingerprint,
                attempt.ai_input,
                question.scorer_type,
                media.id AS media_asset_id,
                media.checksum_sha256,
                media.status AS media_status
         FROM iig_ai_question_runs question_run
         JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
         JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
         LEFT JOIN iig_media_assets media
           ON media.question_attempt_id = attempt.id
          AND media.asset_role = 'STUDENT_AUDIO'
          AND media.asset_index = 0
         WHERE question_run.scoring_run_id = $1
           AND question_run.status = 'QUEUED'
         ORDER BY question.sort_order, question_run.id
         FOR UPDATE OF question_run`,
        [event.runId]
      );
      if (!tasksResult.rows.length) {
        throw permanentError('The AI scoring run has no queued question tasks.', 'IIG_AI_QUESTION_TASKS_MISSING');
      }

      let transcriptionTasks = 0;
      let featureTasks = 0;
      let zeroScoringTasks = 0;
      for (const task of tasksResult.rows) {
        const upstreamZeroReason = String(task.ai_input?.businessZeroReason || '').trim();
        if ((SPEAKING_TYPES.has(task.scorer_type) || WRITING_TYPES.has(task.scorer_type))
            && upstreamZeroReason) {
          const featureSetResult = await executor.query(
            `INSERT INTO iig_ai_feature_sets
               (question_attempt_id, transcription_id, status, feature_version,
                input_fingerprint, features)
             VALUES ($1, NULL, 'READY', $2, $3, $4::jsonb)
             ON CONFLICT ON CONSTRAINT uq_iig_ai_feature_sets_input
             DO UPDATE SET status = 'READY', features = EXCLUDED.features,
                           error_code = NULL, error_message = NULL,
                           updated_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [
              task.question_attempt_id,
              featureVersion,
              task.input_fingerprint,
              JSON.stringify({
                schemaVersion: 2,
                featureVersion,
                scorerType: task.scorer_type,
                completion: {
                  deterministic: 'READY',
                  speech: 'NOT_REQUIRED',
                  taskSemantic: 'NOT_REQUIRED',
                },
                upstreamZeroReason,
              }),
            ]
          );
          const featureSetId = featureSetResult.rows[0].id;
          await executor.query(
            `UPDATE iig_ai_question_runs
             SET status = 'LLM_SCORING', feature_set_id = $2,
                 started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [task.question_run_id, featureSetId]
          );
          await executor.query(
            `INSERT INTO iig_ai_scoring_outbox
               (scoring_run_id, event_type, deduplication_key, payload)
             VALUES ($1, 'QUESTION_SCORING_REQUESTED', $2, $3::jsonb)
             ON CONFLICT (deduplication_key) DO NOTHING`,
            [
              event.runId,
              deduplicationKey(`iig-ai-question-run:${task.question_run_id}:score`, {
                featureSetId,
                featureVersion,
                upstreamZeroReason,
              }),
              JSON.stringify({
                scoringRunId: event.runId,
                questionRunId: task.question_run_id,
                featureSetId,
                upstreamZeroReason,
              }),
            ]
          );
          zeroScoringTasks += 1;
          continue;
        }
        if (SPEAKING_TYPES.has(task.scorer_type)) {
          if (task.media_status !== 'READY' || !task.media_asset_id || !task.checksum_sha256) {
            throw permanentError(
              `Speaking question run ${task.question_run_id} has no ready checksum-addressed student audio.`,
              'IIG_AI_STUDENT_AUDIO_NOT_READY'
            );
          }
          const selectedSttConfig = sttConfig;
          const transcriptionResult = await executor.query(
            `INSERT INTO iig_ai_answer_transcriptions
               (question_attempt_id, media_asset_id, status, provider, model_name,
                model_version, prompt_version, audio_checksum_sha256)
             VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7)
             ON CONFLICT ON CONSTRAINT uq_iig_ai_answer_transcriptions_input
             DO UPDATE SET
               status = CASE
                 WHEN iig_ai_answer_transcriptions.status = 'COMPLETED' THEN 'COMPLETED'
                 ELSE 'PENDING'
               END,
               error_code = CASE
                 WHEN iig_ai_answer_transcriptions.status = 'COMPLETED'
                   THEN iig_ai_answer_transcriptions.error_code
                 ELSE NULL
               END,
               error_message = CASE
                 WHEN iig_ai_answer_transcriptions.status = 'COMPLETED'
                   THEN iig_ai_answer_transcriptions.error_message
                 ELSE NULL
               END,
               updated_at = CURRENT_TIMESTAMP
             RETURNING id, status`,
            [
              task.question_attempt_id,
              task.media_asset_id,
              selectedSttConfig.provider,
              selectedSttConfig.modelName,
              selectedSttConfig.modelVersion,
              selectedSttConfig.promptVersion,
              task.checksum_sha256,
            ]
          );
          const transcription = transcriptionResult.rows[0];
          if (transcription.status === 'COMPLETED') {
            await executor.query(
              `UPDATE iig_ai_question_runs
               SET status = 'EXTRACTING_FEATURES', transcription_id = $2,
                   started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [task.question_run_id, transcription.id]
            );
            await executor.query(
              `INSERT INTO iig_ai_scoring_outbox
                 (scoring_run_id, event_type, deduplication_key, payload)
               VALUES ($1, 'FEATURE_EXTRACTION_REQUESTED', $2, $3::jsonb)
               ON CONFLICT (deduplication_key) DO NOTHING`,
              [
                event.runId,
                deduplicationKey(`iig-ai-question-run:${task.question_run_id}:features`, {
                  featureVersion,
                  transcriptionId: transcription.id,
                }),
                JSON.stringify({
                  scoringRunId: event.runId,
                  questionRunId: task.question_run_id,
                  questionAttemptId: task.question_attempt_id,
                  transcriptionId: transcription.id,
                  featureVersion,
                }),
              ]
            );
            featureTasks += 1;
            continue;
          }
          await executor.query(
            `UPDATE iig_ai_question_runs
             SET status = 'TRANSCRIBING', transcription_id = $2,
                 started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [task.question_run_id, transcription.id]
          );
          await executor.query(
            `INSERT INTO iig_ai_scoring_outbox
               (scoring_run_id, event_type, deduplication_key, payload)
             VALUES ($1, 'ANSWER_TRANSCRIPTION_REQUESTED', $2, $3::jsonb)
             ON CONFLICT (deduplication_key) DO NOTHING`,
            [
              event.runId,
              deduplicationKey(`iig-ai-question-run:${task.question_run_id}:answer-stt`, {
                audioChecksum: task.checksum_sha256,
                provider: selectedSttConfig.provider,
                modelName: selectedSttConfig.modelName,
                modelVersion: selectedSttConfig.modelVersion,
                promptVersion: selectedSttConfig.promptVersion,
              }),
              JSON.stringify({
                scoringRunId: event.runId,
                questionRunId: task.question_run_id,
                questionAttemptId: task.question_attempt_id,
                transcriptionId: transcription.id,
                mediaAssetId: task.media_asset_id,
              }),
            ]
          );
          transcriptionTasks += 1;
          continue;
        }

        await executor.query(
          `UPDATE iig_ai_question_runs
           SET status = 'EXTRACTING_FEATURES', started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [task.question_run_id]
        );
        await executor.query(
          `INSERT INTO iig_ai_scoring_outbox
             (scoring_run_id, event_type, deduplication_key, payload)
           VALUES ($1, 'FEATURE_EXTRACTION_REQUESTED', $2, $3::jsonb)
           ON CONFLICT (deduplication_key) DO NOTHING`,
          [
            event.runId,
            deduplicationKey(`iig-ai-question-run:${task.question_run_id}:features`, {
              featureVersion,
              questionAttemptId: task.question_attempt_id,
            }),
            JSON.stringify({
              scoringRunId: event.runId,
              questionRunId: task.question_run_id,
              questionAttemptId: task.question_attempt_id,
              featureVersion,
            }),
          ]
        );
        featureTasks += 1;
      }

      const nextStatus = transcriptionTasks > 0
        ? 'TRANSCRIBING'
        : featureTasks > 0 ? 'EXTRACTING_FEATURES' : 'SCORING_QUESTIONS';
      await executor.query(
        `UPDATE iig_ai_scoring_runs
         SET status = $2, started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
             error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.runId, nextStatus]
      );
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, event_type, from_status, to_status, details)
         VALUES ($1, 'AI_SCORING_DISPATCHED', 'QUEUED', $2, $3::jsonb)`,
        [event.runId, nextStatus, JSON.stringify({
          transcriptionTasks, featureTasks, zeroScoringTasks, featureVersion,
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
      return {
        dispatched: true,
        runStatus: nextStatus,
        transcriptionTasks,
        featureTasks,
        zeroScoringTasks,
      };
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
      await executor.query(
        `UPDATE iig_ai_scoring_runs
         SET error_code = $2, error_message = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'QUEUED'`,
        [event.runId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, event_type, from_status, to_status, details)
         VALUES ($1, 'AI_SCORING_DISPATCH_RETRY_SCHEDULED', 'QUEUED', 'QUEUED', $2::jsonb)`,
        [event.runId, JSON.stringify({ code: error.code, delayMs, attempt: event.publishAttempts })]
      );
      return true;
    });
  }

  async markDeadLetter({ event, error }) {
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
      await executor.query(
        `UPDATE iig_ai_question_runs
         SET status = 'FAILED', error_code = $2, error_message = $3,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE scoring_run_id = $1 AND status = 'QUEUED'`,
        [event.runId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_ai_group_results
         SET status = 'FAILED', error_code = $2, error_message = $3,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE scoring_run_id = $1 AND status = 'WAITING'`,
        [event.runId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_ai_scoring_runs
         SET status = 'FAILED', error_code = $2, error_message = $3,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'QUEUED'`,
        [event.runId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, event_type, from_status, to_status, details)
         VALUES ($1, 'AI_SCORING_DISPATCH_DEAD_LETTERED', 'QUEUED', 'FAILED', $2::jsonb)`,
        [event.runId, JSON.stringify({ code: error.code, attempt: event.publishAttempts })]
      );
      return true;
    });
  }
}

const repository = new OrchestratorRepository();
repository.OrchestratorRepository = OrchestratorRepository;
repository.SPEAKING_TYPES = SPEAKING_TYPES;
repository.WRITING_TYPES = WRITING_TYPES;
repository.mapOutbox = mapOutbox;
repository.permanentError = permanentError;
repository.deduplicationKey = deduplicationKey;

module.exports = repository;
