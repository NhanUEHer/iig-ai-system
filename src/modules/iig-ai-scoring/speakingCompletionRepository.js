const sectionCompletionRepository = require('./sectionCompletionRepository');
const scoringCompletionRepository = require('./scoringCompletionRepository');

const REQUIRED_POLICIES = Object.freeze([
  'rta-q1-q2-dify-policy-v1',
  'describe-picture-q3-q4-dify-policy-v1',
  'respond-q5-q10-dify-policy-v1',
  'express-opinion-q11-dify-policy-v1',
]);

const TERMINAL_RUN_STATUSES = new Set([
  'COMPLETED',
  'COMPLETED_WITH_ISSUES',
  'REVIEW_REQUIRED',
  'FAILED',
  'CANCELLED',
]);

function deriveSpeakingStatus(rows) {
  if (!Array.isArray(rows)) return 'PROCESSING';
  const latestByPolicy = new Map(rows.map(row => [row.scoring_policy_version, row.status]));
  if (REQUIRED_POLICIES.some(policy => !latestByPolicy.has(policy))) return 'PROCESSING';
  const statuses = REQUIRED_POLICIES.map(policy => latestByPolicy.get(policy));
  if (statuses.some(status => !TERMINAL_RUN_STATUSES.has(status))) return 'PROCESSING';
  if (statuses.some(status => ['FAILED', 'CANCELLED'].includes(status))) return 'FAILED';
  return statuses.every(status => status === 'COMPLETED')
    ? 'COMPLETED'
    : 'COMPLETED_WITH_ISSUES';
}

class SpeakingCompletionRepository {
  async markStarted(executor, submissionId) {
    return sectionCompletionRepository.markStarted(executor, submissionId, 'SPEAKING');
  }

  async refreshByRun(executor, runId) {
    const submissionResult = await executor.query(
      `SELECT submission_id, scoring_plan_id FROM iig_ai_scoring_runs WHERE id = $1`,
      [runId]
    );
    const row = submissionResult.rows[0];
    if (!row?.submission_id) return { status: null, submissionId: null, runs: [] };
    if (row.scoring_plan_id) {
      return scoringCompletionRepository.refreshBySubmission(executor, row.submission_id);
    }
    return this.refreshBySubmission(executor, row.submission_id);
  }

  async refreshBySubmission(executor, submissionId) {
    const runsResult = await executor.query(
      `SELECT DISTINCT ON (scoring_policy_version)
              scoring_policy_version, status, run_number, completed_at
       FROM iig_ai_scoring_runs
       WHERE submission_id = $1
         AND scoring_policy_version = ANY($2::text[])
       ORDER BY scoring_policy_version, run_number DESC`,
      [submissionId, REQUIRED_POLICIES]
    );
    const invalidResult = await executor.query(
      `SELECT DISTINCT CASE
         WHEN question.scorer_type = 'READ_TEXT_ALOUD'
           AND question.question_number BETWEEN 1 AND 2
           THEN 'rta-q1-q2-dify-policy-v1'
         WHEN question.scorer_type = 'DESCRIBE_PICTURE'
           AND question.question_number BETWEEN 3 AND 4
           THEN 'describe-picture-q3-q4-dify-policy-v1'
         WHEN question.scorer_type IN ('RESPOND_TO_QUESTIONS', 'RESPOND_USING_INFORMATION')
           AND question.question_number BETWEEN 5 AND 10
           THEN 'respond-q5-q10-dify-policy-v1'
         WHEN question.scorer_type = 'EXPRESS_AN_OPINION'
           AND question.question_number = 11
           THEN 'express-opinion-q11-dify-policy-v1'
         ELSE NULL
       END AS scoring_policy_version
       FROM iig_question_attempts attempt
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       WHERE attempt.submission_id = $1
         AND attempt.readiness_status = 'INVALID_INPUT'
         AND attempt.scoring_disposition = 'INVALID_PROMPT_SOURCE'`,
      [submissionId]
    );
    const latestByPolicy = new Map(runsResult.rows.map(row => [row.scoring_policy_version, row]));
    for (const row of invalidResult.rows) {
      if (!row.scoring_policy_version) continue;
      latestByPolicy.set(row.scoring_policy_version, {
        scoring_policy_version: row.scoring_policy_version,
        status: 'FAILED',
        run_number: null,
        completed_at: null,
        virtual: true,
      });
    }
    const runs = [...latestByPolicy.values()];
    if (!runs.length) return { status: null, overallStatus: null, submissionId, runs: [] };
    const status = deriveSpeakingStatus(runs);
    const overallStatus = await sectionCompletionRepository.persistStatus(
      executor,
      submissionId,
      'SPEAKING',
      status
    );
    return { status, overallStatus, submissionId, runs };
  }
}

const repository = new SpeakingCompletionRepository();
repository.SpeakingCompletionRepository = SpeakingCompletionRepository;
repository.REQUIRED_POLICIES = REQUIRED_POLICIES;
repository.TERMINAL_RUN_STATUSES = TERMINAL_RUN_STATUSES;
repository.deriveSpeakingStatus = deriveSpeakingStatus;

module.exports = repository;
