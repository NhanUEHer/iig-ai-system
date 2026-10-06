const crypto = require('crypto');
const db = require('../../config/db');
const { MODE_QUESTION_TYPE } = require('./examConstants');

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapExam = row => row && ({
  id: row.id,
  examCode: row.exam_code,
  title: row.title,
  status: row.status,
  examType: row.exam_type || null,
  description: row.description || '',
  introduction: row.introduction || '',
  activeVersionId: row.active_version_id || null,
  hasPublishedSnapshot: row.published_snapshot != null,
  lockVersion: Number(row.lock_version || 1),
  sectionCount: Number(row.section_count || 0),
  partCount: Number(row.part_count || 0),
  parentQuestionCount: Number(row.parent_question_count || 0),
  subQuestionCount: Number(row.sub_question_count || 0),
  configuredDurationSeconds: Number(row.configured_duration_seconds || 0),
  eventName: row.event_name || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSection = row => row && ({
  id: row.id,
  examId: row.exam_id,
  title: row.title,
  examMode: row.exam_mode,
  questionCount: Number(row.question_count || 0),
  configuredDurationSeconds: Number(row.configured_duration_seconds || 0),
  scoreScaleId: row.score_scale_id || null,
  sortOrder: Number(row.sort_order || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPart = row => row && ({
  id: row.id,
  sectionId: row.section_id,
  examId: row.exam_id,
  title: row.title,
  instructionHtml: row.instruction_html || null,
  instructionAudioMediaId: row.instruction_audio_media_id || null,
  breakDurationSeconds: Number(row.break_duration_seconds || 0),
  configuredDurationSeconds: Number(row.configured_duration_seconds || 0),
  sortOrder: Number(row.sort_order || 0),
});

// ---------------------------------------------------------------------------
// Exam list / detail / CRUD
// ---------------------------------------------------------------------------
// Keep each statistic isolated so joining Sections and Parts cannot multiply
// child-question rows. Duration is configured data only; actual duration is
// calculated on the detail endpoint from audio metadata.
const statsSelect = `(SELECT COUNT(*) FROM exam_sections es WHERE es.exam_id=e.id)::int section_count,
  (SELECT COUNT(*) FROM exam_parts ep WHERE ep.exam_id=e.id)::int part_count,
  (SELECT COUNT(*) FROM exam_part_questions epq WHERE epq.exam_id=e.id)::int parent_question_count,
  (SELECT COUNT(*) FROM exam_part_questions epq JOIN question_bank_sub_questions sq ON sq.question_id=epq.question_id WHERE epq.exam_id=e.id)::int sub_question_count,
  (SELECT COALESCE(SUM(es.configured_duration_seconds),0) FROM exam_sections es WHERE es.exam_id=e.id)::int configured_duration_seconds`;

async function list({ page = 1, limit = 10, search = '', status = '', statuses = '', examType = '', examTypes = '' } = {}) {
  const params = [];
  const where = [];
  const normalizedSearch = String(search || '').trim();
  if (normalizedSearch) { params.push(`%${normalizedSearch}%`); where.push(`(e.title ILIKE $${params.length} OR e.exam_code ILIKE $${params.length})`); }
  const selectedStatuses = String(statuses || status || '').split(',').map(v => v.trim()).filter(v => ['DRAFT', 'ACTIVE', 'INACTIVE'].includes(v));
  if (selectedStatuses.length) { params.push(selectedStatuses); where.push(`e.status=ANY($${params.length}::varchar[])`); }
  const selectedTypes = String(examTypes || examType || '').split(',').map(v => v.trim()).filter(Boolean);
  if (selectedTypes.length) { params.push(selectedTypes); where.push(`e.exam_type=ANY($${params.length}::varchar[])`); }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await db.query(`SELECT COUNT(*)::int total FROM exams e ${filter}`, params);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  params.push(safeLimit, (safePage - 1) * safeLimit);
  const result = await db.query(`SELECT e.*,${statsSelect} FROM exams e ${filter}
    ORDER BY e.updated_at DESC,e.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = count.rows[0].total;
  return { data: result.rows.map(mapExam), meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
}

// Detail returns the full section -> part -> question tree. Actual durations are
// NOT included here; the service layer computes them dynamically.
async function findById(id, client = db) {
  const examResult = await client.query(`SELECT e.*,${statsSelect} FROM exams e WHERE e.id=$1`, [id]);
  const exam = mapExam(examResult.rows[0]);
  if (!exam) return null;
  const eventResult = await client.query('SELECT name FROM exam_events WHERE exam_id=$1 ORDER BY updated_at DESC LIMIT 1', [id]);
  exam.eventName = eventResult.rows[0]?.name || null;

  const sections = await client.query('SELECT * FROM exam_sections WHERE exam_id=$1 ORDER BY sort_order,created_at', [id]);
  const parts = await client.query(`SELECT ep.*,
      (SELECT COUNT(*) FROM exam_part_questions x WHERE x.part_id=ep.id)::int parent_question_count
    FROM exam_parts ep WHERE ep.exam_id=$1 ORDER BY ep.sort_order,ep.display_order,ep.part_number`, [id]);
  const partIds = parts.rows.map(p => p.id);
  let questionRows = { rows: [] };
  if (partIds.length) {
    questionRows = await client.query(`SELECT epq.part_id,epq.display_order,
        q.id,q.code,q.question_name,q.question_type,q.status,g.title group_name,
        (SELECT COUNT(*) FROM question_bank_sub_questions sq WHERE sq.question_id=q.id)::int sub_question_count
      FROM exam_part_questions epq JOIN question_bank_questions q ON q.id=epq.question_id
      JOIN question_groups g ON g.id=q.group_id
      WHERE epq.part_id=ANY($1::uuid[]) ORDER BY epq.display_order`, [partIds]);
  }
  const questionsByPart = new Map();
  for (const row of questionRows.rows) {
    if (!questionsByPart.has(row.part_id)) questionsByPart.set(row.part_id, []);
    questionsByPart.get(row.part_id).push({
      id: row.id, code: row.code, questionName: row.question_name, questionType: row.question_type,
      status: row.status, groupName: row.group_name,
      sortOrder: Number(row.display_order ?? 0),
      subQuestionCount: Number(row.sub_question_count || 0),
    });
  }
  const partsBySection = new Map();
  for (const partRow of parts.rows) {
    const part = { ...mapPart(partRow), parentQuestionCount: Number(partRow.parent_question_count || 0), questions: questionsByPart.get(partRow.id) || [] };
    const key = partRow.section_id || '__legacy__';
    if (!partsBySection.has(key)) partsBySection.set(key, []);
    partsBySection.get(key).push(part);
  }
  exam.sections = sections.rows.map(sectionRow => ({ ...mapSection(sectionRow), parts: partsBySection.get(sectionRow.id) || [] }));
  // Legacy parts without a section are exposed so nothing is silently hidden.
  exam.legacyParts = partsBySection.get('__legacy__') || [];
  return exam;
}

async function lockExam(id, client) {
  const result = await client.query('SELECT id,status,exam_type FROM exams WHERE id=$1 FOR UPDATE', [id]);
  const row = result.rows[0];
  return row ? { id: row.id, status: row.status, examType: row.exam_type || null } : null;
}

async function create(data, userId) {
  const id = crypto.randomUUID();
  const examCode = `EX-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  const r = await db.query(
    `INSERT INTO exams(id,exam_code,title,status,exam_type,description,introduction,duration_minutes,duration_seconds,points_per_question,score_scale,created_by,updated_by)
     VALUES($1,$2,$3,'DRAFT',$4,$5,$6,0,0,10,100,$7,$7) RETURNING id`,
    [id, examCode, data.title.trim(), data.examType, String(data.description || '').trim(), String(data.introduction || ''), userId || null],
  );
  return findById(r.rows[0].id);
}

async function update(id, data, userId, client = db) {
  const fields = [];
  const values = [id];
  const push = (column, value) => { values.push(value); fields.push(`${column}=$${values.length}`); };
  if (data.title !== undefined) push('title', data.title.trim());
  if (data.status !== undefined) push('status', data.status);
  if (data.examType !== undefined) push('exam_type', data.examType);
  if (data.description !== undefined) push('description', String(data.description || '').trim());
  if (data.introduction !== undefined) push('introduction', String(data.introduction || ''));
  if (!fields.length) return findById(id, client);
  values.push(userId || null);
  fields.push(`updated_by=$${values.length}`, 'updated_at=CURRENT_TIMESTAMP', 'lock_version=lock_version+1');
  await client.query(`UPDATE exams SET ${fields.join(',')} WHERE id=$1`, values);
  return findById(id, client);
}

async function remove(id, client = db) { return client.query('DELETE FROM exams WHERE id=$1 RETURNING id', [id]); }

// A published event overlapping the current time locks deactivation.
async function findInProgressEvent(examId, client = db) {
  const result = await client.query(
    `SELECT id,name FROM exam_events
     WHERE exam_id=$1 AND status='PUBLISHED' AND start_at<=CURRENT_TIMESTAMP AND end_at>CURRENT_TIMESTAMP
     ORDER BY start_at LIMIT 1`,
    [examId],
  );
  return result.rows[0] || null;
}

// Replace-in-place publish: keep exactly one exam_versions row per exam and set
// it as the active version. No version history is accumulated. The exam's
// published_snapshot mirrors the same snapshot for the new contract.
async function replacePublishedSnapshot(examId, snapshot, summary, userId, client) {
  const existing = await client.query('SELECT id FROM exam_versions WHERE exam_id=$1 ORDER BY version_number DESC LIMIT 1', [examId]);
  let versionId;
  if (existing.rows[0]) {
    versionId = existing.rows[0].id;
    await client.query(
      `UPDATE exam_versions SET snapshot=$2,total_parent_questions=$3,total_sub_questions=$4,total_points=$5,created_by=$6,created_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [versionId, JSON.stringify(snapshot), summary.parentQuestionCount, summary.subQuestionCount, summary.totalPoints, userId || null],
    );
    // Remove stale rows only when no historical attempt still references them.
    // Attempt delivery/grading uses its own question_snapshot, so replacing the
    // current row cannot alter an in-progress attempt.
    await client.query(
      `DELETE FROM exam_versions v WHERE v.exam_id=$1 AND v.id<>$2
       AND NOT EXISTS(SELECT 1 FROM exam_attempts a WHERE a.exam_version_id=v.id)`,
      [examId, versionId],
    );
  } else {
    const inserted = await client.query(
      `INSERT INTO exam_versions(exam_id,version_number,snapshot,total_parent_questions,total_sub_questions,total_points,created_by)
       VALUES($1,1,$2,$3,$4,$5,$6) RETURNING id`,
      [examId, JSON.stringify(snapshot), summary.parentQuestionCount, summary.subQuestionCount, summary.totalPoints, userId || null],
    );
    versionId = inserted.rows[0].id;
  }
  await client.query(
    `UPDATE exams SET status='ACTIVE',active_version_id=$2,published_snapshot=$3,updated_by=$4,updated_at=CURRENT_TIMESTAMP,lock_version=lock_version+1 WHERE id=$1`,
    [examId, versionId, JSON.stringify(snapshot), userId || null],
  );
  return versionId;
}

async function countSections(examId, client = db) {
  const r = await client.query('SELECT COUNT(*)::int n FROM exam_sections WHERE exam_id=$1', [examId]);
  return Number(r.rows[0].n);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
async function findSection(examId, sectionId, client = db) {
  const r = await client.query('SELECT * FROM exam_sections WHERE id=$1 AND exam_id=$2', [sectionId, examId]);
  return mapSection(r.rows[0]);
}

async function createSection(examId, data, client = db) {
  const order = await client.query('SELECT COALESCE(MAX(sort_order),-1)+1 value FROM exam_sections WHERE exam_id=$1', [examId]);
  const r = await client.query(
    `INSERT INTO exam_sections(exam_id,title,exam_mode,question_count,configured_duration_seconds,score_scale_id,sort_order)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [examId, data.title.trim(), data.examMode, Number(data.questionCount), Number(data.configuredDurationSeconds), data.scoreScaleId || null, order.rows[0].value],
  );
  return mapSection(r.rows[0]);
}

async function updateSection(examId, sectionId, data, client = db) {
  const fields = [];
  const values = [sectionId, examId];
  const push = (column, value) => { values.push(value); fields.push(`${column}=$${values.length}`); };
  if (data.title !== undefined) push('title', data.title.trim());
  if (data.examMode !== undefined) push('exam_mode', data.examMode);
  if (data.questionCount !== undefined) push('question_count', Number(data.questionCount));
  if (data.configuredDurationSeconds !== undefined) push('configured_duration_seconds', Number(data.configuredDurationSeconds));
  if (data.scoreScaleId !== undefined) push('score_scale_id', data.scoreScaleId || null);
  if (!fields.length) return findSection(examId, sectionId, client);
  fields.push('updated_at=CURRENT_TIMESTAMP');
  const r = await client.query(`UPDATE exam_sections SET ${fields.join(',')} WHERE id=$1 AND exam_id=$2 RETURNING *`, values);
  return mapSection(r.rows[0]);
}

// Delete a section and every descendant Part + exam-question relation in one
// transaction. Source questions and physical media are never touched.
async function deleteSection(examId, sectionId, client = db) {
  await client.query('DELETE FROM exam_part_questions WHERE exam_id=$1 AND part_id IN (SELECT id FROM exam_parts WHERE section_id=$2)', [examId, sectionId]);
  await client.query('DELETE FROM exam_parts WHERE exam_id=$1 AND section_id=$2', [examId, sectionId]);
  const r = await client.query('DELETE FROM exam_sections WHERE id=$1 AND exam_id=$2 RETURNING id', [sectionId, examId]);
  if (r.rows[0]) await normalizeSections(examId, client);
  return r.rows[0] || null;
}

async function normalizeSections(examId, client = db) {
  await client.query(
    `WITH ordered AS (SELECT id,ROW_NUMBER() OVER(ORDER BY sort_order,created_at)-1 n FROM exam_sections WHERE exam_id=$1)
     UPDATE exam_sections s SET sort_order=o.n,updated_at=CURRENT_TIMESTAMP FROM ordered o WHERE s.id=o.id`,
    [examId],
  );
}

async function reorderSections(examId, ids, client = db) {
  // Stage to temporary high offsets first to avoid the UNIQUE(exam_id, sort_order) collision.
  await client.query('UPDATE exam_sections SET sort_order=sort_order+$2 WHERE exam_id=$1', [examId, ids.length + 1000]);
  for (let i = 0; i < ids.length; i++) {
    await client.query('UPDATE exam_sections SET sort_order=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND exam_id=$2', [ids[i], examId, i]);
  }
  return true;
}

async function listSectionIds(examId, client = db) {
  const r = await client.query('SELECT id FROM exam_sections WHERE exam_id=$1', [examId]);
  return r.rows.map(row => row.id);
}

// ---------------------------------------------------------------------------
// Parts (nested under a section)
// ---------------------------------------------------------------------------
async function findPart(examId, sectionId, partId, client = db) {
  const r = await client.query('SELECT * FROM exam_parts WHERE id=$1 AND exam_id=$2 AND section_id=$3', [partId, examId, sectionId]);
  return mapPart(r.rows[0]);
}

async function createPart(examId, sectionId, data, client = db) {
  const order = await client.query('SELECT COALESCE(MAX(sort_order),-1)+1 value,COALESCE(MAX(part_number),0)+1 number FROM exam_parts WHERE exam_id=$1', [examId]);
  const r = await client.query(
    `INSERT INTO exam_parts(exam_id,section_id,part_number,title,instruction_html,instruction_audio_media_id,break_duration_seconds,configured_duration_seconds,sort_order,display_order,duration_minutes)
     VALUES($1,$2,$3,$4,NULL,NULL,0,0,$5,$5,0) RETURNING *`,
    [examId, sectionId, order.rows[0].number, data.title.trim(), order.rows[0].value],
  );
  return mapPart(r.rows[0]);
}

async function updatePartContent(examId, sectionId, partId, data, client = db) {
  const fields = [];
  const values = [partId, examId, sectionId];
  const push = (column, value) => { values.push(value); fields.push(`${column}=$${values.length}`); };
  if (data.title !== undefined) push('title', data.title.trim());
  if (data.instructionHtml !== undefined) push('instruction_html', data.instructionHtml ? String(data.instructionHtml) : null);
  if (data.instructionAudioMediaId !== undefined) push('instruction_audio_media_id', data.instructionAudioMediaId || null);
  if (data.breakDurationSeconds !== undefined) push('break_duration_seconds', Number(data.breakDurationSeconds || 0));
  if (data.configuredDurationSeconds !== undefined) push('configured_duration_seconds', Number(data.configuredDurationSeconds || 0));
  if (!fields.length) return findPart(examId, sectionId, partId, client);
  fields.push('updated_at=CURRENT_TIMESTAMP');
  const r = await client.query(`UPDATE exam_parts SET ${fields.join(',')} WHERE id=$1 AND exam_id=$2 AND section_id=$3 RETURNING *`, values);
  return mapPart(r.rows[0]);
}

async function deletePart(examId, sectionId, partId, client = db) {
  await client.query('DELETE FROM exam_part_questions WHERE exam_id=$1 AND part_id=$2', [examId, partId]);
  const r = await client.query('DELETE FROM exam_parts WHERE id=$1 AND exam_id=$2 AND section_id=$3 RETURNING id', [partId, examId, sectionId]);
  if (r.rows[0]) await normalizeParts(examId, sectionId, client);
  return r.rows[0] || null;
}

async function normalizeParts(examId, sectionId, client = db) {
  await client.query(
    `WITH ordered AS (SELECT id,ROW_NUMBER() OVER(ORDER BY sort_order,display_order,part_number)-1 n FROM exam_parts WHERE exam_id=$1 AND section_id=$2)
     UPDATE exam_parts p SET sort_order=o.n,display_order=o.n,updated_at=CURRENT_TIMESTAMP FROM ordered o WHERE p.id=o.id`,
    [examId, sectionId],
  );
}

async function reorderParts(examId, sectionId, ids, client = db) {
  for (let i = 0; i < ids.length; i++) {
    await client.query('UPDATE exam_parts SET sort_order=$4,display_order=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND exam_id=$2 AND section_id=$3', [ids[i], examId, sectionId, i]);
  }
  return true;
}

// Resolve a part within an exam together with its section's exam mode.
async function findPartWithSection(examId, partId, client = db) {
  const r = await client.query(
    `SELECT ep.id, ep.section_id, es.exam_mode
     FROM exam_parts ep JOIN exam_sections es ON es.id=ep.section_id
     WHERE ep.id=$1 AND ep.exam_id=$2`,
    [partId, examId],
  );
  return r.rows[0] ? { id: r.rows[0].id, sectionId: r.rows[0].section_id, examMode: r.rows[0].exam_mode } : null;
}

async function listPartIdsInSection(examId, sectionId, client = db) {
  const r = await client.query('SELECT id FROM exam_parts WHERE exam_id=$1 AND section_id=$2', [examId, sectionId]);
  return r.rows.map(row => row.id);
}

// ---------------------------------------------------------------------------
// Eligible questions per mode
// ---------------------------------------------------------------------------
// Build the mode-specific eligibility predicate. All modes require ACTIVE status,
// the matching parent-question type, and at least one sub-question. NON_STOP and
// RECORD_NON_STOP additionally require exactly one content that has a ready audio.
function eligibilityWhere(mode, params, examId, { includeUnusedCheck = true } = {}) {
  const questionType = MODE_QUESTION_TYPE[mode];
  const where = [
    `q.status='ACTIVE'`,
    `q.question_type=$${params.push(questionType)}`,
    `EXISTS(SELECT 1 FROM question_bank_sub_questions sq WHERE sq.question_id=q.id)`,
  ];
  if (includeUnusedCheck) where.push(`NOT EXISTS(SELECT 1 FROM exam_part_questions used WHERE used.exam_id=$${params.push(examId)} AND used.question_id=q.id)`);
  if (mode === 'NON_STOP') {
    // Exactly one content, and that content has a ready audio.
    where.push(`(SELECT COUNT(*) FROM question_bank_contents c WHERE c.question_id=q.id)=1`);
    where.push(`EXISTS(SELECT 1 FROM question_bank_contents c JOIN question_bank_media m ON m.id=c.audio_media_id WHERE c.question_id=q.id AND m.media_type='AUDIO')`);
  } else if (mode === 'RECORD_NON_STOP') {
    where.push(`(SELECT COUNT(*) FROM question_bank_contents c WHERE c.question_id=q.id)=1`);
    where.push(`EXISTS(SELECT 1 FROM question_bank_contents c JOIN question_bank_media m ON m.id=c.audio_media_id WHERE c.question_id=q.id AND m.media_type='AUDIO')`);
  } else {
    // FREESTYLE / WRITING_NON_STOP: at least one content, audio not required.
    where.push(`EXISTS(SELECT 1 FROM question_bank_contents c WHERE c.question_id=q.id)`);
  }
  return where;
}

async function listEligibleQuestions(examId, mode, { page = 1, limit = 10, search = '', groupId = '' } = {}) {
  const params = [];
  const where = eligibilityWhere(mode, params, examId);
  if (String(search || '').trim()) {
    const idx = params.push(`%${String(search).trim()}%`);
    where.push(`(q.question_name ILIKE $${idx} OR q.code ILIKE $${idx})`);
  }
  if (String(groupId || '').trim()) {
    where.push(`q.group_id=$${params.push(String(groupId).trim())}`);
  }
  const filter = `WHERE ${where.join(' AND ')}`;
  const count = await db.query(`SELECT COUNT(*)::int total FROM question_bank_questions q ${filter}`, params);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  params.push(safeLimit, (safePage - 1) * safeLimit);
  const rows = await db.query(`SELECT q.id,q.code,q.question_name,q.question_type,q.status,g.title group_name,
      (SELECT COUNT(*) FROM question_bank_sub_questions sq WHERE sq.question_id=q.id)::int sub_question_count,
      COALESCE((SELECT SUM(m.duration_seconds) FROM question_bank_contents c
        JOIN question_bank_media m ON m.id=c.audio_media_id
        WHERE c.question_id=q.id AND m.media_type='AUDIO'),0)::numeric audio_duration_seconds
    FROM question_bank_questions q JOIN question_groups g ON g.id=q.group_id ${filter}
    ORDER BY q.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const total = count.rows[0].total;
  return {
    data: rows.rows.map(r => ({ id: r.id, code: r.code, questionName: r.question_name, questionType: r.question_type, status: r.status, groupName: r.group_name, subQuestionCount: Number(r.sub_question_count || 0), audioDurationSeconds: Number(r.audio_duration_seconds || 0) })),
    meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) },
  };
}

// Which of the given question ids are eligible for the mode (used to revalidate on add).
async function filterEligibleIds(examId, mode, ids, client = db) {
  const params = [];
  const where = eligibilityWhere(mode, params, examId);
  where.push(`q.id=ANY($${params.push(ids)}::uuid[])`);
  const r = await client.query(`SELECT q.id FROM question_bank_questions q WHERE ${where.join(' AND ')}`, params);
  return new Set(r.rows.map(row => row.id));
}

async function findUsedQuestions(examId, ids, client = db) {
  const r = await client.query('SELECT question_id FROM exam_part_questions WHERE exam_id=$1 AND question_id=ANY($2::uuid[])', [examId, ids]);
  return r.rows.map(row => row.question_id);
}

async function addQuestions(examId, partId, ids, client = db) {
  const max = await client.query('SELECT COALESCE(MAX(display_order),-1) value FROM exam_part_questions WHERE part_id=$1', [partId]);
  let order = Number(max.rows[0].value) + 1;
  for (const questionId of ids) {
    await client.query('INSERT INTO exam_part_questions(exam_id,part_id,question_id,display_order,points) VALUES($1,$2,$3,$4,10)', [examId, partId, questionId, order++]);
  }
}

async function removeQuestion(examId, partId, questionId, client = db) {
  return client.query('DELETE FROM exam_part_questions WHERE exam_id=$1 AND part_id=$2 AND question_id=$3 RETURNING id', [examId, partId, questionId]);
}

async function listPartQuestionIds(partId, client = db) {
  const r = await client.query('SELECT question_id FROM exam_part_questions WHERE part_id=$1', [partId]);
  return r.rows.map(row => row.question_id);
}

async function reorderQuestions(examId, partId, ids, client = db) {
  for (let i = 0; i < ids.length; i++) {
    await client.query('UPDATE exam_part_questions SET display_order=$4 WHERE exam_id=$1 AND part_id=$2 AND question_id=$3', [examId, partId, ids[i], i]);
  }
}

// ---------------------------------------------------------------------------
// Duration source data
// ---------------------------------------------------------------------------
// Returns per parent question the content audio duration and the aggregate
// sub-question timings needed by the dynamic duration calculator.
async function loadDurationSources(questionIds, client = db) {
  if (!questionIds.length) return new Map();
  const contentAudio = await client.query(
    `SELECT c.question_id, COALESCE(SUM(m.duration_seconds),0)::numeric total
     FROM question_bank_contents c JOIN question_bank_media m ON m.id=c.audio_media_id
     WHERE c.question_id=ANY($1::uuid[]) GROUP BY c.question_id`,
    [questionIds],
  );
  const subs = await client.query(
    `SELECT s.question_id,
       COALESCE(SUM(COALESCE(sm.duration_seconds,0)),0)::numeric sub_audio,
       COALESCE(SUM(COALESCE(s.preparation_duration_seconds,0)),0)::numeric prep,
       COALESCE(SUM(COALESCE(s.recording_duration_seconds,0)),0)::numeric rec
     FROM question_bank_sub_questions s LEFT JOIN question_bank_media sm ON sm.id=s.audio_media_id
     WHERE s.question_id=ANY($1::uuid[]) GROUP BY s.question_id`,
    [questionIds],
  );
  const map = new Map();
  for (const id of questionIds) map.set(id, { contentAudioSeconds: 0, subAudioSeconds: 0, preparationSeconds: 0, recordingSeconds: 0 });
  for (const row of contentAudio.rows) map.get(row.question_id).contentAudioSeconds = Number(row.total);
  for (const row of subs.rows) { const e = map.get(row.question_id); e.subAudioSeconds = Number(row.sub_audio); e.preparationSeconds = Number(row.prep); e.recordingSeconds = Number(row.rec); }
  return map;
}

async function loadInstructionAudioDurations(partIds, client = db) {
  if (!partIds.length) return new Map();
  const r = await client.query(
    `SELECT ep.id part_id, COALESCE(m.duration_seconds,0)::numeric duration
     FROM exam_parts ep JOIN question_bank_media m ON m.id=ep.instruction_audio_media_id
     WHERE ep.id=ANY($1::uuid[])`,
    [partIds],
  );
  const map = new Map();
  for (const row of r.rows) map.set(row.part_id, Number(row.duration));
  return map;
}

async function loadInstructionAudioDetails(partIds, client = db) {
  if (!partIds.length) return new Map();
  const result = await client.query(
    `SELECT ep.id part_id,m.id,m.media_type,m.original_name,m.storage_key,m.mime_type,
       m.file_size,m.duration_seconds
     FROM exam_parts ep JOIN question_bank_media m ON m.id=ep.instruction_audio_media_id
     WHERE ep.id=ANY($1::uuid[])`,
    [partIds],
  );
  return new Map(result.rows.map(row => [row.part_id, row]));
}

// ---------------------------------------------------------------------------
// Publish validation source + snapshot
// ---------------------------------------------------------------------------
async function loadValidationRows(examId, client = db) {
  const r = await client.query(
    `SELECT q.id,q.code,q.question_name,q.question_type,q.status,s.id sub_id,
       s.recording_duration_seconds,s.preparation_duration_seconds,s.max_character_count,s.min_word_count,
       COUNT(o.id)::int option_count,COUNT(o.id) FILTER(WHERE o.is_correct)::int correct_count
     FROM exam_part_questions epq JOIN question_bank_questions q ON q.id=epq.question_id
     LEFT JOIN question_bank_sub_questions s ON s.question_id=q.id
     LEFT JOIN question_bank_sub_question_options o ON o.sub_question_id=s.id
     WHERE epq.exam_id=$1 GROUP BY q.id,s.id`,
    [examId],
  );
  return r.rows;
}

async function findIneligibleQuestionIds(examId, mode, ids, client = db) {
  if (!ids.length) return [];
  const params = [];
  const where = eligibilityWhere(mode, params, null, { includeUnusedCheck: false });
  where.push(`q.id=ANY($${params.push(ids)}::uuid[])`);
  const eligible = await client.query(`SELECT q.id FROM question_bank_questions q WHERE ${where.join(' AND ')}`, params);
  const allowed = new Set(eligible.rows.map(row => row.id));
  return ids.filter(id => !allowed.has(id));
}

async function findInstructionAudioMedia(partIds, client = db) {
  if (!partIds.length) return [];
  const r = await client.query(
    `SELECT ep.id part_id, m.id media_id, m.media_type, m.duration_seconds
     FROM exam_parts ep LEFT JOIN question_bank_media m ON m.id=ep.instruction_audio_media_id
     WHERE ep.id=ANY($1::uuid[]) AND ep.instruction_audio_media_id IS NOT NULL`,
    [partIds],
  );
  return r.rows;
}

// Build the immutable delivery snapshot for the current exam structure.
async function buildSnapshot(examId, client) {
  const exam = await findById(examId, client);
  const result = {
    exam: {
      id: exam.id,
      code: exam.examCode,
      title: exam.title,
      examType: exam.examType,
      description: exam.description,
      introductionHtml: exam.introduction,
      pointsPerSubQuestion: 10,
    },
    sections: exam.sections.map(section => ({
      id: section.id,
      title: section.title,
      examMode: section.examMode,
      questionCount: section.questionCount,
      configuredDurationSeconds: section.configuredDurationSeconds,
      sortOrder: section.sortOrder,
    })),
    parts: [],
  };
  const orderedParts = [...exam.sections.flatMap(s => s.parts.map(p => ({ ...p, section: s }))), ...exam.legacyParts.map(p => ({ ...p, section: null }))];
  for (const part of orderedParts) {
    const out = {
      id: part.id,
      title: part.title,
      sectionId: part.section?.id || null,
      sectionTitle: part.section?.title || null,
      sectionSortOrder: part.section?.sortOrder ?? null,
      sectionConfiguredDurationSeconds: part.section?.configuredDurationSeconds || 0,
      examMode: part.section?.examMode || null,
      instructionHtml: part.instructionHtml,
      instructionAudioMediaId: part.instructionAudioMediaId,
      breakDurationSeconds: part.breakDurationSeconds,
      configuredDurationSeconds: part.configuredDurationSeconds,
      sortOrder: part.sortOrder,
      questions: [],
    };
    for (const q of part.questions) {
      const detail = await client.query('SELECT q.id,q.code,q.question_name,q.question_type,q.note,q.status,g.title group_name FROM question_bank_questions q JOIN question_groups g ON g.id=q.group_id WHERE q.id=$1', [q.id]);
      const contents = await client.query('SELECT id,title,content_html,script_html,translation_html,audio_media_id,image_media_id,video_media_id,sort_order AS display_order FROM question_bank_contents WHERE question_id=$1 ORDER BY sort_order,id', [q.id]);
      const subs = await client.query('SELECT id,content_id,prompt_text AS prompt_html,hint_html AS hint,explanation_html AS explanation,note,instruction_html,audio_media_id,preparation_duration_seconds,recording_duration_seconds,max_character_count,min_word_count,max_word_count,sort_order AS display_order FROM question_bank_sub_questions WHERE question_id=$1 ORDER BY sort_order,id', [q.id]);
      for (const sub of subs.rows) {
        const opts = await client.query('SELECT id,option_key,option_text,is_correct,sort_order AS display_order FROM question_bank_sub_question_options WHERE sub_question_id=$1 ORDER BY sort_order,id', [sub.id]);
        sub.options = opts.rows;
      }
      out.questions.push({ ...detail.rows[0], contents: contents.rows, subQuestions: subs.rows });
    }
    result.parts.push(out);
  }
  return result;
}

module.exports = {
  mapExam, mapSection, mapPart, lockExam,
  list, findById, create, update, remove, countSections,
  findSection, createSection, updateSection, deleteSection, reorderSections, listSectionIds,
  findPart, findPartWithSection, createPart, updatePartContent, deletePart, reorderParts, listPartIdsInSection,
  listEligibleQuestions, filterEligibleIds, findUsedQuestions, addQuestions, removeQuestion, listPartQuestionIds, reorderQuestions,
  loadDurationSources, loadInstructionAudioDurations, loadInstructionAudioDetails, loadValidationRows, findIneligibleQuestionIds, findInstructionAudioMedia, buildSnapshot,
  findInProgressEvent, replacePublishedSnapshot,
};
