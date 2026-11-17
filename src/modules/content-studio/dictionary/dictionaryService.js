'use strict';

const db = require('../../../config/db');
const HttpError = require('../../../http/httpError');
const { splitSentences } = require('../detect/detectContent');
const { containsExactChunk, normalizedSentence, validateEntry } = require('./normalize');
const worker = require('./worker');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requireId = (value, label = 'id') => {
  if (!UUID.test(String(value || ''))) throw new HttpError(`${label} không hợp lệ.`, 400, 'INVALID_ID');
  return String(value);
};
const uniqueIds = (values, label) => [...new Set((Array.isArray(values) ? values : []).map(value => requireId(value, label)))];

async function requireItem(client, itemId, lock = false) {
  const { rows: [item] } = await client.query(`SELECT id FROM cs_items WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [itemId]);
  if (!item) throw new HttpError('Không tìm thấy học liệu.', 404, 'ITEM_NOT_FOUND');
  return item;
}

async function extract(itemId) {
  requireId(itemId);
  const result = await db.transaction(async client => {
    await requireItem(client, itemId, true);
    const busy = await client.query(`SELECT 1 FROM cs_dict_sentences WHERE item_id = $1 AND status IN ('queued','generating') LIMIT 1`, [itemId]);
    if (busy.rowCount) throw new HttpError('Từ điển đang được xử lý.', 409, 'DICTIONARY_BUSY');
    const { rows: segments } = await client.query(
      `SELECT id, position, text FROM cs_segments WHERE item_id = $1 AND kind = 'passage' ORDER BY position`, [itemId]);
    if (!segments.length) throw new HttpError('Học liệu không có đoạn văn.', 400, 'NO_PASSAGE');
    await client.query('DELETE FROM cs_dict_sentences WHERE item_id = $1', [itemId]);
    let position = 0;
    for (const segment of segments) {
      for (const text of splitSentences(segment.text)) {
        await client.query(`INSERT INTO cs_dict_sentences (item_id, segment_id, position, text, status)
          VALUES ($1, $2, $3, $4, 'queued')`, [itemId, segment.id, position, text]);
        position += 1;
      }
    }
    if (!position) throw new HttpError('Không tách được câu trong đoạn văn.', 400, 'NO_SENTENCES');
    return { itemId, queued: 1, sentenceCount: position };
  });
  worker.kickWorker();
  return result;
}

async function getState(itemId) {
  requireId(itemId);
  await requireItem(db, itemId);
  const { rows } = await db.query(`
    SELECT s.id, s.segment_id AS "segmentId", s.position, s.text, s.status, s.updated_at AS "updatedAt",
           c.id AS "candidateId", c.position AS "candidatePosition", c.chunk, c.status AS "candidateStatus",
           c.attempts, c.error, c.updated_at AS "candidateUpdatedAt",
           e.content, e.validation, e.source, e.provider, e.updated_at AS "entryUpdatedAt"
    FROM cs_dict_sentences s
    LEFT JOIN cs_dict_candidates c ON c.sentence_id = s.id
    LEFT JOIN cs_dict_entries e ON e.candidate_id = c.id
    WHERE s.item_id = $1 ORDER BY s.position, c.position`, [itemId]);
  const sentences = [];
  const byId = new Map();
  for (const row of rows) {
    let sentence = byId.get(row.id);
    if (!sentence) {
      sentence = { id: row.id, segmentId: row.segmentId, position: row.position, text: row.text, status: row.status, updatedAt: row.updatedAt, candidates: [] };
      byId.set(row.id, sentence);
      sentences.push(sentence);
    }
    if (row.candidateId) sentence.candidates.push({
      id: row.candidateId, position: row.candidatePosition, chunk: row.chunk, status: row.candidateStatus,
      attempts: row.attempts, error: row.error, updatedAt: row.candidateUpdatedAt,
      entry: row.content ? { content: row.content, validation: row.validation, source: row.source, provider: row.provider, updatedAt: row.entryUpdatedAt } : null,
    });
  }
  const candidates = sentences.flatMap(sentence => sentence.candidates);
  const counts = candidates.reduce((result, candidate) => {
    result.total += 1;
    result[candidate.status] = (result[candidate.status] || 0) + 1;
    return result;
  }, { total: 0, sentences: sentences.length });
  return { itemId, status: dictionaryStatus(sentences, candidates), counts, sentences };
}

function dictionaryStatus(sentences, candidates) {
  const statuses = [...sentences.map(row => row.status), ...candidates.map(row => row.status)];
  if (!sentences.length) return null;
  if (statuses.includes('failed')) return 'failed';
  if (statuses.some(status => status === 'queued' || status === 'generating')) return 'generating';
  if (statuses.includes('draft')) return 'waiting_review';
  if (statuses.includes('needs_review')) return 'needs_review';
  return candidates.length && candidates.every(candidate => candidate.status === 'ready') ? 'ready' : 'waiting_review';
}

async function saveList(itemId, sentencePayload) {
  requireId(itemId);
  if (!Array.isArray(sentencePayload)) throw new HttpError('Danh sách câu không hợp lệ.', 400, 'INVALID_DICTIONARY_LIST');
  const result = await db.transaction(async client => {
    await requireItem(client, itemId, true);
    const { rows: stored } = await client.query(
      'SELECT id, text FROM cs_dict_sentences WHERE item_id = $1 ORDER BY position FOR UPDATE', [itemId]);
    if (!stored.length) throw new HttpError('Chưa có danh sách từ để duyệt.', 409, 'DICTIONARY_NOT_EXTRACTED');
    if (sentencePayload.length !== stored.length) throw new HttpError('Phải gửi đầy đủ danh sách câu.', 400, 'DICTIONARY_SENTENCE_COUNT');
    const payloadById = new Map(sentencePayload.map(sentence => [requireId(sentence?.id, 'sentenceId'), sentence]));
    if (payloadById.size !== stored.length || stored.some(sentence => !payloadById.has(sentence.id))) {
      throw new HttpError('Danh sách câu không thuộc học liệu này.', 400, 'INVALID_DICTIONARY_SENTENCE');
    }
    let total = 0;
    for (const sentence of stored) {
      const chunks = Array.isArray(payloadById.get(sentence.id)?.chunks) ? payloadById.get(sentence.id).chunks : [];
      const seen = new Set();
      const normalized = chunks.map(value => ({
        id: value?.id ? requireId(value.id, 'candidateId') : null,
        chunk: String(value?.chunk || '').trim(),
      })).filter(value => {
        const key = normalizedSentence(value.chunk);
        if (!value.chunk || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const value of normalized) {
        if (!containsExactChunk(sentence.text, value.chunk)) {
          throw new HttpError(`“${value.chunk}” không xuất hiện chính xác trong câu nguồn.`, 400, 'DICTIONARY_ITEM_NOT_IN_SENTENCE');
        }
      }
      total += normalized.length;
      if (total > 300) throw new HttpError('Danh sách từ tối đa 300 mục.', 400, 'DICTIONARY_TOO_MANY_ITEMS');
      const { rows: existing } = await client.query(
        'SELECT id, chunk FROM cs_dict_candidates WHERE sentence_id = $1 FOR UPDATE', [sentence.id]);
      const existingById = new Map(existing.map(candidate => [candidate.id, candidate]));
      const kept = [];
      for (let position = 0; position < normalized.length; position += 1) {
        const value = normalized[position];
        if (value.id) {
          const current = existingById.get(value.id);
          if (!current) throw new HttpError('Từ không thuộc câu này.', 400, 'INVALID_DICTIONARY_CANDIDATE');
          const changed = current.chunk !== value.chunk;
          await client.query(`UPDATE cs_dict_candidates SET position = $2, chunk = $3,
            status = CASE WHEN $4 THEN 'draft' ELSE status END,
            attempts = CASE WHEN $4 THEN 0 ELSE attempts END,
            error = CASE WHEN $4 THEN NULL ELSE error END,
            locked_at = CASE WHEN $4 THEN NULL ELSE locked_at END, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [value.id, position, value.chunk, changed]);
          if (changed) await client.query('DELETE FROM cs_dict_entries WHERE candidate_id = $1', [value.id]);
          kept.push(value.id);
        } else {
          const { rows: [created] } = await client.query(`INSERT INTO cs_dict_candidates
            (item_id, sentence_id, position, chunk, status) VALUES ($1, $2, $3, $4, 'draft') RETURNING id`,
          [itemId, sentence.id, position, value.chunk]);
          kept.push(created.id);
        }
      }
      await client.query('DELETE FROM cs_dict_candidates WHERE sentence_id = $1 AND NOT (id = ANY($2::uuid[]))', [sentence.id, kept]);
      await worker.refreshSentenceStatus(client, sentence.id);
    }
    await client.query('UPDATE cs_items SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [itemId]);
    return { itemId, count: total };
  });
  return { ...result, ...(await getState(itemId)) };
}

async function generate(itemId, { candidateIds, sentenceIds } = {}) {
  requireId(itemId);
  const candidates = uniqueIds(candidateIds, 'candidateId');
  const sentences = uniqueIds(sentenceIds, 'sentenceId');
  const result = await db.transaction(async client => {
    await requireItem(client, itemId, true);
    const params = [itemId];
    const filters = [];
    if (candidates.length) { params.push(candidates); filters.push(`c.id = ANY($${params.length}::uuid[])`); }
    if (sentences.length) { params.push(sentences); filters.push(`c.sentence_id = ANY($${params.length}::uuid[])`); }
    const selection = filters.length ? `(${filters.join(' OR ')})` : `c.status = 'draft'`;
    const { rows } = await client.query(`UPDATE cs_dict_candidates c SET status = 'queued', attempts = 0,
      error = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE c.item_id = $1 AND ${selection} AND c.status NOT IN ('queued','generating') RETURNING c.id, c.sentence_id`, params);
    if (!rows.length) throw new HttpError('Không có từ nào sẵn sàng để tạo.', 409, 'NO_DICTIONARY_CANDIDATES');
    if (candidates.length && !candidates.every(id => rows.some(row => row.id === id))) {
      throw new HttpError('Một số từ không thuộc học liệu hoặc đang được xử lý.', 400, 'INVALID_DICTIONARY_CANDIDATE');
    }
    if (sentences.length && !sentences.every(id => rows.some(row => row.sentence_id === id))) {
      throw new HttpError('Một số câu không thuộc học liệu hoặc không có từ sẵn sàng.', 400, 'INVALID_DICTIONARY_SENTENCE');
    }
    const sentenceIdList = [...new Set(rows.map(row => row.sentence_id))];
    await client.query(`UPDATE cs_dict_sentences SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::uuid[])`, [sentenceIdList]);
    return { itemId, queued: rows.length };
  });
  worker.kickWorker();
  return result;
}

async function saveEntry(candidateId, content) {
  requireId(candidateId, 'candidateId');
  return db.transaction(async client => {
    const { rows: [candidate] } = await client.query(`SELECT c.id, c.item_id, c.status, s.id AS sentence_id, s.text
      FROM cs_dict_candidates c JOIN cs_dict_sentences s ON s.id = c.sentence_id WHERE c.id = $1 FOR UPDATE OF c`, [candidateId]);
    if (!candidate) throw new HttpError('Không tìm thấy từ.', 404, 'DICTIONARY_CANDIDATE_NOT_FOUND');
    if (['queued', 'generating'].includes(candidate.status)) throw new HttpError('Từ đang được tạo.', 409, 'DICTIONARY_BUSY');
    const checked = validateEntry(content, candidate.text);
    const status = checked.validation.issues.length ? 'needs_review' : 'ready';
    await client.query(`INSERT INTO cs_dict_entries (candidate_id, content, validation, source)
      VALUES ($1, $2, $3, 'human') ON CONFLICT (candidate_id) DO UPDATE SET content = EXCLUDED.content,
      validation = EXCLUDED.validation, source = 'human', provider = NULL, updated_at = CURRENT_TIMESTAMP`,
    [candidateId, JSON.stringify(checked.content), JSON.stringify(checked.validation)]);
    await client.query(`UPDATE cs_dict_candidates SET status = $2, error = NULL, locked_at = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [candidateId, status]);
    await worker.refreshSentenceStatus(client, candidate.sentence_id);
    return { candidateId, status, ...checked };
  });
}

async function regenerateEntry(candidateId) {
  requireId(candidateId, 'candidateId');
  const { rows: [row] } = await db.query(`UPDATE cs_dict_candidates SET status = 'queued', attempts = 0,
    error = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status NOT IN ('queued','generating') RETURNING id, item_id AS "itemId", sentence_id`, [candidateId]);
  if (!row) throw new HttpError('Không thể tạo lại từ này lúc này.', 409, 'DICTIONARY_BUSY');
  await db.query(`UPDATE cs_dict_sentences SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.sentence_id]);
  worker.kickWorker();
  return { candidateId: row.id, itemId: row.itemId };
}

async function removeCandidate(candidateId) {
  requireId(candidateId, 'candidateId');
  return db.transaction(async client => {
    const { rows: [row] } = await client.query(`DELETE FROM cs_dict_candidates WHERE id = $1
      AND status NOT IN ('queued','generating') RETURNING id, item_id AS "itemId", sentence_id`, [candidateId]);
    if (!row) throw new HttpError('Không tìm thấy từ hoặc từ đang được xử lý.', 409, 'DICTIONARY_BUSY');
    await client.query(`WITH ranked AS (SELECT id, row_number() OVER (ORDER BY position, created_at) - 1 AS next_position
      FROM cs_dict_candidates WHERE sentence_id = $1) UPDATE cs_dict_candidates c SET position = ranked.next_position
      FROM ranked WHERE c.id = ranked.id`, [row.sentence_id]);
    await worker.refreshSentenceStatus(client, row.sentence_id);
    return { candidateId: row.id, itemId: row.itemId };
  });
}

module.exports = { extract, generate, getState, regenerateEntry, removeCandidate, saveEntry, saveList };
