const db = require('../../config/db');

class GradingJobRepository {
  constructor(database = db) { this.db = database; }

  async create({ userId, submissionIds, answerIds }) {
    return db.transaction(async database => {
      const useAnswers = Array.isArray(answerIds) && answerIds.length > 0;
      const targets = useAnswers ? answerIds : submissionIds;
      const answers = await database.query(
        `SELECT id, submission_id FROM submission_answers
         WHERE ${useAnswers ? 'id' : 'submission_id'} = ANY($1) AND status IS DISTINCT FROM 'scored'
         ORDER BY submission_id, section, question_no`,
        [targets]
      );
      if (answers.rowCount === 0) return { total_items: 0 };
      const job = await database.query(
        `INSERT INTO grading_jobs (requested_by, total_items)
         VALUES ($1, $2) RETURNING *`,
        [userId, answers.rowCount]
      );
      for (const answer of answers.rows) {
        await database.query(
          `INSERT INTO grading_job_items (job_id, submission_id, answer_id)
           VALUES ($1, $2, $3)`,
          [job.rows[0].id, answer.submission_id, answer.id]
        );
      }
      return job.rows[0];
    });
  }

  async findById(id, userId, isAdmin) {
    const result = await this.db.query(
      `SELECT j.*,
        COALESCE(json_agg(json_build_object(
          'answerId', i.answer_id, 'submissionId', i.submission_id, 'status', i.status,
          'finalScore', i.final_score, 'error', i.error_message
        ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM grading_jobs j LEFT JOIN grading_job_items i ON i.job_id = j.id
       WHERE j.id = $1 AND ($2::boolean OR j.requested_by = $3)
       GROUP BY j.id`,
      [id, isAdmin, userId]
    );
    return result.rows[0] || null;
  }

  async listQueuedItems(jobId) {
    const result = await this.db.query(
      `SELECT answer_id, submission_id FROM grading_job_items
       WHERE job_id = $1 AND status = 'queued' ORDER BY id`,
      [jobId]
    );
    return result.rows;
  }

  async startJob(jobId) {
    await this.db.query("UPDATE grading_jobs SET status = 'processing', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [jobId]);
  }

  async startItem(jobId, answerId) {
    await this.db.query("UPDATE grading_job_items SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE job_id = $1 AND answer_id = $2", [jobId, answerId]);
  }

  async completeItem(jobId, answerId, finalScore) {
    await this.db.query(
      `UPDATE grading_job_items SET status = 'completed', final_score = $3, completed_at = CURRENT_TIMESTAMP
       WHERE job_id = $1 AND answer_id = $2`,
      [jobId, answerId, finalScore]
    );
    await this.db.query("UPDATE grading_jobs SET completed_items = completed_items + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [jobId]);
  }

  async failItem(jobId, answerId, message) {
    await this.db.query(
      `UPDATE grading_job_items SET status = 'failed', error_message = $3, completed_at = CURRENT_TIMESTAMP
       WHERE job_id = $1 AND answer_id = $2`,
      [jobId, answerId, String(message).slice(0, 2000)]
    );
    await this.db.query("UPDATE grading_jobs SET failed_items = failed_items + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [jobId]);
  }

  async finishJob(jobId) {
    await this.db.query(
      `UPDATE grading_jobs SET status = CASE WHEN failed_items > 0 THEN 'completed_with_errors' ELSE 'completed' END,
              completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [jobId]
    );
  }

  async failJob(jobId) {
    await this.db.query("UPDATE grading_jobs SET status = 'failed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [jobId]);
  }
}

module.exports = new GradingJobRepository();
module.exports.GradingJobRepository = GradingJobRepository;
