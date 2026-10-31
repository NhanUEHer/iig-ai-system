const TERMINAL_QUESTION_STATUSES = Object.freeze([
  'SCORED', 'INVALID_INPUT', 'INVALID_AUDIO', 'REVIEW_REQUIRED', 'FAILED', 'SKIPPED',
]);

async function lockRun(executor, runId) {
  // Question workers finish concurrently. Serialize only the short database
  // finalization phase for one run so a waiter counts rows after the preceding
  // completion transaction commits. AI/provider work remains fully concurrent.
  await executor.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',
    [runId]
  );
}

async function refreshQuestionProgress(executor, runId) {
  await lockRun(executor, runId);
  const result = await executor.query(
    `SELECT COUNT(*)::integer AS total,
            COUNT(*) FILTER (WHERE status = 'SCORED')::integer AS completed,
            COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS failed,
            COUNT(*) FILTER (WHERE status = 'REVIEW_REQUIRED')::integer AS review,
            COUNT(*) FILTER (WHERE status = ANY($2::text[]))::integer AS terminal
     FROM iig_ai_question_runs WHERE scoring_run_id = $1`,
    [runId, TERMINAL_QUESTION_STATUSES]
  );
  const row = result.rows[0] || {};
  const counts = {
    total: Number(row.total || 0),
    completed: Number(row.completed || 0),
    failed: Number(row.failed || 0),
    review: Number(row.review || 0),
    terminal: Number(row.terminal || 0),
  };
  await executor.query(
    `UPDATE iig_ai_scoring_runs
     SET completed_questions = $2, failed_questions = $3, review_questions = $4,
         updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [runId, counts.completed, counts.failed, counts.review]
  );
  return counts;
}

module.exports = {
  TERMINAL_QUESTION_STATUSES,
  lockRun,
  refreshQuestionProgress,
};
