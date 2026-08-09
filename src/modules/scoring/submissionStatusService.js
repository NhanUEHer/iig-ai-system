const db = require('../../config/db');

function calculateSubmissionStatus(statusCounts) {
  const counts = new Map(statusCounts.map(row => [row.status, Number.parseInt(row.cnt, 10) || 0]));
  const pending = counts.get('pending') || 0;
  const scoring = counts.get('scoring') || 0;
  const finished = (counts.get('scored') || 0) + (counts.get('error') || 0);

  if (scoring > 0 || (finished > 0 && pending > 0)) return 2;
  if (finished > 0 && pending === 0) return 3;
  return 1;
}

async function refreshSubmissionStatus(submissionId, database = db) {
    const result = await database.query(
      `SELECT status, COUNT(*) AS cnt FROM submission_answers
       WHERE submission_id = $1 GROUP BY status`,
      [submissionId]
    );
    const status = calculateSubmissionStatus(result.rows);
    await database.query(
      'UPDATE mocktest_submissions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, submissionId]
    );
    return status;
}

module.exports = { calculateSubmissionStatus, refreshSubmissionStatus };
