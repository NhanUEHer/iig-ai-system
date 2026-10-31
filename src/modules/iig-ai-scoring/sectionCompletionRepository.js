const SECTION_TYPES = Object.freeze({ SPEAKING: 'SPEAKING', WRITING: 'WRITING' });
const TERMINAL_SECTION_STATUSES = new Set(['COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED']);
const WEBHOOK_RESULT_STATUSES = new Set(['COMPLETED', 'COMPLETED_WITH_ISSUES']);
const webhookEventRepository = require('../ai-scoring-webhooks/webhookEventRepository');

function deriveOverallStatus(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 'PENDING';
  const latestBySection = new Map(rows.map(row => [row.section_type, row.status]));
  const statuses = Object.values(SECTION_TYPES).map(section => latestBySection.get(section));
  if (statuses.some(status => !status || !TERMINAL_SECTION_STATUSES.has(status))) {
    return 'PROCESSING';
  }
  if (statuses.some(status => status === 'FAILED')) return 'FAILED';
  return statuses.every(status => status === 'COMPLETED')
    ? 'COMPLETED'
    : 'COMPLETED_WITH_ISSUES';
}

const PERSIST_SECTION_STATUS_SQL = `
  WITH section_upsert AS (
    INSERT INTO iig_ai_section_statuses
      (submission_id, section_type, status, started_at, completed_at)
    VALUES (
      $1, $2, $3::varchar(32), CURRENT_TIMESTAMP,
      CASE WHEN $3::varchar(32) IN ('COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED')
           THEN CURRENT_TIMESTAMP ELSE NULL END
    )
    ON CONFLICT (submission_id, section_type) DO UPDATE
    SET status = EXCLUDED.status,
        started_at = COALESCE(iig_ai_section_statuses.started_at, EXCLUDED.started_at),
        completed_at = EXCLUDED.completed_at,
        updated_at = CURRENT_TIMESTAMP
    RETURNING submission_id, section_type, status, completed_at
  ),
  section_rollup AS (
    SELECT section_type, status, completed_at
    FROM iig_ai_section_statuses
    WHERE submission_id = $1
      AND section_type <> $2
    UNION ALL
    SELECT section_type, status, completed_at
    FROM section_upsert
  ),
  overall AS (
    SELECT CASE
      WHEN COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED')) = 2
        THEN CASE WHEN BOOL_OR(status = 'FAILED') THEN 'FAILED'
                  WHEN BOOL_AND(status = 'COMPLETED') THEN 'COMPLETED'
                  ELSE 'COMPLETED_WITH_ISSUES' END
      ELSE 'PROCESSING'
    END::varchar(32) AS status,
    MAX(completed_at) AS completed_at
    FROM section_rollup
  )
  UPDATE iig_submissions submission
  SET ai_scoring_status = overall.status,
      ai_scoring_started_at = COALESCE(submission.ai_scoring_started_at, CURRENT_TIMESTAMP),
      ai_scoring_completed_at = CASE
        WHEN overall.status IN ('COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED')
          THEN COALESCE(submission.ai_scoring_completed_at, overall.completed_at, CURRENT_TIMESTAMP)
        ELSE NULL
      END,
      updated_at = CURRENT_TIMESTAMP
  FROM overall
  WHERE submission.id = $1
  RETURNING overall.status AS overall_status`;

class SectionCompletionRepository {
  async markStarted(executor, submissionId, sectionType) {
    return this.persistStatus(executor, submissionId, sectionType, 'PROCESSING');
  }

  async persistStatus(executor, submissionId, sectionType, status) {
    if (!Object.values(SECTION_TYPES).includes(sectionType)) {
      throw new Error(`Unsupported AI scoring section: ${sectionType}`);
    }
    await executor.query(
      `SELECT id FROM iig_submissions WHERE id = $1 FOR UPDATE`,
      [submissionId]
    );
    const result = await executor.query(PERSIST_SECTION_STATUS_SQL, [
      submissionId,
      sectionType,
      status,
    ]);
    const overallStatus = result.rows[0]?.overall_status || null;
    if (WEBHOOK_RESULT_STATUSES.has(overallStatus)) {
      await webhookEventRepository.enqueueTerminalForSubmission(executor, {
        submissionId,
        status: overallStatus,
      });
    }
    return overallStatus;
  }
}

const repository = new SectionCompletionRepository();
repository.SectionCompletionRepository = SectionCompletionRepository;
repository.SECTION_TYPES = SECTION_TYPES;
repository.TERMINAL_SECTION_STATUSES = TERMINAL_SECTION_STATUSES;
repository.WEBHOOK_RESULT_STATUSES = WEBHOOK_RESULT_STATUSES;
repository.deriveOverallStatus = deriveOverallStatus;
repository.PERSIST_SECTION_STATUS_SQL = PERSIST_SECTION_STATUS_SQL;

module.exports = repository;
