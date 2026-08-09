const db = require('../../config/db');

class SubmissionRepository {
  constructor(database = db) {
    this.db = database;
  }

  async list({ keycode, studentName, status } = {}) {
    let sql = 'SELECT * FROM mocktest_submissions WHERE deleted_at IS NULL';
    const params = [];

    if (keycode) {
      params.push(`%${keycode}%`);
      sql += ` AND keycode ILIKE $${params.length}`;
    }
    if (studentName) {
      params.push(`%${studentName}%`);
      sql += ` AND student_name ILIKE $${params.length}`;
    }
    if (status) {
      params.push(Number.parseInt(status, 10));
      sql += ` AND status = $${params.length}`;
    }
    sql += ' ORDER BY COALESCE(synced_at, updated_at, submitted_date) DESC';

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  async listPage({ search, keycode, studentName, status, section, page = 1, limit = 10 } = {}) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 10));
    const params = [];
    const filters = ['s.deleted_at IS NULL'];
    if (search) {
      params.push(`%${String(search).trim()}%`);
      filters.push(`(s.keycode ILIKE $${params.length} OR s.student_name ILIKE $${params.length} OR s.student_email ILIKE $${params.length} OR s.test_name ILIKE $${params.length})`);
    }
    if (keycode) { params.push(`%${keycode}%`); filters.push(`s.keycode ILIKE $${params.length}`); }
    if (studentName) { params.push(`%${studentName}%`); filters.push(`s.student_name ILIKE $${params.length}`); }
    if (status !== undefined && status !== null && status !== '') {
      params.push(Number.parseInt(status, 10)); filters.push(`s.status = $${params.length}`);
    }
    if (section) {
      params.push(section); filters.push(`EXISTS (SELECT 1 FROM submission_answers sa WHERE sa.submission_id = s.id AND LOWER(sa.section) = LOWER($${params.length}))`);
    }
    const where = filters.join(' AND ');
    const countResult = await this.db.query(`SELECT COUNT(*)::int AS total FROM mocktest_submissions s WHERE ${where}`, params);
    const dataParams = [...params, safeLimit, (safePage - 1) * safeLimit];
    const result = await this.db.query(
      `SELECT s.*,
              COUNT(sa.id)::int AS answer_count,
              COUNT(sa.id) FILTER (WHERE sa.status = 'scored')::int AS scored_count,
              COUNT(sa.id) FILTER (WHERE sa.status = 'scoring')::int AS scoring_count,
              COUNT(sa.id) FILTER (WHERE sa.status = 'error')::int AS error_count
       FROM mocktest_submissions s LEFT JOIN submission_answers sa ON sa.submission_id = s.id
       WHERE ${where}
       GROUP BY s.id
       ORDER BY COALESCE(s.synced_at, s.updated_at, s.submitted_date) DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    const total = countResult.rows[0]?.total || 0;
    return { rows: result.rows, meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
  }

  async findById(id, { includeDeleted = false } = {}) {
    const deletedFilter = includeDeleted ? '' : ' AND deleted_at IS NULL';
    const result = await this.db.query(
      `SELECT * FROM mocktest_submissions WHERE id = $1${deletedFilter}`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findAnswersWithEvaluation(submissionId) {
    const result = await this.db.query(
      `SELECT sa.*,
              ai.transcribe, ai.final_score, ai.pronunciation_score, ai.pronunciation_rationale,
              ai.intonation_score, ai.intonation_rationale, ai.cohesion_score, ai.cohesion_rationale,
              ai.grammar_score, ai.grammar_rationale, ai.vocabulary_score, ai.vocabulary_rationale,
              ai.completeness_score, ai.completeness_rationale, ai.relevance_score, ai.relevance_rationale,
              ai.errors, ai.overall_1, ai.overall_2, ai.key_errors, ai.strength, ai.weakness,
              ai.improvement, ai.cleaned_audio_url, ai.teacher_note
       FROM submission_answers sa
       LEFT JOIN ai_evaluation_results ai ON sa.id = ai.answer_id
       WHERE sa.submission_id = $1
       ORDER BY sa.section ASC, sa.question_no ASC`,
      [submissionId]
    );
    return result.rows;
  }

  async findAnswerDetail(submissionId, answerId) {
    const result = await this.db.query(
      `SELECT sa.*,
              ai.transcribe, ai.final_score, ai.pronunciation_score, ai.pronunciation_rationale,
              ai.intonation_score, ai.intonation_rationale, ai.cohesion_score, ai.cohesion_rationale,
              ai.grammar_score, ai.grammar_rationale, ai.vocabulary_score, ai.vocabulary_rationale,
              ai.completeness_score, ai.completeness_rationale, ai.relevance_score, ai.relevance_rationale,
              ai.errors, ai.overall_1, ai.overall_2, ai.key_errors, ai.strength, ai.weakness,
              ai.improvement, ai.cleaned_audio_url, ai.teacher_note
       FROM submission_answers sa LEFT JOIN ai_evaluation_results ai ON ai.answer_id = sa.id
       WHERE sa.submission_id = $1 AND sa.id = $2`,
      [submissionId, answerId]
    );
    return result.rows[0] || null;
  }

  async findDeletionCandidates(ids) {
    const result = await this.db.query(
      'SELECT id, keycode, status FROM mocktest_submissions WHERE id = ANY($1)',
      [ids]
    );
    return result.rows;
  }

  async softDelete(ids) {
    const normalizedIds = Array.isArray(ids) ? ids : [ids];
    await this.db.query(
      'UPDATE mocktest_submissions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ANY($1)',
      [normalizedIds]
    );
  }

  async findAnswerById(answerId) {
    const result = await this.db.query('SELECT * FROM submission_answers WHERE id = $1', [answerId]);
    return result.rows[0] || null;
  }

  async findSubmissionIdByAnswerId(answerId) {
    const result = await this.db.query(
      'SELECT submission_id FROM submission_answers WHERE id = $1',
      [answerId]
    );
    return result.rows[0]?.submission_id || null;
  }

  async updateAnswerStatus(answerId, status) {
    await this.db.query(
      'UPDATE submission_answers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, answerId]
    );
  }

  async tryStartScoring(answerId) {
    const result = await this.db.query(
      `UPDATE submission_answers
       SET status = 'scoring', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IS DISTINCT FROM 'scoring'
       RETURNING id`,
      [answerId]
    );
    return result.rowCount === 1;
  }

  async updateContextText(answerId, contextText) {
    await this.db.query(
      'UPDATE submission_answers SET context_text = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [contextText, answerId]
    );
  }

  async updateQuestionName(answerId, questionName) {
    await this.db.query(
      'UPDATE submission_answers SET question_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [questionName, answerId]
    );
  }
}

module.exports = new SubmissionRepository();
module.exports.SubmissionRepository = SubmissionRepository;
