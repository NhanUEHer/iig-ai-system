const db = require('../../config/db');

async function findVersionQuestionDelivery(versionId) {
  const version = (await db.query(
    'SELECT id,exam_id,snapshot FROM exam_versions WHERE id=$1',
    [versionId],
  )).rows[0];
  if (!version) return null;
  const snapshot = version.snapshot || {};
  const contentIds = [];
  const subQuestionIds = [];
  const partIds = [];
  for (const part of snapshot.parts || []) {
    if (part.id) partIds.push(part.id);
    for (const question of part.questions || []) {
      for (const content of question.contents || []) if (content.id) contentIds.push(content.id);
      for (const subQuestion of question.subQuestions || []) if (subQuestion.id) subQuestionIds.push(subQuestion.id);
    }
  }
  const media = contentIds.length || subQuestionIds.length || partIds.length ? (await db.query(
    `SELECT id,content_id,sub_question_id,part_id,media_type,storage_key,mime_type,original_name,duration_seconds
     FROM question_bank_media
     WHERE content_id=ANY($1::uuid[]) OR sub_question_id=ANY($2::uuid[]) OR part_id=ANY($3::uuid[])
     ORDER BY created_at,id`,
    [contentIds, subQuestionIds, partIds],
  )).rows : [];
  return { version, snapshot, media };
}

async function findCurrentExamQuestionDelivery(examId) {
  const result = await db.query(
    `SELECT active_version_id FROM exams
     WHERE id=$1 AND status='ACTIVE' AND active_version_id IS NOT NULL AND published_snapshot IS NOT NULL`,
    [examId],
  );
  const versionId = result.rows[0]?.active_version_id;
  return versionId ? findVersionQuestionDelivery(versionId) : null;
}

module.exports = { findVersionQuestionDelivery, findCurrentExamQuestionDelivery };
