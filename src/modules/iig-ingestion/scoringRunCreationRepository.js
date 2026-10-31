const db = require('../../config/db');
const scoringCompletionRepository = require('../iig-ai-scoring/scoringCompletionRepository');

const SPEAKING_GROUPS = new Set([
  'READ_TEXT_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_Q5_Q10', 'EXPRESS_OPINION',
]);
const WRITING_GROUPS = new Set([
  'WRITE_SENTENCE_Q1_Q5', 'WRITTEN_REQUEST_Q6_Q7', 'OPINION_ESSAY_Q8',
]);

function sectionsForGroups(groups) {
  const values = new Set();
  for (const group of Array.isArray(groups) ? groups : []) {
    if (SPEAKING_GROUPS.has(group)) values.add('SPEAKING');
    if (WRITING_GROUPS.has(group)) values.add('WRITING');
  }
  return [...values];
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

class ScoringRunCreationRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    const result = await this.db.query(
      `UPDATE iig_ingestion_outbox
       SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
           available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
           updated_at = CURRENT_TIMESTAMP
       WHERE event_type = 'AI_SCORING_RUNS_REQUESTED' AND status = 'PROCESSING'
         AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
       RETURNING id`,
      [staleMs]
    );
    return result.rowCount || result.rows.length;
  }

  async reconcileSealedPlans(limit = 100) {
    const result = await this.db.query(
      `SELECT plan.submission_id
       FROM iig_ai_scoring_plans plan
       JOIN iig_submissions submission ON submission.id = plan.submission_id
       WHERE plan.status = 'SEALED'
         AND submission.ai_scoring_status = 'PROCESSING'
       ORDER BY plan.sealed_at, plan.id
       LIMIT $1`,
      [limit]
    );
    const summary = { selected: result.rows.length, reconciled: 0, failed: 0, failures: [] };
    for (const row of result.rows) {
      try {
        await this.db.transaction(executor => scoringCompletionRepository.refreshBySubmission(
          executor,
          row.submission_id
        ));
        summary.reconciled += 1;
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({
          submissionId: row.submission_id,
          code: error.code || 'SCORING_PLAN_RECONCILIATION_FAILED',
          message: String(error.message || 'Scoring plan reconciliation failed.').slice(0, 500),
        });
      }
    }
    return summary;
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT id FROM iig_ingestion_outbox
           WHERE event_type = 'AI_SCORING_RUNS_REQUESTED'
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

  async beginPlan(event, groups) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return null;
      const normalizedGroups = [...new Set(groups)].sort();
      const result = await executor.query(
        `INSERT INTO iig_ai_scoring_plans
           (scoring_job_id, submission_id, status, requested_groups, expected_run_count)
         VALUES ($1, $2, 'BUILDING', $3::text[], $4)
         ON CONFLICT (scoring_job_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
         RETURNING id, status, requested_groups, expected_run_count`,
        [event.jobId, event.payload.submissionId, normalizedGroups, normalizedGroups.length]
      );
      const plan = result.rows[0];
      const persistedGroups = [...(plan.requested_groups || [])].sort();
      if (Number(plan.expected_run_count) !== normalizedGroups.length
          || JSON.stringify(persistedGroups) !== JSON.stringify(normalizedGroups)) {
        throw Object.assign(new Error('The persisted scoring plan does not match the requested groups.'), {
          code: 'IIG_AI_SCORING_PLAN_CONFLICT', retryable: false,
        });
      }
      return { id: plan.id, status: plan.status };
    });
  }

  async complete(event, runs, planId) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      const sealed = await executor.query(
        `WITH scope AS (
           SELECT run.scoring_plan_id,
                  COUNT(DISTINCT run.id)::integer AS run_count,
                  COUNT(DISTINCT question_run.id)::integer AS question_count,
                  COUNT(DISTINCT group_result.id)::integer AS group_count
           FROM iig_ai_scoring_runs run
           LEFT JOIN iig_ai_question_runs question_run
             ON question_run.scoring_run_id = run.id
           LEFT JOIN iig_ai_group_results group_result
             ON group_result.scoring_run_id = run.id
           WHERE run.scoring_plan_id = $1
           GROUP BY run.scoring_plan_id
         )
         UPDATE iig_ai_scoring_plans plan
         SET status = 'SEALED', sealed_at = COALESCE(sealed_at, CURRENT_TIMESTAMP),
             expected_question_count = scope.question_count,
             expected_group_count = scope.group_count,
             updated_at = CURRENT_TIMESTAMP
         FROM scope
         WHERE plan.id = $1 AND plan.scoring_job_id = $2
           AND scope.scoring_plan_id = plan.id
           AND plan.expected_run_count = scope.run_count
           AND scope.question_count > 0
           AND scope.group_count > 0
         RETURNING plan.submission_id`,
        [planId, event.jobId]
      );
      if (!sealed.rows[0]) {
        throw Object.assign(new Error('The scoring plan cannot be sealed before all runs exist.'), {
          code: 'IIG_AI_SCORING_PLAN_INCOMPLETE', retryable: true,
        });
      }
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, submission_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'AI_SCORING_RUNS_CREATED', 'READY_FOR_AI', 'READY_FOR_AI', $3::jsonb)`,
        [event.jobId, event.payload.submissionId, JSON.stringify({ runs })]
      );
      await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
           locked_at = NULL, locked_by = NULL, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id]
      );
      await scoringCompletionRepository.refreshBySubmission(
        executor,
        sealed.rows[0].submission_id
      );
      return true;
    });
  }

  async markRetry({ event, error, delayMs }) {
    return this.db.transaction(async executor => {
      const updated = await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'FAILED',
           available_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
           locked_at = NULL, locked_by = NULL, last_error = $3,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $4
         RETURNING id`,
        [event.id, delayMs, String(error.message).slice(0, 2000), event.lockedBy]
      );
      if (!updated.rows[0]) return false;
      await executor.query(
        `UPDATE iig_scoring_jobs SET retry_count = retry_count + 1,
           next_retry_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
           error_code = $3, error_message = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.jobId, delayMs, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, submission_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'AI_RUN_CREATION_RETRY_SCHEDULED',
                 'READY_FOR_AI', 'READY_FOR_AI', $3::jsonb)`,
        [event.jobId, event.payload.submissionId, JSON.stringify({
          code: error.code, attempt: event.publishAttempts, delayMs,
        })]
      );
      return true;
    });
  }

  async markDeadLetter({ event, error }) {
    return this.db.transaction(async executor => {
      const updated = await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'DEAD_LETTER',
           locked_at = NULL, locked_by = NULL, last_error = $2,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $3
         RETURNING id`,
        [event.id, String(error.message).slice(0, 2000), event.lockedBy]
      );
      if (!updated.rows[0]) return false;
      const sections = sectionsForGroups(event.payload.groups);
      for (const section of sections) {
        await executor.query(
          `INSERT INTO iig_ai_section_statuses
             (submission_id, section_type, status, started_at, completed_at)
           VALUES ($1, $2, 'FAILED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (submission_id, section_type) DO UPDATE SET
             status = 'FAILED', started_at = COALESCE(iig_ai_section_statuses.started_at, CURRENT_TIMESTAMP),
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
          [event.payload.submissionId, section]
        );
      }
      await executor.query(
        `UPDATE iig_submissions SET ai_scoring_status = 'FAILED',
           ai_scoring_started_at = COALESCE(ai_scoring_started_at, CURRENT_TIMESTAMP),
           ai_scoring_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.payload.submissionId]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs SET status = 'FAILED', completed_at = CURRENT_TIMESTAMP,
           next_retry_at = NULL, error_code = $2, error_message = $3,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.jobId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, submission_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'AI_RUN_CREATION_DEAD_LETTERED',
                 'READY_FOR_AI', 'FAILED', $3::jsonb)`,
        [event.jobId, event.payload.submissionId, JSON.stringify({
          code: error.code, attempt: event.publishAttempts, sections,
        })]
      );
      return true;
    });
  }
}

const repository = new ScoringRunCreationRepository();
repository.ScoringRunCreationRepository = ScoringRunCreationRepository;
repository.mapOutbox = mapOutbox;
repository.sectionsForGroups = sectionsForGroups;

module.exports = repository;
