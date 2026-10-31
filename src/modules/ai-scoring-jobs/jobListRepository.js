const db = require('../../config/db');

const scopeExpression = `CASE
  WHEN COALESCE(scope.has_s, false) AND COALESCE(scope.has_w, false) THEN 'S+W'
  WHEN COALESCE(scope.has_s, false) THEN 'S'
  WHEN COALESCE(scope.has_w, false) THEN 'W'
  ELSE '—' END`;

function where(filters, values) {
  const clauses = [];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
  if (filters.search) {
    values.push(filters.search.toUpperCase());
    const n = values.length;
    clauses.push(`(j.id::text = $${n} OR j.source_scoring_id::text = $${n} OR j.keycode = $${n})`);
  }
  if (filters.tenantId) add('t.id = ?', filters.tenantId);
  if (filters.status) { values.push(filters.status); const n = values.length; clauses.push(`COALESCE(run.status, j.status) = $${n}`); }
  if (filters.scope) { values.push(filters.scope); const n = values.length; clauses.push(`${scopeExpression} = $${n}`); }
  if (filters.from) add('j.accepted_at >= ?', filters.from);
  if (filters.to) add('j.accepted_at <= ?', filters.to);
  if (filters.hasRetry) clauses.push(`(j.retry_count > 0 OR run.run_type IN ('RETRY','RESCORE'))`);
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

const base = `FROM iig_scoring_jobs j
LEFT JOIN integration_api_credentials c ON c.id = j.credential_id
LEFT JOIN integration_tenants t ON t.id = c.tenant_id
LEFT JOIN iig_submissions s ON s.scoring_job_id = j.id
LEFT JOIN LATERAL (SELECT r.* FROM iig_ai_scoring_runs r WHERE r.submission_id=s.id ORDER BY r.run_number DESC LIMIT 1) run ON true
LEFT JOIN LATERAL (
  SELECT BOOL_OR(UPPER(COALESCE(q.scorer_type,'')) LIKE '%SPEAK%') has_s,
         BOOL_OR(UPPER(COALESCE(q.scorer_type,'')) LIKE '%WRIT%') has_w
  FROM iig_question_attempts qa JOIN iig_exam_questions q ON q.id=qa.exam_question_id
  WHERE qa.submission_id=s.id
) scope ON true`;

function map(row) {
  const accepted = row.accepted_at ? new Date(row.accepted_at) : null;
  const terminal = row.terminal_at ? new Date(row.terminal_at) : new Date();
  return { id: row.id, scoringId: row.source_scoring_id, keycode: row.keycode, tenant: row.tenant_id ? { id: row.tenant_id, code: row.tenant_code, name: row.tenant_name } : null, scope: row.scope, status: row.display_status, stage: row.stage, progress: { completed: Number(row.completed_questions || row.ready_questions || 0), total: Number(row.run_total || row.total_questions || 0), failed: Number(row.failed_questions || row.invalid_questions || 0) }, errorCode: row.run_error_code || row.error_code || null, retryCount: Number(row.retry_count || 0), runType: row.run_type || null, durationMs: accepted ? Math.max(0, terminal - accepted) : null, acceptedAt: row.accepted_at, updatedAt: row.updated_at };
}

class JobListRepository {
  constructor(database = db) { this.db = database; }
  async list(filters) {
    const values = []; const filterSql = where(filters, values);
    const count = await this.db.query(`SELECT COUNT(*)::int total ${base} ${filterSql}`, values);
    values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
    const rows = await this.db.query(`SELECT j.id,j.source_scoring_id,j.keycode,j.status,j.total_questions,j.ready_questions,j.invalid_questions,j.retry_count,j.error_code,j.accepted_at,j.updated_at,
      t.id tenant_id,t.code tenant_code,t.name tenant_name,${scopeExpression} scope,
      COALESCE(run.status,j.status) display_status,COALESCE(run.status,j.status) stage,run.total_questions run_total,run.completed_questions,run.failed_questions,run.error_code run_error_code,run.run_type,
      COALESCE(run.completed_at,j.completed_at,
        CASE WHEN COALESCE(run.status,j.status) IN ('COMPLETED','COMPLETED_WITH_ISSUES','REVIEW_REQUIRED','FAILED','CANCELLED','INVALID_REQUEST','SOURCE_FETCH_FAILED','MEDIA_FAILED','INVALID_INPUT')
          THEN COALESCE(run.updated_at,j.updated_at) END) terminal_at
      ${base} ${filterSql} ORDER BY j.accepted_at DESC,j.id DESC LIMIT $${values.length-1} OFFSET $${values.length}`, values);
    return { items: rows.rows.map(map), total: count.rows[0]?.total || 0, page: filters.page, pageSize: filters.pageSize };
  }
  async facets() {
    const [tenants, statuses] = await Promise.all([
      this.db.query(`SELECT id,code,name FROM integration_tenants ORDER BY name`),
      this.db.query(`SELECT COALESCE(run.status,j.status) status,COUNT(*)::int count
        ${base} GROUP BY COALESCE(run.status,j.status) ORDER BY status`),
    ]);
    return { tenants: tenants.rows, statuses: statuses.rows, scopes: ['S','W','S+W'] };
  }
}
module.exports = new JobListRepository();
module.exports.JobListRepository = JobListRepository;
module.exports.map = map;
