const db = require('../../config/db');

// The API contract follows docs/question-bank-management-spec.md: question_text,
// direct audio_media_id, sort_order and (for MCQ) options with option_text /
// is_correct / sort_order only. Legacy NOT NULL columns that still exist in the
// database (points, sub_question_number, question_type, option_key, content_id)
// are populated by the repository to keep referential integrity but are never
// accepted from the client.
const map = r => r && ({
  id: r.id,
  questionId: r.question_id,
  questionText: r.prompt_text,
  instructionHtml: r.instruction_html || null,
  hintHtml: r.hint_html || null,
  explanationHtml: r.explanation_html || null,
  note: r.note || null,
  audioMediaId: r.audio_media_id || null,
  preparationDurationSeconds: r.preparation_duration_seconds,
  recordingDurationSeconds: r.recording_duration_seconds,
  maxCharacterCount: r.max_character_count,
  minWordCount: r.min_word_count,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapOption = r => ({
  id: r.id,
  subQuestionId: r.sub_question_id,
  optionText: r.option_text,
  isCorrect: r.is_correct,
  sortOrder: r.sort_order,
});

async function list(questionId, client = db) {
  const qs = await client.query('SELECT * FROM question_bank_sub_questions WHERE question_id=$1 ORDER BY sort_order,id', [questionId]);
  if (!qs.rows.length) return [];
  const ids = qs.rows.map(r => r.id);
  const os = await client.query('SELECT * FROM question_bank_sub_question_options WHERE sub_question_id=ANY($1::uuid[]) ORDER BY sort_order,id', [ids]);
  return qs.rows.map(r => ({ ...map(r), options: os.rows.filter(o => o.sub_question_id === r.id).map(mapOption) }));
}

async function find(questionId, id, client = db) {
  const r = await client.query('SELECT * FROM question_bank_sub_questions WHERE id=$1 AND question_id=$2', [id, questionId]);
  if (!r.rows[0]) return null;
  const os = await client.query('SELECT * FROM question_bank_sub_question_options WHERE sub_question_id=$1 ORDER BY sort_order,id', [id]);
  return { ...map(r.rows[0]), options: os.rows.map(mapOption) };
}

function questionText(data) { return String(data.questionText ?? data.promptHtml ?? '').trim(); }

async function insertRow(client, questionId, data, sortOrder) {
  const q = await client.query(
    `INSERT INTO question_bank_sub_questions(
       question_id,content_id,sub_question_number,question_type,prompt_text,hint_html,explanation_html,note,points,
       instruction_html,preparation_duration_seconds,recording_duration_seconds,max_character_count,min_word_count,audio_media_id,sort_order,display_order)
     SELECT $1,NULL,COALESCE(MAX(s.sub_question_number)+1,1),p.question_type,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,$11,$12,$12
     FROM question_bank_questions p LEFT JOIN question_bank_sub_questions s ON s.question_id=p.id
     WHERE p.id=$1 GROUP BY p.question_type RETURNING *`,
    [questionId, questionText(data), data.hintHtml || null, data.explanationHtml || null, data.note || null,
      data.instructionHtml || null, data.preparationDurationSeconds ?? null, data.recordingDurationSeconds ?? null,
      data.maxCharacterCount ?? null, data.minWordCount ?? null, data.audioMediaId || null, sortOrder],
  );
  return q.rows[0];
}

async function updateRow(client, questionId, id, data, sortOrder) {
  const updatesAudio = Object.prototype.hasOwnProperty.call(data, 'audioMediaId');
  const q = await client.query(
    `UPDATE question_bank_sub_questions SET prompt_text=$3,hint_html=$4,explanation_html=$5,note=$6,instruction_html=$7,
       preparation_duration_seconds=$8,recording_duration_seconds=$9,max_character_count=$10,min_word_count=$11,
       audio_media_id=CASE WHEN $12::boolean THEN $13::uuid ELSE audio_media_id END,
       sort_order=$14,display_order=$14,updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND question_id=$2 RETURNING id`,
    [id, questionId, questionText(data), data.hintHtml || null, data.explanationHtml || null, data.note || null,
      data.instructionHtml || null, data.preparationDurationSeconds ?? null, data.recordingDurationSeconds ?? null,
      data.maxCharacterCount ?? null, data.minWordCount ?? null, updatesAudio, data.audioMediaId || null, sortOrder],
  );
  return q.rows[0];
}

// option_key still has a NOT NULL + UNIQUE(sub_question_id, option_key)
// constraint in the database. It is no longer part of the contract, so it is
// derived from the option position to keep rows valid without leaking to the API.
async function syncOptions(client, subQuestionId, options) {
  await client.query('DELETE FROM question_bank_sub_question_options WHERE sub_question_id=$1', [subQuestionId]);
  for (let i = 0; i < options.length; i++) {
    await client.query(
      'INSERT INTO question_bank_sub_question_options(sub_question_id,option_key,option_text,is_correct,sort_order,display_order) VALUES($1,$2,$3,$4,$5,$5)',
      [subQuestionId, String.fromCharCode(65 + i), String(options[i].optionText).trim(), !!options[i].isCorrect, i],
    );
  }
}

async function create(questionId, data) {
  return db.transaction(async client => {
    const order = await client.query('SELECT COALESCE(MAX(sort_order)+1,0) n FROM question_bank_sub_questions WHERE question_id=$1', [questionId]);
    const row = await insertRow(client, questionId, data, order.rows[0].n);
    if (Array.isArray(data.options)) await syncOptions(client, row.id, data.options);
    return row.id;
  });
}

async function update(questionId, id, data) {
  return db.transaction(async client => {
    const current = await client.query('SELECT sort_order FROM question_bank_sub_questions WHERE id=$1 AND question_id=$2 FOR UPDATE', [id, questionId]);
    if (!current.rows[0]) return false;
    const row = await updateRow(client, questionId, id, data, data.sortOrder ?? current.rows[0].sort_order);
    if (!row) return false;
    if (Array.isArray(data.options)) await syncOptions(client, id, data.options);
    return true;
  });
}

async function remove(questionId, id) {
  return db.transaction(async client => {
    const media = await client.query('SELECT m.storage_key FROM question_bank_media m JOIN question_bank_sub_questions s ON s.id=m.sub_question_id WHERE s.id=$1 AND s.question_id=$2', [id, questionId]);
    const r = await client.query('DELETE FROM question_bank_sub_questions WHERE id=$1 AND question_id=$2 RETURNING id', [id, questionId]);
    if (r.rows[0]) await normalize(questionId, client);
    return r.rows[0] ? { ...r.rows[0], deletedStorageKeys: media.rows.map(row => row.storage_key) } : null;
  });
}

async function normalize(questionId, client = db) {
  await client.query(
    `WITH ordered AS (SELECT id,ROW_NUMBER() OVER(ORDER BY sort_order,id)-1 n FROM question_bank_sub_questions WHERE question_id=$1)
     UPDATE question_bank_sub_questions s SET sort_order=o.n,display_order=o.n,updated_at=CURRENT_TIMESTAMP FROM ordered o WHERE s.id=o.id`,
    [questionId],
  );
}

async function reorder(questionId, ids) {
  return db.transaction(async client => {
    const rows = await client.query('SELECT id FROM question_bank_sub_questions WHERE question_id=$1', [questionId]);
    const expected = rows.rows.map(r => String(r.id)).sort();
    const got = ids.map(String).sort();
    if (expected.length !== got.length || expected.some((id, i) => id !== got[i])) return false;
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE question_bank_sub_questions SET sort_order=$1,display_order=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND question_id=$3', [i, ids[i], questionId]);
    }
    return true;
  });
}

// Save the whole Câu hỏi tab in one transaction: create new items, update
// existing ones, delete rows removed from the payload, and (for MCQ) resync
// options. sort_order is normalised contiguously from 0. Any error rolls back
// the entire operation.
async function saveAll(questionId, items) {
  return db.transaction(async client => {
    const existing = await client.query('SELECT id,audio_media_id FROM question_bank_sub_questions WHERE question_id=$1', [questionId]);
    const existingIds = new Set(existing.rows.map(r => String(r.id)));
    const existingById = new Map(existing.rows.map(row => [String(row.id), row]));
    const keptIds = new Set();
    const replacedMediaIds = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const id = item.id ? String(item.id) : null;
      let rowId;
      if (id) {
        if (!existingIds.has(id)) {
          const err = new Error('SUB_QUESTION_NOT_IN_QUESTION');
          err.code = 'SUB_QUESTION_NOT_IN_QUESTION';
          throw err;
        }
        const row = await updateRow(client, questionId, id, item, i);
        rowId = row.id;
        keptIds.add(id);
      } else {
        const row = await insertRow(client, questionId, item, i);
        rowId = row.id;
      }
      const mediaId = item.audioMediaId || null;
      if (mediaId) {
        const media = await client.query(
          `SELECT id FROM question_bank_media
           WHERE id=$1 AND question_id=$2 AND media_type='AUDIO' AND content_id IS NULL AND sample_answer_id IS NULL
             AND (sub_question_id IS NULL OR sub_question_id=$3) FOR UPDATE`,
          [mediaId, questionId, rowId],
        );
        if (!media.rows[0]) {
          const err = new Error('SUB_QUESTION_AUDIO_INVALID');
          err.code = 'SUB_QUESTION_AUDIO_INVALID';
          throw err;
        }
        await client.query('UPDATE question_bank_media SET sub_question_id=$2 WHERE id=$1', [mediaId, rowId]);
      }
      const oldMediaId = existingById.get(String(rowId))?.audio_media_id;
      if (oldMediaId && String(oldMediaId) !== String(mediaId || '')) replacedMediaIds.push(oldMediaId);
      if (Array.isArray(item.options)) await syncOptions(client, rowId, item.options);
    }
    const toDelete = [...existingIds].filter(id => !keptIds.has(id));
    let deletedStorageKeys = [];
    if (replacedMediaIds.length) {
      const replaced = await client.query('DELETE FROM question_bank_media WHERE id=ANY($1::uuid[]) RETURNING storage_key', [replacedMediaIds]);
      deletedStorageKeys.push(...replaced.rows.map(row => row.storage_key));
    }
    if (toDelete.length) {
      const media = await client.query('SELECT storage_key FROM question_bank_media WHERE sub_question_id=ANY($1::uuid[])', [toDelete]);
      deletedStorageKeys.push(...media.rows.map(row => row.storage_key));
      await client.query('DELETE FROM question_bank_sub_questions WHERE question_id=$1 AND id=ANY($2::uuid[])', [questionId, toDelete]);
    }
    return { items: await list(questionId, client), deletedStorageKeys };
  });
}

module.exports = { map, mapOption, list, find, create, update, remove, reorder, saveAll };
