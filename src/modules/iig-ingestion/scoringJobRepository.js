const db = require('../../config/db');
const {
  normalizeFailure,
  isTerminalFailure,
} = require('./failureContract');

class IngestionRepositoryConflict extends Error {
  constructor(kind) {
    super(kind);
    this.name = 'IngestionRepositoryConflict';
    this.kind = kind;
  }
}

function mapJob(row) {
  if (!row) return null;
  const ingestionStatus = row.status;
  const aiScoringStatus = row.ai_scoring_status || null;
  const lifecycleStatus = ['COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED'].includes(aiScoringStatus)
    ? aiScoringStatus
    : (ingestionStatus === 'READY_FOR_AI' && aiScoringStatus === 'PROCESSING'
      ? 'AI_SCORING'
      : ingestionStatus);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    credentialId: row.credential_id || null,
    partner: row.partner,
    keycode: row.keycode,
    scoringId: row.source_scoring_id,
    sourceKey: row.source_key,
    requestHash: row.request_hash,
    retryOfJobId: row.retry_of_job_id || null,
    status: lifecycleStatus,
    ingestionStatus,
    aiScoringStatus,
    progress: {
      totalQuestions: Number(row.total_questions || 0),
      readyQuestions: Number(row.ready_questions || 0),
      invalidQuestions: Number(row.invalid_questions || 0),
      pendingQuestions: Number(row.pending_questions || 0),
    },
    error: row.error_code || row.error_message ? {
      code: row.error_code || 'INGESTION_FAILED',
      message: row.error_message || null,
    } : null,
    retryCount: Number(row.retry_count || 0),
    nextRetryAt: row.next_retry_at || null,
    acceptedAt: row.accepted_at,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function maxAttemptsForEvent(eventType) {
  const value = String(eventType || '').toUpperCase();
  if (value === 'SOURCE_FETCH_REQUESTED') return Number(process.env.IIG_INGESTION_SOURCE_MAX_ATTEMPTS || 5);
  if (value === 'SOURCE_SYNC_REQUESTED') return Number(process.env.IIG_INGESTION_SYNC_MAX_ATTEMPTS || 5);
  if (value === 'MEDIA_PREPARATION_REQUESTED') return Number(process.env.IIG_INGESTION_MEDIA_MAX_ATTEMPTS || 5);
  if (value === 'INPUT_VALIDATION_REQUESTED') return Number(process.env.IIG_INGESTION_VALIDATION_MAX_ATTEMPTS || 5);
  if (value === 'AI_SCORING_RUNS_REQUESTED') return Number(process.env.IIG_AI_RUN_CREATION_MAX_ATTEMPTS || 5);
  return Number(process.env.IIG_AI_WORKER_MAX_ATTEMPTS || 5);
}

function questionId(row) {
  const number = Number(row.question_number || 0);
  if (!number) return null;
  return `${String(row.section_type || '').toUpperCase() === 'WRITING' ? 'w' : 's'}_q${number}`;
}

function mapIssue(row) {
  const terminal = ['FAILED', 'DEAD_LETTER', 'INVALID_INPUT', 'INVALID_AUDIO'].includes(
    String(row.status || '').toUpperCase()
  );
  return normalizeFailure({
    code: row.error_code,
    message: row.error_message,
    eventType: row.event_type,
    status: row.status,
    stage: row.stage || undefined,
    scope: row.scope,
    questionId: questionId(row),
    groupCode: row.group_code,
    retryable: false,
    terminal,
  });
}

function mapQuestionResolution(row) {
  return {
    questionId: questionId(row),
    section: row.section_type,
    readinessStatus: row.readiness_status,
    scoringDisposition: row.scoring_disposition,
    zeroReason: row.zero_reason || null,
    zeroOrigin: row.zero_origin || null,
    metadata: row.resolution_metadata || {},
    resolvedAt: row.resolved_at || null,
  };
}

function mapRetry(row) {
  if (!row) {
    return {
      state: 'NONE', retryable: false, attempt: 0, maxAttempts: 0, nextRetryAt: null,
    };
  }
  const status = String(row.status || '').toUpperCase();
  const state = status === 'FAILED' ? 'SCHEDULED'
    : status === 'PROCESSING' ? 'IN_PROGRESS'
      : status === 'DEAD_LETTER' ? 'EXHAUSTED'
        : 'NONE';
  return {
    state,
    retryable: state === 'SCHEDULED' || state === 'IN_PROGRESS',
    attempt: Number(row.publish_attempts || 0),
    maxAttempts: maxAttemptsForEvent(row.event_type),
    nextRetryAt: state === 'SCHEDULED' ? row.available_at : null,
  };
}

function scoringCompletedSuccessfully(row) {
  return ['COMPLETED', 'COMPLETED_WITH_ISSUES'].includes(row?.ai_scoring_status);
}

class ScoringJobRepository {
  constructor(database = db) {
    this.db = database;
  }

  async createOrReuse({
    tenantId, credentialId, partner, keycode, scoringId, sourceKey, requestHash, idempotencyKey,
  }) {
    return this.db.transaction(async executor => {
      if (idempotencyKey) {
        const existingKey = await executor.query(
          `SELECT k.request_hash AS idempotency_request_hash, j.*,
                  submission.ai_scoring_status
           FROM iig_scoring_job_idempotency_keys k
           JOIN iig_scoring_jobs j ON j.id = k.scoring_job_id
           LEFT JOIN iig_submissions submission ON submission.scoring_job_id = j.id
           WHERE k.tenant_id = $1 AND k.idempotency_key = $2
           FOR UPDATE OF k, j`,
          [tenantId, idempotencyKey]
        );
        if (existingKey.rows[0]) {
          if (existingKey.rows[0].idempotency_request_hash !== requestHash) {
            throw new IngestionRepositoryConflict('IDEMPOTENCY_KEY_CONFLICT');
          }
          return { job: mapJob(existingKey.rows[0]), replayed: true };
        }
      }

      await executor.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`${tenantId}:${partner.toLowerCase()}:${scoringId}`]
      );

      const existing = await executor.query(
        `SELECT job.*, submission.ai_scoring_status
         FROM iig_scoring_jobs job
         LEFT JOIN iig_submissions submission ON submission.scoring_job_id = job.id
         WHERE job.tenant_id = $1 AND job.partner = $2 AND job.source_scoring_id = $3
         ORDER BY job.accepted_at DESC, job.id DESC
         LIMIT 1
         FOR UPDATE OF job`,
        [tenantId, partner, scoringId]
      );
      const existingRow = existing.rows[0] || null;
      if (existingRow) {
        // source_key is a storage identifier whose format gained a tenant prefix
        // after existing jobs had already been persisted. The immutable request
        // hash remains the canonical identity check across both formats.
        if (existingRow.request_hash !== requestHash) {
          throw new IngestionRepositoryConflict('SCORING_IDENTITY_CONFLICT');
        }
        if (!scoringCompletedSuccessfully(existingRow)) {
          return { job: mapJob(existingRow), replayed: true };
        }
      }

      const inserted = await executor.query(
        `INSERT INTO iig_scoring_jobs
           (tenant_id, credential_id, partner, keycode, source_scoring_id, source_key, request_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [tenantId, credentialId, partner, keycode, scoringId, sourceKey, requestHash]
      );

      const row = inserted.rows[0] || null;
      if (!row) throw new Error('Unable to create the IIG scoring job.');

      if (idempotencyKey) {
        const keyInsert = await executor.query(
          `INSERT INTO iig_scoring_job_idempotency_keys
             (tenant_id, partner, idempotency_key, request_hash, scoring_job_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [tenantId, partner, idempotencyKey, requestHash, row.id]
        );
        if (!keyInsert.rows[0]) {
          const conflict = await executor.query(
            `SELECT request_hash, scoring_job_id
             FROM iig_scoring_job_idempotency_keys
             WHERE tenant_id = $1 AND idempotency_key = $2`,
            [tenantId, idempotencyKey]
          );
          const mapped = conflict.rows[0];
          if (!mapped || mapped.request_hash !== requestHash || mapped.scoring_job_id !== row.id) {
            throw new IngestionRepositoryConflict('IDEMPOTENCY_KEY_CONFLICT');
          }
        }
      }

      await executor.query(
        `INSERT INTO iig_ingestion_outbox
           (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
         VALUES ('IIG_SCORING_JOB', $1, 'SOURCE_FETCH_REQUESTED', $2, $3::jsonb)
         ON CONFLICT (deduplication_key) DO NOTHING`,
        [
          row.id,
          `iig-scoring-job:${row.id}:source-fetch:v1`,
          JSON.stringify({ jobId: row.id, partner, keycode, scoringId }),
        ]
      );

      return { job: mapJob(row), replayed: false };
    });
  }

  async findById(jobId, tenantId, partner) {
    const result = await this.db.query(
      `SELECT job.*, submission.id AS submission_id, submission.ai_scoring_status
       FROM iig_scoring_jobs job
       LEFT JOIN iig_submissions submission ON submission.scoring_job_id = job.id
       WHERE job.id = $1 AND job.tenant_id = $2 AND job.partner = $3`,
      [jobId, tenantId, partner]
    );
    const row = result.rows[0];
    if (!row) return null;
    const job = mapJob(row);
    const submissionId = row.submission_id || null;
    const [sectionsResult, retryResult, issuesResult, resolutionsResult] = await Promise.all([
      Promise.resolve({ rows: [] }),
      this.db.query(
        `SELECT event_type, status, publish_attempts, available_at, last_error, updated_at
         FROM (
           SELECT event_type, status, publish_attempts, available_at, last_error, updated_at
           FROM iig_ingestion_outbox WHERE aggregate_id = $1
           UNION ALL
           SELECT event.event_type, event.status, event.publish_attempts,
                  event.available_at, event.last_error, event.updated_at
           FROM iig_ai_scoring_outbox event
           JOIN iig_ai_scoring_runs run ON run.id = event.scoring_run_id
           JOIN iig_submissions submission ON submission.id = run.submission_id
           WHERE submission.scoring_job_id = $1
         ) events
         WHERE status IN ('PROCESSING', 'FAILED', 'DEAD_LETTER')
         ORDER BY updated_at DESC LIMIT 1`,
        [jobId]
      ),
      submissionId
        ? this.db.query(
          `WITH latest_runs AS (
             SELECT DISTINCT ON (scoring_policy_version) id
             FROM iig_ai_scoring_runs
             WHERE submission_id = $1
             ORDER BY scoring_policy_version, run_number DESC
           )
           SELECT * FROM (
             SELECT 'QUESTION'::text AS scope, question_section.section_type,
                    question.question_number, NULL::text AS group_code,
                    question_run.status, question_run.error_code,
                    question_run.error_message, 'QUESTION_SCORING'::text AS stage,
                    question_run.updated_at, NULL::text AS event_type
             FROM iig_ai_question_runs question_run
             JOIN latest_runs latest ON latest.id = question_run.scoring_run_id
             JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
             JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
             JOIN iig_exam_sections question_section ON question_section.id = question.section_id
             WHERE question_run.error_code IS NOT NULL
             UNION ALL
             SELECT 'GROUP', group_section.section_type, NULL, score_group.group_key,
                    group_result.status, group_result.error_code,
                    group_result.error_message, 'GROUP_SCORING', group_result.updated_at, NULL
             FROM iig_ai_group_results group_result
             JOIN latest_runs latest ON latest.id = group_result.scoring_run_id
             JOIN iig_exam_score_groups score_group ON score_group.id = group_result.score_group_id
             LEFT JOIN LATERAL (
               SELECT section.section_type
               FROM iig_exam_question_score_groups mapping
               JOIN iig_exam_questions question ON question.id = mapping.question_id
               JOIN iig_exam_sections section ON section.id = question.section_id
               WHERE mapping.score_group_id = group_result.score_group_id
               ORDER BY question.sort_order LIMIT 1
             ) group_section ON TRUE
             WHERE group_result.error_code IS NOT NULL
             UNION ALL
             SELECT 'QUESTION', validation_section.section_type, question.question_number, NULL,
                    attempt.readiness_status,
                    COALESCE(error.value->>'code', 'INVALID_INPUT'),
                    error.value->>'message', 'INPUT_VALIDATION', attempt.updated_at, NULL
             FROM iig_question_attempts attempt
             JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
             JOIN iig_exam_sections validation_section ON validation_section.id = question.section_id
             CROSS JOIN LATERAL jsonb_array_elements(attempt.validation_errors) error(value)
             WHERE attempt.submission_id = $1
             UNION ALL
             SELECT 'QUESTION', media_section.section_type, question.question_number, NULL,
                    asset.status, COALESCE(asset.error_code, asset.status), asset.error_message,
                    'MEDIA_PREPARATION', asset.updated_at, NULL
             FROM iig_media_assets asset
             JOIN iig_question_attempts attempt ON attempt.id = asset.question_attempt_id
             JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
             JOIN iig_exam_sections media_section ON media_section.id = question.section_id
             WHERE attempt.submission_id = $1
               AND asset.status IN ('INVALID_AUDIO', 'FAILED')
           ) issues
           ORDER BY updated_at DESC LIMIT 100`,
          [submissionId]
        )
        : Promise.resolve({ rows: [] }),
      submissionId
        ? this.db.query(
          `SELECT section.section_type, question.question_number,
                  attempt.readiness_status, attempt.scoring_disposition,
                  attempt.zero_reason, attempt.zero_origin,
                  attempt.resolution_metadata, attempt.resolved_at
           FROM iig_question_attempts attempt
           JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
           JOIN iig_exam_sections section ON section.id = question.section_id
           WHERE attempt.submission_id = $1
             AND attempt.scoring_disposition <> 'NORMAL'
           ORDER BY section.sort_order, question.sort_order`,
          [submissionId]
        )
        : Promise.resolve({ rows: [] }),
    ]);
    const retry = mapRetry(retryResult.rows[0]);
    const issues = issuesResult.rows.map(mapIssue);
    const terminal = isTerminalFailure(row);
    const baseFailure = job.error
      ? normalizeFailure({
        code: job.error.code,
        message: job.error.message,
        status: job.ingestionStatus,
        retryable: retry.retryable,
        terminal,
      })
      : (terminal || retry.state !== 'NONE' ? issues[0] || normalizeFailure({
        code: terminal ? 'SCORING_FAILED' : 'SCORING_RETRY_SCHEDULED',
        status: job.status,
        retryable: retry.retryable,
        terminal,
      }) : null);
    return {
      ...job,
      error: baseFailure ? { code: baseFailure.code, message: baseFailure.message } : job.error,
      sections: sectionsResult.rows.map(section => ({
        section: section.section_type,
        status: section.status,
        startedAt: section.started_at,
        completedAt: section.completed_at,
        updatedAt: section.updated_at,
      })),
      retry,
      failure: baseFailure,
      issues,
      questionResolutions: resolutionsResult.rows.map(mapQuestionResolution),
    };
  }

  async retryFailed({ jobId, tenantId, credentialId, partner, idempotencyKey, reason }) {
    return this.db.transaction(async executor => {
      const existingKey = await executor.query(
        `SELECT job.*, submission.ai_scoring_status
         FROM iig_scoring_job_idempotency_keys key
         JOIN iig_scoring_jobs job ON job.id = key.scoring_job_id
         LEFT JOIN iig_submissions submission ON submission.scoring_job_id = job.id
         WHERE key.tenant_id = $1 AND key.idempotency_key = $2
         FOR UPDATE OF key, job`,
        [tenantId, idempotencyKey]
      );
      if (existingKey.rows[0]) {
        if (existingKey.rows[0].retry_of_job_id !== jobId) {
          throw new IngestionRepositoryConflict('IDEMPOTENCY_KEY_CONFLICT');
        }
        return { job: mapJob(existingKey.rows[0]), replayed: true };
      }

      const targetResult = await executor.query(
        `SELECT job.*, submission.ai_scoring_status
         FROM iig_scoring_jobs job
         LEFT JOIN iig_submissions submission ON submission.scoring_job_id = job.id
         WHERE job.id = $1 AND job.tenant_id = $2 AND job.partner = $3
         FOR UPDATE OF job`,
        [jobId, tenantId, partner]
      );
      const target = targetResult.rows[0];
      if (!target) throw new IngestionRepositoryConflict('SCORING_JOB_NOT_FOUND');

      await executor.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`${tenantId}:${partner.toLowerCase()}:${target.source_scoring_id}`]
      );
      if (!isTerminalFailure(target)) throw new IngestionRepositoryConflict('SCORING_JOB_NOT_RETRYABLE');

      const newerResult = await executor.query(
        `SELECT id FROM iig_scoring_jobs
         WHERE tenant_id = $1 AND partner = $2 AND source_scoring_id = $3
         ORDER BY accepted_at DESC, id DESC LIMIT 1`,
        [tenantId, partner, target.source_scoring_id]
      );
      if (newerResult.rows[0]?.id !== target.id) {
        throw new IngestionRepositoryConflict('SCORING_JOB_SUPERSEDED');
      }

      const inserted = await executor.query(
        `INSERT INTO iig_scoring_jobs
           (tenant_id, credential_id, partner, keycode, source_scoring_id, source_key,
            request_hash, retry_of_job_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          tenantId, credentialId, target.partner, target.keycode, target.source_scoring_id,
          target.source_key, target.request_hash, target.id,
        ]
      );
      const row = inserted.rows[0];
      await executor.query(
        `INSERT INTO iig_scoring_job_idempotency_keys
           (tenant_id, partner, idempotency_key, request_hash, scoring_job_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, partner, idempotencyKey, target.request_hash, row.id]
      );
      await executor.query(
        `INSERT INTO iig_ingestion_outbox
           (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
         VALUES ('IIG_SCORING_JOB', $1, 'SOURCE_FETCH_REQUESTED', $2, $3::jsonb)`,
        [
          row.id,
          `iig-scoring-job:${row.id}:source-fetch:v1`,
          JSON.stringify({
            jobId: row.id,
            partner: target.partner,
            keycode: target.keycode,
            scoringId: target.source_scoring_id,
          }),
        ]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, event_type, from_status, to_status, details)
         VALUES
           ($1, 'JOB_RETRY_REQUESTED', $3, $3, $4::jsonb),
           ($2, 'JOB_RETRY_CREATED', NULL, 'ACCEPTED', $5::jsonb)`,
        [
          target.id,
          row.id,
          target.status,
          JSON.stringify({ retryJobId: row.id, reason: reason || null }),
          JSON.stringify({ retryOfJobId: target.id, reason: reason || null }),
        ]
      );
      return { job: mapJob(row), replayed: false };
    });
  }
}

const repository = new ScoringJobRepository();
repository.ScoringJobRepository = ScoringJobRepository;
repository.IngestionRepositoryConflict = IngestionRepositoryConflict;
repository.mapJob = mapJob;
repository.scoringCompletedSuccessfully = scoringCompletedSuccessfully;
repository.mapRetry = mapRetry;
repository.mapIssue = mapIssue;

module.exports = repository;
