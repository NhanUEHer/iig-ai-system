const db = require('../../config/db');

const map = row => row && ({
  id: row.id,
  attemptId: row.attempt_id,
  questionId: row.question_id,
  subQuestionId: row.sub_question_id,
  storageKey: row.storage_key,
  mimeType: row.mime_type,
  fileSize: row.file_size == null ? null : Number(row.file_size),
  durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
  checksum: row.checksum,
  status: row.status,
  attemptNumber: Number(row.attempt_number),
  createdAt: row.created_at,
  uploadedAt: row.uploaded_at,
});

async function createPending({ attemptId, questionId, subQuestionId, storageKey, mimeType }) {
  const result = await db.query(
    `INSERT INTO exam_attempt_recordings(attempt_id,question_id,sub_question_id,storage_key,mime_type,attempt_number)
     VALUES($1,$2,$3,$4,$5,
       1 + COALESCE((SELECT MAX(attempt_number) FROM exam_attempt_recordings WHERE attempt_id=$1 AND sub_question_id=$3),0))
     RETURNING *`,
    [attemptId, questionId, subQuestionId, storageKey, mimeType],
  );
  return map(result.rows[0]);
}

async function findOwned(id, attemptId, subQuestionId) {
  const result = await db.query(
    'SELECT * FROM exam_attempt_recordings WHERE id=$1 AND attempt_id=$2 AND sub_question_id=$3',
    [id, attemptId, subQuestionId],
  );
  return map(result.rows[0]);
}

async function activate({ id, attemptId, subQuestionId, fileSize, durationSeconds, checksum, mimeType, now }) {
  return db.transaction(async client => {
    const pending = (await client.query(
      `SELECT * FROM exam_attempt_recordings
       WHERE id=$1 AND attempt_id=$2 AND sub_question_id=$3 FOR UPDATE`,
      [id, attemptId, subQuestionId],
    )).rows[0];
    if (!pending) return null;
    const replaced = (await client.query(
      `UPDATE exam_attempt_recordings SET status='REPLACED',updated_at=$3
       WHERE attempt_id=$1 AND sub_question_id=$2 AND status='ACTIVE' AND id<>$4
       RETURNING storage_key`,
      [attemptId, subQuestionId, now, id],
    )).rows.map(row => row.storage_key);
    const active = (await client.query(
      `UPDATE exam_attempt_recordings SET status='ACTIVE',file_size=$4,duration_seconds=$5,
         checksum=$6,mime_type=$7,uploaded_at=$8,updated_at=$8
       WHERE id=$1 AND attempt_id=$2 AND sub_question_id=$3 RETURNING *`,
      [id, attemptId, subQuestionId, fileSize, durationSeconds, checksum || null, mimeType, now],
    )).rows[0];
    await client.query('UPDATE exam_attempts SET last_activity_at=$2,updated_at=$2 WHERE id=$1', [attemptId, now]);
    return { recording: map(active), replacedStorageKeys: replaced };
  });
}

async function findActive(attemptId, subQuestionId) {
  const result = await db.query(
    `SELECT * FROM exam_attempt_recordings
     WHERE attempt_id=$1 AND sub_question_id=$2 AND status='ACTIVE' AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [attemptId, subQuestionId],
  );
  return map(result.rows[0]);
}

async function softDelete(id, attemptId, subQuestionId, now) {
  const result = await db.query(
    `UPDATE exam_attempt_recordings SET status='DELETED',deleted_at=$4,updated_at=$4
     WHERE id=$1 AND attempt_id=$2 AND sub_question_id=$3 AND status IN ('PENDING','UPLOADED','ACTIVE','FAILED')
     RETURNING *`,
    [id, attemptId, subQuestionId, now],
  );
  return map(result.rows[0]);
}

async function activeByAttempt(attemptId) {
  const result = await db.query(
    `SELECT * FROM exam_attempt_recordings WHERE attempt_id=$1 AND status='ACTIVE' AND deleted_at IS NULL`,
    [attemptId],
  );
  return result.rows.map(map);
}

module.exports = { createPending, findOwned, activate, findActive, softDelete, activeByAttempt };
