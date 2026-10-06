const db = require('../../config/db');

const attemptStatusSql = `CASE WHEN a.id IS NULL THEN 'REGISTERED' ELSE a.status END`;

function csvValues(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function filtersSql(filters, params) {
  const where = [];
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    const n = params.length;
    where.push(`(c.full_name ILIKE $${n} OR c.candidate_number ILIKE $${n}
      OR COALESCE(c.email,'') ILIKE $${n} OR COALESCE(c.phone,'') ILIKE $${n}
      OR COALESCE(e.title,'') ILIKE $${n} OR COALESCE(e.exam_code,'') ILIKE $${n})`);
  }
  const arrays = [
    ['examIds', 'a.exam_id', 'uuid[]'],
    ['toeicExperiences', 'c.toeic_experience', 'text[]'],
    ['attemptStatuses', attemptStatusSql, 'text[]'],
    ['schools', 'c.school_name', 'text[]'],
  ];
  for (const [key, column, type] of arrays) {
    const values = csvValues(filters[key]);
    if (values.length) {
      params.push(values);
      where.push(`${column}=ANY($${params.length}::${type})`);
    }
  }
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

const joins = `FROM exam_candidates c
LEFT JOIN exam_attempts a ON a.candidate_id=c.id
LEFT JOIN exams e ON e.id=a.exam_id`;

function map(row) {
  return {
    id: row.activity_id || `candidate:${row.candidate_id}`,
    candidate: {
      id: row.candidate_id,
      candidateNumber: row.candidate_number,
      fullName: row.full_name,
      email: row.email || '',
      phone: row.phone || '',
      schoolName: row.school_name || '',
      birthYear: row.birth_year == null ? null : Number(row.birth_year),
      toeicExperience: row.toeic_experience || null,
      registeredAt: row.registered_at,
    },
    exam: row.exam_id ? {
      id: row.exam_id,
      code: row.exam_code,
      title: row.exam_title,
      type: row.exam_type || null,
    } : null,
    activity: {
      id: row.activity_id || null,
      status: row.attempt_status,
      startedAt: row.started_at || null,
      submittedAt: row.submitted_at || null,
      durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
      totalScore: row.total_score == null ? null : Number(row.total_score),
      maxScore: row.max_score == null ? null : Number(row.max_score),
      scoreRangeMin: row.score_range_min == null ? null : Number(row.score_range_min),
      scoreRangeMax: row.score_range_max == null ? null : Number(row.score_range_max),
      totalQuestions: row.total_questions == null ? null : Number(row.total_questions),
      answeredCount: row.answered_count == null ? null : Number(row.answered_count),
      correctCount: row.correct_count == null ? null : Number(row.correct_count),
      incorrectCount: row.incorrect_count == null ? null : Number(row.incorrect_count),
    },
  };
}

async function list(filters = {}) {
  const page = Math.max(Number(filters.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), filters.__export ? 10000 : 100);
  const params = [];
  const where = filtersSql(filters, params);
  const count = await db.query(`SELECT COUNT(*)::int total ${joins} ${where}`, params);
  params.push(limit, (page - 1) * limit);
  const result = await db.query(
    `SELECT c.id candidate_id,c.candidate_number,c.full_name,c.email,c.phone,c.school_name,
       c.birth_year,c.toeic_experience,c.created_at registered_at,
       a.id activity_id,${attemptStatusSql} attempt_status,a.started_at,a.submitted_at,
       a.duration_seconds,a.total_score,a.max_score,a.score_range_min,a.score_range_max,
       a.total_questions,a.answered_count,a.correct_count,a.incorrect_count,
       e.id exam_id,e.exam_code,e.title exam_title,e.exam_type
     ${joins} ${where}
     ORDER BY COALESCE(a.started_at,c.created_at) DESC,c.id,a.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const total = count.rows[0]?.total || 0;
  return { data: result.rows.map(map), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

async function filterOptions() {
  const [exams, schools] = await Promise.all([
    db.query(`SELECT DISTINCT e.id,e.exam_code,e.title
      FROM exams e JOIN exam_attempts a ON a.exam_id=e.id
      ORDER BY e.title,e.exam_code`),
    db.query(`SELECT DISTINCT school_name name FROM exam_candidates
      WHERE school_name IS NOT NULL AND BTRIM(school_name)<>'' ORDER BY school_name`),
  ]);
  return {
    exams: exams.rows.map(row => ({ value: row.id, label: row.title, code: row.exam_code })),
    schools: schools.rows.map(row => ({ value: row.name, label: row.name })),
  };
}

module.exports = { list, filterOptions };
