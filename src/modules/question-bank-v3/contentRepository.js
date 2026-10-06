const db = require('../../config/db');

const map = r => r && ({
  id: r.id,
  questionId: r.question_id,
  title: r.title,
  contentHtml: r.content_html,
  scriptHtml: r.script_html,
  translationHtml: r.translation_html,
  audioMediaId: r.audio_media_id || null,
  imageMediaId: r.image_media_id || null,
  videoMediaId: r.video_media_id || null,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function list(questionId, client = db) {
  const r = await client.query('SELECT * FROM question_bank_contents WHERE question_id=$1 ORDER BY sort_order,id', [questionId]);
  return r.rows.map(map);
}

async function find(id, questionId, client = db) {
  const r = await client.query('SELECT * FROM question_bank_contents WHERE id=$1 AND question_id=$2', [id, questionId]);
  return map(r.rows[0]);
}

async function create(questionId, data) {
  const r = await db.query(
    `INSERT INTO question_bank_contents(question_id,title,content_html,script_html,translation_html,sort_order,display_order)
     SELECT $1,$2,$3,$4,$5,next_order,next_order FROM (SELECT COALESCE(MAX(sort_order)+1,0) next_order FROM question_bank_contents WHERE question_id=$1) s
     RETURNING *`,
    [questionId, data.title.trim(), data.contentHtml || null, data.scriptHtml || null, data.translationHtml || null],
  );
  return map(r.rows[0]);
}

async function update(id, questionId, data) {
  const r = await db.query(
    `UPDATE question_bank_contents SET title=COALESCE($3,title),content_html=COALESCE($4,content_html),script_html=COALESCE($5,script_html),translation_html=COALESCE($6,translation_html),updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND question_id=$2 RETURNING *`,
    [id, questionId, data.title, data.contentHtml, data.scriptHtml, data.translationHtml],
  );
  return map(r.rows[0]);
}

async function remove(id, questionId) {
  return db.transaction(async client => {
    const media = await client.query('SELECT m.storage_key FROM question_bank_media m JOIN question_bank_contents c ON c.id=m.content_id WHERE c.id=$1 AND c.question_id=$2', [id, questionId]);
    const r = await client.query('DELETE FROM question_bank_contents WHERE id=$1 AND question_id=$2 RETURNING id', [id, questionId]);
    if (r.rows[0]) await normalize(questionId, client);
    return r.rows[0] ? { ...r.rows[0], deletedStorageKeys: media.rows.map(row => row.storage_key) } : null;
  });
}

async function normalize(questionId, client = db) {
  await client.query(
    `WITH ordered AS (SELECT id,ROW_NUMBER() OVER(ORDER BY sort_order,id)-1 n FROM question_bank_contents WHERE question_id=$1)
     UPDATE question_bank_contents c SET sort_order=o.n,display_order=o.n,updated_at=CURRENT_TIMESTAMP FROM ordered o WHERE c.id=o.id`,
    [questionId],
  );
}

async function reorder(questionId, ids) {
  return db.transaction(async client => {
    const found = await client.query('SELECT id FROM question_bank_contents WHERE question_id=$1', [questionId]);
    const expected = found.rows.map(r => String(r.id)).sort();
    const received = ids.map(String).sort();
    if (expected.length !== received.length || expected.some((id, i) => id !== received[i])) return false;
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE question_bank_contents SET sort_order=$1,display_order=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND question_id=$3', [i, ids[i], questionId]);
    }
    return true;
  });
}

// Save the entire content tab in one transaction: items without id are created,
// items with a known id are updated, and existing rows missing from the payload
// are deleted. sort_order is normalised contiguously from 0. Media links are
// preserved on update and detached on delete.
async function saveAll(questionId, items) {
  return db.transaction(async client => {
    const existing = await client.query('SELECT id,audio_media_id,image_media_id,video_media_id FROM question_bank_contents WHERE question_id=$1', [questionId]);
    const existingIds = new Set(existing.rows.map(r => String(r.id)));
    const existingById = new Map(existing.rows.map(row => [String(row.id), row]));
    const keptIds = new Set();
    const replacedMediaIds = [];
    const mediaFields = [
      ['audioMediaId', 'audio_media_id', 'AUDIO'],
      ['imageMediaId', 'image_media_id', 'IMAGE'],
      ['videoMediaId', 'video_media_id', 'VIDEO'],
    ];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const id = item.id ? String(item.id) : null;
      let contentId = id;
      if (id) {
        if (!existingIds.has(id)) {
          const err = new Error('CONTENT_NOT_IN_QUESTION');
          err.code = 'CONTENT_NOT_IN_QUESTION';
          throw err;
        }
        await client.query(
          `UPDATE question_bank_contents SET title=$3,content_html=$4,script_html=$5,translation_html=$6,
           audio_media_id=$7,image_media_id=$8,video_media_id=$9,sort_order=$10,display_order=$10,updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND question_id=$2`,
          [id, questionId, item.title.trim(), item.contentHtml || null, item.scriptHtml || null, item.translationHtml || null,
            item.audioMediaId || null, item.imageMediaId || null, item.videoMediaId || null, i],
        );
        keptIds.add(id);
      } else {
        const inserted = await client.query(
          `INSERT INTO question_bank_contents(question_id,title,content_html,script_html,translation_html,audio_media_id,image_media_id,video_media_id,sort_order,display_order)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
          [questionId, item.title.trim(), item.contentHtml || null, item.scriptHtml || null, item.translationHtml || null,
            item.audioMediaId || null, item.imageMediaId || null, item.videoMediaId || null, i],
        );
        contentId = inserted.rows[0].id;
      }
      const previous = existingById.get(String(contentId));
      for (const [payloadField, column, type] of mediaFields) {
        const mediaId = item[payloadField] || null;
        if (mediaId) {
          const media = await client.query(
            `SELECT id FROM question_bank_media
             WHERE id=$1 AND question_id=$2 AND media_type=$3 AND sub_question_id IS NULL AND sample_answer_id IS NULL
               AND (content_id IS NULL OR content_id=$4) FOR UPDATE`,
            [mediaId, questionId, type, contentId],
          );
          if (!media.rows[0]) {
            const err = new Error('CONTENT_MEDIA_INVALID');
            err.code = 'CONTENT_MEDIA_INVALID';
            throw err;
          }
          await client.query('UPDATE question_bank_media SET content_id=$2 WHERE id=$1', [mediaId, contentId]);
        }
        const oldId = previous?.[column];
        if (oldId && String(oldId) !== String(mediaId || '')) replacedMediaIds.push(oldId);
      }
    }
    const toDelete = [...existingIds].filter(id => !keptIds.has(id));
    let deletedStorageKeys = [];
    if (replacedMediaIds.length) {
      const replaced = await client.query('DELETE FROM question_bank_media WHERE id=ANY($1::uuid[]) RETURNING storage_key', [replacedMediaIds]);
      deletedStorageKeys.push(...replaced.rows.map(row => row.storage_key));
    }
    if (toDelete.length) {
      const media = await client.query('SELECT storage_key FROM question_bank_media WHERE content_id=ANY($1::uuid[])', [toDelete]);
      deletedStorageKeys.push(...media.rows.map(row => row.storage_key));
      await client.query('DELETE FROM question_bank_contents WHERE question_id=$1 AND id=ANY($2::uuid[])', [questionId, toDelete]);
    }
    const rows = await client.query('SELECT * FROM question_bank_contents WHERE question_id=$1 ORDER BY sort_order,id', [questionId]);
    return { items: rows.rows.map(map), deletedStorageKeys };
  });
}

module.exports = { map, list, find, create, update, remove, reorder, saveAll };
