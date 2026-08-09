const db = require('../../config/db');

class ExportRepository {
  constructor(database = db) {
    this.db = database;
  }

  async findSubmissionScores(submissionIds) {
    const result = await this.db.query(
      `SELECT s.id AS sub_id, s.keycode, s.test_name, s.submitted_date, s.synced_at, s.status,
              sa.section, sa.question_no, er.final_score
       FROM mocktest_submissions s
       LEFT JOIN submission_answers sa ON sa.submission_id = s.id
       LEFT JOIN ai_evaluation_results er ON er.answer_id = sa.id
       WHERE s.id = ANY($1)
       ORDER BY s.submitted_date DESC, sa.section DESC, sa.question_no ASC`,
      [submissionIds]
    );
    return result.rows;
  }
}

module.exports = new ExportRepository();
module.exports.ExportRepository = ExportRepository;
