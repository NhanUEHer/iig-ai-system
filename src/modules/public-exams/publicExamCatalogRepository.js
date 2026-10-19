const db = require('../../config/db');

const catalogSelect = `e.id,e.exam_code,e.title,e.exam_type,e.description,e.display_label,e.difficulty,
  e.card_image_storage_key,e.card_image_mime_type,e.card_image_file_size,e.updated_at,
  (SELECT COUNT(*) FROM exam_attempts ea WHERE ea.exam_id=e.id)::int popularity_count,
  (SELECT COUNT(*) FROM exam_sections es WHERE es.exam_id=e.id)::int section_count,
  (SELECT COUNT(*) FROM exam_part_questions epq JOIN question_bank_sub_questions sq ON sq.question_id=epq.question_id WHERE epq.exam_id=e.id)::int question_count,
  (SELECT COALESCE(SUM(es.configured_duration_seconds),0) FROM exam_sections es WHERE es.exam_id=e.id)::int duration_seconds,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',eg.id,'name',eg.name) ORDER BY eg.name)
    FROM exam_group_assignments ega JOIN exam_groups eg ON eg.id=ega.group_id WHERE ega.exam_id=e.id),'[]'::jsonb) groups`;

const publicWhere = `e.status='ACTIVE' AND e.active_version_id IS NOT NULL AND e.published_snapshot IS NOT NULL
  AND e.card_image_storage_key IS NOT NULL AND e.difficulty IS NOT NULL
  AND EXISTS(SELECT 1 FROM exam_group_assignments required_group WHERE required_group.exam_id=e.id)`;

function mapRow(row) {
  return {
    id: row.id,
    code: row.exam_code,
    title: row.title,
    examType: row.exam_type,
    description: row.description || '',
    label: row.display_label || '',
    difficulty: row.difficulty,
    image: {
      storageKey: row.card_image_storage_key,
      mimeType: row.card_image_mime_type || null,
      fileSize: Number(row.card_image_file_size || 0),
    },
    groups: Array.isArray(row.groups) ? row.groups : [],
    sectionCount: Number(row.section_count || 0),
    questionCount: Number(row.question_count || 0),
    durationSeconds: Number(row.duration_seconds || 0),
    popularityCount: Number(row.popularity_count || 0),
    updatedAt: row.updated_at,
  };
}

async function list(filters = {}) {
  const params = [];
  const where = [publicWhere];
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(e.title ILIKE $${params.length} OR e.exam_code ILIKE $${params.length})`);
  }
  if (filters.groupIds.length) {
    params.push(filters.groupIds);
    where.push(`EXISTS(SELECT 1 FROM exam_group_assignments selected_group WHERE selected_group.exam_id=e.id AND selected_group.group_id=ANY($${params.length}::uuid[]))`);
  }
  if (filters.difficulties.length) {
    params.push(filters.difficulties);
    where.push(`e.difficulty=ANY($${params.length}::varchar[])`);
  }
  if (filters.examTypes.length) {
    params.push(filters.examTypes);
    where.push(`e.exam_type=ANY($${params.length}::varchar[])`);
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const count = await db.query(`SELECT COUNT(*)::int total FROM exams e ${clause}`, params);
  params.push(filters.limit, (filters.page - 1) * filters.limit);
  const result = await db.query(
    `SELECT ${catalogSelect} FROM exams e ${clause}
     ORDER BY popularity_count DESC,e.updated_at DESC,e.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows: result.rows.map(mapRow), total: Number(count.rows[0].total || 0) };
}

async function listGroups() {
  const result = await db.query(
    `SELECT eg.id,eg.name,COUNT(DISTINCT e.id)::int exam_count
     FROM exam_groups eg
     LEFT JOIN exam_group_assignments ega ON ega.group_id=eg.id
     LEFT JOIN exams e ON e.id=ega.exam_id AND ${publicWhere}
     GROUP BY eg.id,eg.name
     HAVING COUNT(DISTINCT e.id)>0
     ORDER BY LOWER(eg.name),eg.id`,
  );
  return result.rows.map(row => ({ id: row.id, name: row.name, examCount: Number(row.exam_count || 0) }));
}

async function findPublishedSnapshot(examId) {
  const result = await db.query(
    `SELECT e.published_snapshot FROM exams e WHERE e.id=$1 AND ${publicWhere} LIMIT 1`,
    [examId],
  );
  return result.rows[0]?.published_snapshot || null;
}

module.exports = { list, listGroups, findPublishedSnapshot, mapRow, publicWhere };
