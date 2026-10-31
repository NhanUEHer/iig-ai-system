const webhookEventRepository = require('../ai-scoring-webhooks/webhookEventRepository');

const TERMINAL_RUN_STATUSES = new Set([
  'COMPLETED', 'COMPLETED_WITH_ISSUES', 'REVIEW_REQUIRED', 'FAILED', 'CANCELLED',
]);
const TERMINAL_QUESTION_STATUSES = new Set([
  'SCORED', 'INVALID_INPUT', 'INVALID_AUDIO', 'REVIEW_REQUIRED', 'FAILED', 'SKIPPED',
]);
const TERMINAL_GROUP_STATUSES = new Set([
  'COMPLETED', 'FAILED', 'REVIEW_REQUIRED', 'SKIPPED',
]);
const FAILED_STATUSES = new Set(['FAILED', 'CANCELLED']);
const ISSUE_STATUSES = new Set([
  'COMPLETED_WITH_ISSUES', 'REVIEW_REQUIRED', 'INVALID_INPUT', 'INVALID_AUDIO', 'SKIPPED',
]);

function sectionForPolicy(policy) {
  if (String(policy || '').startsWith('rta-')
      || String(policy || '').startsWith('describe-picture-')
      || String(policy || '').startsWith('respond-q5-q10-')
      || String(policy || '').startsWith('express-opinion-')) return 'SPEAKING';
  if (String(policy || '').startsWith('write-sentence-')
      || String(policy || '').startsWith('written-request-')
      || String(policy || '').startsWith('opinion-essay-')) return 'WRITING';
  return null;
}

function deriveScopeStatus({ runs, questions, groups }) {
  if (!runs.length || !questions.length || !groups.length) return 'PROCESSING';
  if (runs.some(item => !TERMINAL_RUN_STATUSES.has(item.status))) return 'PROCESSING';
  if (questions.some(item => !TERMINAL_QUESTION_STATUSES.has(item.status))) return 'PROCESSING';
  if (groups.some(item => !TERMINAL_GROUP_STATUSES.has(item.status))) return 'PROCESSING';
  if (groups.some(item => item.status === 'COMPLETED' && item.finalScore == null)) return 'PROCESSING';
  const statuses = [
    ...runs.map(item => item.status),
    ...questions.map(item => item.status),
    ...groups.map(item => item.status),
  ];
  if (statuses.some(status => FAILED_STATUSES.has(status))) return 'FAILED';
  if (statuses.some(status => ISSUE_STATUSES.has(status))) return 'COMPLETED_WITH_ISSUES';
  return 'COMPLETED';
}

class ScoringCompletionRepository {
  async refreshByRun(executor, runId) {
    const result = await executor.query(
      `SELECT submission_id FROM iig_ai_scoring_runs WHERE id = $1`,
      [runId]
    );
    const submissionId = result.rows[0]?.submission_id;
    if (!submissionId) return { status: null, submissionId: null };
    return this.refreshBySubmission(executor, submissionId);
  }

  async refreshBySubmission(executor, submissionId) {
    await executor.query(
      `SELECT id FROM iig_submissions WHERE id = $1 FOR UPDATE`,
      [submissionId]
    );
    const planResult = await executor.query(
      `SELECT id, status, expected_run_count,
              expected_question_count, expected_group_count
       FROM iig_ai_scoring_plans WHERE submission_id = $1`,
      [submissionId]
    );
    const plan = planResult.rows[0];
    if (!plan || plan.status !== 'SEALED') {
      return { status: 'PROCESSING', submissionId, planStatus: plan?.status || null };
    }
    const runResult = await executor.query(
      `SELECT id, scoring_policy_version, status
       FROM iig_ai_scoring_runs WHERE scoring_plan_id = $1`,
      [plan.id]
    );
    const questionResult = await executor.query(
      `SELECT question_run.scoring_run_id, question_run.status,
              UPPER(section.section_type) AS section_type
       FROM iig_ai_question_runs question_run
       JOIN iig_ai_scoring_runs run ON run.id = question_run.scoring_run_id
       JOIN iig_question_attempts attempt ON attempt.id = question_run.question_attempt_id
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       JOIN iig_exam_sections section ON section.id = question.section_id
       WHERE run.scoring_plan_id = $1`,
      [plan.id]
    );
    const groupResult = await executor.query(
      `SELECT group_result.scoring_run_id, group_result.status,
              group_result.final_score
       FROM iig_ai_group_results group_result
       JOIN iig_ai_scoring_runs run ON run.id = group_result.scoring_run_id
       WHERE run.scoring_plan_id = $1`,
      [plan.id]
    );
    const invalidResult = await executor.query(
      `SELECT UPPER(section.section_type) AS section_type,
              attempt.scoring_disposition
       FROM iig_question_attempts attempt
       JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
       JOIN iig_exam_sections section ON section.id = question.section_id
       WHERE attempt.submission_id = $1
         AND attempt.readiness_status IN ('INVALID_AUDIO', 'INVALID_INPUT', 'REVIEW')`,
      [submissionId]
    );
    const runs = runResult.rows.map(row => ({
      id: row.id,
      policy: row.scoring_policy_version,
      status: row.status,
    }));
    const questions = questionResult.rows.map(row => ({
      runId: row.scoring_run_id, status: row.status, section: row.section_type,
    }));
    const groups = groupResult.rows.map(row => ({
      runId: row.scoring_run_id, status: row.status, finalScore: row.final_score,
    }));
    const invalidResolutions = invalidResult.rows.map(row => ({
      section: row.section_type,
      status: row.scoring_disposition === 'INVALID_PROMPT_SOURCE'
        ? 'FAILED' : 'COMPLETED_WITH_ISSUES',
    }));
    if (runs.length !== Number(plan.expected_run_count)
        || questions.length !== Number(plan.expected_question_count)
        || groups.length !== Number(plan.expected_group_count)) {
      return { status: 'PROCESSING', submissionId, planStatus: plan.status };
    }

    const sectionsByRun = new Map();
    for (const question of questions) {
      if (!sectionsByRun.has(question.runId)) sectionsByRun.set(question.runId, new Set());
      sectionsByRun.get(question.runId).add(question.section);
    }
    for (const run of runs) {
      const sections = [...(sectionsByRun.get(run.id) || [])].filter(Boolean);
      run.section = sections.length === 1 ? sections[0] : null;
    }
    if (runs.some(run => !run.section)) {
      return { status: 'PROCESSING', submissionId, planStatus: plan.status };
    }

    const sectionStatuses = {};
    for (const section of [...new Set(runs.map(run => run.section).filter(Boolean))]) {
      const sectionRunIds = new Set(runs.filter(run => run.section === section).map(run => run.id));
      sectionStatuses[section] = deriveScopeStatus({
        runs: runs.filter(run => sectionRunIds.has(run.id)),
        questions: questions.filter(question => sectionRunIds.has(question.runId)),
        groups: groups.filter(group => sectionRunIds.has(group.runId)),
      });
      const resolutionStatuses = invalidResolutions
        .filter(item => item.section === section)
        .map(item => item.status);
      if (resolutionStatuses.includes('FAILED')) sectionStatuses[section] = 'FAILED';
      else if (resolutionStatuses.length && sectionStatuses[section] === 'COMPLETED') {
        sectionStatuses[section] = 'COMPLETED_WITH_ISSUES';
      }
      const terminal = sectionStatuses[section] !== 'PROCESSING';
      await executor.query(
        `INSERT INTO iig_ai_section_statuses
           (submission_id, section_type, status, started_at, completed_at)
         VALUES ($1, $2, $3::varchar(32), CURRENT_TIMESTAMP,
                 CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)
         ON CONFLICT (submission_id, section_type) DO UPDATE SET
           status = EXCLUDED.status,
           started_at = COALESCE(iig_ai_section_statuses.started_at, EXCLUDED.started_at),
           completed_at = EXCLUDED.completed_at,
           updated_at = CURRENT_TIMESTAMP`,
        [submissionId, section, sectionStatuses[section], terminal]
      );
    }

    let status = deriveScopeStatus({ runs, questions, groups });
    if (invalidResolutions.some(item => item.status === 'FAILED')) status = 'FAILED';
    else if (invalidResolutions.length && status === 'COMPLETED') status = 'COMPLETED_WITH_ISSUES';
    const terminal = status !== 'PROCESSING';
    await executor.query(
      `UPDATE iig_submissions
       SET ai_scoring_status = $2::varchar(32),
           ai_scoring_started_at = COALESCE(ai_scoring_started_at, CURRENT_TIMESTAMP),
           ai_scoring_completed_at = CASE WHEN $3::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [submissionId, status, terminal]
    );
    if (['COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED'].includes(status)) {
      await webhookEventRepository.enqueueTerminalForSubmission(executor, {
        submissionId,
        status,
      });
    }
    return { status, submissionId, planStatus: plan.status, sectionStatuses };
  }
}

const repository = new ScoringCompletionRepository();
repository.ScoringCompletionRepository = ScoringCompletionRepository;
repository.deriveScopeStatus = deriveScopeStatus;
repository.sectionForPolicy = sectionForPolicy;
repository.TERMINAL_RUN_STATUSES = TERMINAL_RUN_STATUSES;
repository.TERMINAL_QUESTION_STATUSES = TERMINAL_QUESTION_STATUSES;
repository.TERMINAL_GROUP_STATUSES = TERMINAL_GROUP_STATUSES;

module.exports = repository;
