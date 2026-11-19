'use strict';
const db = require('../../config/db');
const HttpError = require('../../http/httpError');
const { detectContent, countSentences, splitSentences } = require('./detect/detectContent');
const summaryService = require('./summaryService');

const MAX_SOURCE_CHARS = 60000;
const MAX_FOLDER_DEPTH = 6;
// Item status is derived from its artifacts at read time so concurrent workers can never leave it stale.
const ITEM_STATUS_SQL = `(SELECT CASE WHEN COUNT(*) = 0 THEN 'draft'
             WHEN bool_or(work.status IN ('queued','generating')) THEN 'generating'
             WHEN bool_or(work.status = 'failed') THEN 'failed'
             WHEN bool_or(work.status IN ('needs_review','draft')) THEN 'needs_review' ELSE 'ready' END
  FROM (
    SELECT a.status FROM cs_artifacts a WHERE a.item_id = i.id
    UNION ALL SELECT ds.status FROM cs_dict_sentences ds WHERE ds.item_id = i.id
    UNION ALL SELECT dc.status FROM cs_dict_candidates dc WHERE dc.item_id = i.id
  ) work)`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requireId = (value, label = 'id') => {
  if (!UUID.test(String(value || ''))) throw new HttpError(`${label} không hợp lệ.`, 400, 'INVALID_ID');
  return value;
};
const optionalFolderId = value => (value === null || value === undefined || value === '' ? null : requireId(value, 'folderId'));
const requireName = (value, max, label) => {
  const name = String(value || '').trim();
  if (!name) throw new HttpError(`${label} không được để trống.`, 400, 'VALIDATION_ERROR');
  if (name.length > max) throw new HttpError(`${label} tối đa ${max} ký tự.`, 400, 'VALIDATION_ERROR');
  return name;
};
const TASKS = { passage: ['translation', 'vocab', 'dictionary'], question: ['translation', 'hint', 'explanation', 'note'] };
const VOCAB_LEVELS = [450, 500, 650, 700, 800];
const VOCAB_MODES = ['balanced', 'phrase_focused', 'single_word_focused'];
function normalizeTasks(tasks, segments) {
  const hasPassage = segments.some(segment => segment.kind === 'passage');
  const hasQuestions = segments.some(segment => segment.questions.length);
  const pick = (group, enabled) => (enabled ? [...new Set((tasks?.[group] || []).map(String))].filter(task => TASKS[group].includes(task)) : []);
  const level = Number(tasks?.vocab?.level);
  const mode = String(tasks?.vocab?.mode || '');
  return {
    passage: pick('passage', hasPassage),
    question: pick('question', hasQuestions),
    vocab: {
      level: VOCAB_LEVELS.includes(level) ? level : 650,
      mode: VOCAB_MODES.includes(mode) ? mode : 'balanced',
    },
  };
}

const requireSource = value => {
  const text = String(value || '').trim();
  if (!text) throw new HttpError('Hãy dán nội dung hoặc tải file DOCX.', 400, 'EMPTY_SOURCE');
  if (text.length > MAX_SOURCE_CHARS) throw new HttpError(`Nội dung tối đa ${MAX_SOURCE_CHARS} ký tự.`, 400, 'SOURCE_TOO_LONG');
  return text;
};

// ---------- folders ----------
async function listFolders() {
  const { rows } = await db.query(`
    SELECT f.id, f.parent_id AS "parentId", f.name, f.sort_order AS "sortOrder",
           (SELECT COUNT(*)::int FROM cs_items i WHERE i.folder_id = f.id) AS "itemCount"
    FROM cs_folders f ORDER BY f.sort_order, f.name`);
  const unfiled = await db.query('SELECT COUNT(*)::int AS count FROM cs_items WHERE folder_id IS NULL');
  return { folders: rows, unfiledCount: unfiled.rows[0].count };
}

async function folderDepth(client, id) {
  const { rows } = await client.query(`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 1 AS depth FROM cs_folders WHERE id = $1
      UNION ALL SELECT f.id, f.parent_id, c.depth + 1 FROM cs_folders f JOIN chain c ON f.id = c.parent_id WHERE c.depth < 50
    ) SELECT MAX(depth)::int AS depth FROM chain`, [id]);
  return rows[0].depth || 0;
}

async function createFolder({ name, parentId }, userId) {
  const parent = optionalFolderId(parentId);
  const folderName = requireName(name, 160, 'Tên thư mục');
  return db.transaction(async client => {
    if (parent) {
      const exists = await client.query('SELECT 1 FROM cs_folders WHERE id = $1', [parent]);
      if (!exists.rowCount) throw new HttpError('Thư mục cha không tồn tại.', 404, 'FOLDER_NOT_FOUND');
      if (await folderDepth(client, parent) >= MAX_FOLDER_DEPTH) throw new HttpError(`Tối đa ${MAX_FOLDER_DEPTH} cấp thư mục.`, 400, 'FOLDER_TOO_DEEP');
    }
    const { rows } = await client.query(`
      INSERT INTO cs_folders (parent_id, name, sort_order, created_by)
      VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM cs_folders WHERE parent_id IS NOT DISTINCT FROM $1), 0), $3)
      RETURNING id, parent_id AS "parentId", name, sort_order AS "sortOrder"`, [parent, folderName, userId]);
    return { ...rows[0], itemCount: 0 };
  });
}

async function updateFolder(id, { name, parentId }) {
  requireId(id);
  return db.transaction(async client => {
    const current = await client.query('SELECT id, parent_id FROM cs_folders WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rowCount) throw new HttpError('Thư mục không tồn tại.', 404, 'FOLDER_NOT_FOUND');
    const nextName = name === undefined ? null : requireName(name, 160, 'Tên thư mục');
    let nextParent = current.rows[0].parent_id;
    if (parentId !== undefined) {
      nextParent = optionalFolderId(parentId);
      if (nextParent) {
        const cycle = await client.query(`
          WITH RECURSIVE chain AS (
            SELECT id, parent_id FROM cs_folders WHERE id = $1
            UNION ALL SELECT f.id, f.parent_id FROM cs_folders f JOIN chain c ON f.id = c.parent_id
          ) SELECT 1 FROM chain WHERE id = $2`, [nextParent, id]);
        if (cycle.rowCount) throw new HttpError('Không thể chuyển thư mục vào chính nó hoặc thư mục con.', 400, 'FOLDER_CYCLE');
        if (await folderDepth(client, nextParent) >= MAX_FOLDER_DEPTH) throw new HttpError(`Tối đa ${MAX_FOLDER_DEPTH} cấp thư mục.`, 400, 'FOLDER_TOO_DEEP');
      }
    }
    const { rows } = await client.query(`
      UPDATE cs_folders SET name = COALESCE($2, name), parent_id = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING id, parent_id AS "parentId", name, sort_order AS "sortOrder"`, [id, nextName, nextParent]);
    return rows[0];
  });
}

async function deleteFolder(id) {
  requireId(id);
  // Items inside the deleted subtree are kept and moved to "Chưa phân loại" (folder_id ON DELETE SET NULL).
  const { rowCount } = await db.query('DELETE FROM cs_folders WHERE id = $1', [id]);
  if (!rowCount) throw new HttpError('Thư mục không tồn tại.', 404, 'FOLDER_NOT_FOUND');
  return { id };
}

// ---------- items ----------
function detect(text) {
  return detectContent(requireSource(text));
}

async function listItems({ folderId, search, limit = 50 } = {}) {
  const params = [];
  const where = [];
  if (folderId === 'unfiled') where.push('i.folder_id IS NULL');
  else if (folderId) {
    params.push(requireId(folderId, 'folderId'));
    where.push(`i.folder_id IN (
      WITH RECURSIVE tree AS (SELECT id FROM cs_folders WHERE id = $${params.length}
        UNION ALL SELECT f.id FROM cs_folders f JOIN tree t ON f.parent_id = t.id) SELECT id FROM tree)`);
  }
  if (search) { params.push(`%${String(search).trim()}%`); where.push(`i.title ILIKE $${params.length}`); }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  const { rows } = await db.query(`
    SELECT i.id, i.folder_id AS "folderId", i.title, ${ITEM_STATUS_SQL} AS status, i.source_kind AS "sourceKind",
           i.detection->'summary' AS summary, i.tasks,
           (SELECT (s.meta->>'part')::int FROM cs_segments s WHERE s.item_id = i.id AND s.kind = 'question_set' AND s.meta->>'part' IS NOT NULL ORDER BY s.position LIMIT 1) AS part,
           (SELECT COALESCE(SUM((s.meta->>'sentenceCount')::int), 0)::int FROM cs_segments s WHERE s.item_id = i.id AND s.kind = 'passage') AS "sentenceCount",
           (SELECT jsonb_object_agg(type, status) FROM (
              SELECT type, CASE WHEN bool_or(status IN ('queued','generating')) THEN 'generating' WHEN bool_or(status = 'failed') THEN 'failed'
                                WHEN bool_or(status = 'needs_review') THEN 'needs_review' ELSE 'ready' END AS status
              FROM cs_artifacts a WHERE a.item_id = i.id GROUP BY type) agg) AS "artifactStatus",
           COALESCE((SELECT jsonb_agg(jsonb_build_object('type', a.type, 'status', a.status)) FROM cs_artifacts a WHERE a.item_id = i.id), '[]'::jsonb) AS "_artifacts",
           ${summaryService.DICTIONARY_STATUS_SQL} AS "_dictionaryStatus",
           i.updated_at AS "updatedAt", COALESCE(u.name, u.username) AS "createdByName"
    FROM cs_items i LEFT JOIN users u ON u.id = i.created_by
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY i.updated_at DESC LIMIT $${params.length}`, params);
  return rows.map(summaryService.decorateItem);
}

function normalizeSegments(segments) {
  if (!Array.isArray(segments) || !segments.length) throw new HttpError('Không nhận dạng được đoạn văn hoặc câu hỏi.', 400, 'NO_SEGMENTS');
  return segments.map((segment, position) => {
    if (!['passage', 'question_set'].includes(segment.kind)) throw new HttpError('Loại nội dung không hợp lệ.', 400, 'INVALID_SEGMENT');
    const questions = segment.kind === 'question_set' ? (segment.questions || []).map(question => {
      const number = Number(question.number);
      if (!Number.isInteger(number) || number < 1) throw new HttpError('Số câu hỏi không hợp lệ.', 400, 'INVALID_QUESTION');
      const answerKey = question.answerKey ? String(question.answerKey).toUpperCase() : null;
      if (answerKey && !/^[A-D]$/.test(answerKey)) throw new HttpError(`Câu ${number}: đáp án phải là A–D.`, 400, 'INVALID_ANSWER');
      const options = {};
      for (const letter of ['A', 'B', 'C', 'D']) if (question.options?.[letter]) options[letter] = String(question.options[letter]).trim();
      return { number, stem: String(question.stem || '').trim(), options, answerKey };
    }) : [];
    return { kind: segment.kind, position, text: String(segment.text || '').trim(), meta: segment.meta || {}, questions };
  });
}

async function createItem({ title, folderId, sourceText, sourceKind = 'paste', sourceFileName, segments, tasks }, userId) {
  const text = requireSource(sourceText);
  const detection = detectContent(text);
  const finalSegments = normalizeSegments(segments || detection.segments);
  const folder = optionalFolderId(folderId);
  const itemTitle = requireName(title || detection.title, 240, 'Tên học liệu');
  return db.transaction(async client => {
    if (folder) {
      const exists = await client.query('SELECT 1 FROM cs_folders WHERE id = $1', [folder]);
      if (!exists.rowCount) throw new HttpError('Thư mục không tồn tại.', 404, 'FOLDER_NOT_FOUND');
    }
    const { rows: [item] } = await client.query(`
      INSERT INTO cs_items (folder_id, title, source_kind, source_file_name, source_text, detection, tasks, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [folder, itemTitle, sourceKind === 'docx' ? 'docx' : 'paste', sourceFileName || null, text,
      JSON.stringify({ summary: summarize(finalSegments), warnings: detection.warnings, confidence: detection.confidence }),
      JSON.stringify(normalizeTasks(tasks, finalSegments)), userId]);
    await insertSegments(client, item.id, finalSegments);
    return getItem(item.id, client);
  });
}

function summarize(segments) {
  const numbers = segments.flatMap(segment => segment.questions.map(question => question.number));
  return {
    passageCount: segments.filter(segment => segment.kind === 'passage').length,
    questionCount: numbers.length,
    questionRange: numbers.length ? { from: Math.min(...numbers), to: Math.max(...numbers) } : null,
  };
}

async function insertSegments(client, itemId, segments) {
  for (const segment of segments) {
    const { rows: [row] } = await client.query(
      'INSERT INTO cs_segments (item_id, kind, position, text, meta) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [itemId, segment.kind, segment.position, segment.text, JSON.stringify(segment.meta)]);
    for (const question of segment.questions) {
      await client.query(
        'INSERT INTO cs_questions (segment_id, number, stem, options, answer_key) VALUES ($1, $2, $3, $4, $5)',
        [row.id, question.number, question.stem, JSON.stringify(question.options), question.answerKey]);
    }
  }
}

// ---------- stale detection (generated content vs. edited source) ----------
const { passageHash, questionHash, norm: normText } = require('./sourceHash');

function passageForSet(segments, setSegment) {
  const passages = segments.filter(segment => segment.kind === 'passage');
  return passages.find(segment => segment.position === setSegment?.meta?.passageIndex) || passages[0];
}

// An artifact is stale when it was built from a source fingerprint that no longer matches.
// Artifacts generated before fingerprints existed (sourceHash null) are never flagged.
function markStale(segments, questions, artifacts) {
  for (const artifact of artifacts) {
    let current = null;
    if (artifact.type === 'question_pack') {
      const question = questions.find(row => row.id === artifact.questionId);
      const setSegment = segments.find(segment => segment.id === question?.segmentId);
      if (question) current = questionHash(passageForSet(segments, setSegment)?.text || '', question);
    } else {
      const segment = segments.find(row => row.id === artifact.segmentId);
      if (segment) current = passageHash(segment.text);
    }
    artifact.stale = Boolean(artifact.sourceHash && current && artifact.sourceHash !== current && artifact.content);
    delete artifact.sourceHash;
  }
}

// Dictionary works per sentence: stale when stored sentences differ from the passage's current sentences.
function dictionarySentencesStale(segments, dictSentences) {
  if (!dictSentences.length) return 0;
  const stored = new Set(dictSentences.map(row => `${row.segmentId}|${normText(row.text)}`));
  const current = segments.filter(segment => segment.kind === 'passage')
    .flatMap(segment => splitSentences(segment.text).map(text => `${segment.id}|${normText(text)}`));
  const currentSet = new Set(current);
  return current.filter(key => !stored.has(key)).length + [...stored].filter(key => !currentSet.has(key)).length;
}

function staleSummary(artifacts, dictionaryStale) {
  const count = type => artifacts.filter(artifact => artifact.type === type && artifact.stale).length;
  return [
    { part: 'vocab', count: count('vocab') },
    { part: 'translation', count: count('passage_translation') },
    { part: 'dictionary', count: dictionaryStale },
    { part: 'questions', count: count('question_pack') },
  ].filter(part => part.count > 0);
}

async function getItem(id, client = db) {
  requireId(id);
  const { rows: [item] } = await client.query(`
    SELECT i.id, i.folder_id AS "folderId", i.title, ${ITEM_STATUS_SQL} AS status, i.source_kind AS "sourceKind", i.source_file_name AS "sourceFileName",
           i.source_text AS "sourceText", i.detection, i.tasks, i.created_at AS "createdAt", i.updated_at AS "updatedAt"
    FROM cs_items i WHERE i.id = $1`, [id]);
  if (!item) throw new HttpError('Không tìm thấy học liệu.', 404, 'ITEM_NOT_FOUND');
  const { rows: segments } = await client.query(
    'SELECT id, kind, position, text, meta FROM cs_segments WHERE item_id = $1 ORDER BY position', [id]);
  const { rows: questions } = await client.query(`
    SELECT q.id, q.segment_id AS "segmentId", q.number, q.stem, q.options, q.answer_key AS "answerKey"
    FROM cs_questions q JOIN cs_segments s ON s.id = q.segment_id WHERE s.item_id = $1 ORDER BY q.number`, [id]);
  const { rows: artifacts } = await client.query(`
    SELECT id, segment_id AS "segmentId", question_id AS "questionId", type, status, content, validation, source, provider, error, attempts,
           source_hash AS "sourceHash", updated_at AS "updatedAt"
    FROM cs_artifacts WHERE item_id = $1`, [id]);
  markStale(segments, questions, artifacts);
  const { rows: dictSentences } = await client.query('SELECT segment_id AS "segmentId", text FROM cs_dict_sentences WHERE item_id = $1', [id]);
  const dictionaryStale = dictionarySentencesStale(segments, dictSentences);
  const { rows: [dictionary] } = await client.query(`SELECT ${summaryService.DICTIONARY_STATUS_SQL} AS status FROM cs_items i WHERE i.id = $1`, [id]);
  const { rows: path } = await client.query(`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, name, 0 AS depth FROM cs_folders WHERE id = $1
      UNION ALL SELECT f.id, f.parent_id, f.name, c.depth + 1 FROM cs_folders f JOIN chain c ON f.id = c.parent_id WHERE c.depth < 20
    ) SELECT id, name FROM chain ORDER BY depth DESC`, [item.folderId]);
  const taskStatus = summaryService.deriveTaskStatus(item.tasks, artifacts, { dictionaryStatus: dictionary?.status });
  const staleParts = staleSummary(artifacts, dictionaryStale);
  return { ...item, taskStatus, staleParts, folderPath: path, artifacts, segments: segments.map(segment => ({ ...segment, questions: questions.filter(question => question.segmentId === segment.id) })) };
}

async function updateItem(id, { title, folderId }) {
  requireId(id);
  const sets = [];
  const params = [id];
  if (title !== undefined) { params.push(requireName(title, 240, 'Tên học liệu')); sets.push(`title = $${params.length}`); }
  if (folderId !== undefined) { params.push(optionalFolderId(folderId)); sets.push(`folder_id = $${params.length}`); }
  if (!sets.length) return getItem(id);
  const { rowCount } = await db.query(`UPDATE cs_items SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, params);
  if (!rowCount) throw new HttpError('Không tìm thấy học liệu.', 404, 'ITEM_NOT_FOUND');
  return getItem(id);
}

// Edit the original passage text and questions without re-importing the item.
async function updateContent(id, { segments = [], questions = [] } = {}) {
  requireId(id);
  return db.transaction(async client => {
    const { rowCount } = await client.query('SELECT 1 FROM cs_items WHERE id = $1 FOR UPDATE', [id]);
    if (!rowCount) throw new HttpError('Không tìm thấy học liệu.', 404, 'ITEM_NOT_FOUND');
    for (const segment of segments) {
      requireId(segment.id, 'segmentId');
      const text = String(segment.text || '').trim();
      if (!text) throw new HttpError('Đoạn văn không được để trống.', 400, 'VALIDATION_ERROR');
      const result = await client.query(`
        UPDATE cs_segments SET text = $3, meta = meta || jsonb_build_object('sentenceCount', $4::int)
        WHERE id = $1 AND item_id = $2 AND kind = 'passage'`, [segment.id, id, text, countSentences(text)]);
      if (!result.rowCount) throw new HttpError('Đoạn văn không thuộc học liệu này.', 400, 'INVALID_SEGMENT');
    }
    for (const question of questions) {
      requireId(question.id, 'questionId');
      const [normalized] = normalizeSegments([{ kind: 'question_set', questions: [{ ...question, number: question.number || 1 }] }])[0].questions;
      if (!normalized.stem) throw new HttpError('Câu hỏi không được để trống.', 400, 'VALIDATION_ERROR');
      const result = await client.query(`
        UPDATE cs_questions q SET stem = $3, options = $4, answer_key = $5
        FROM cs_segments s WHERE q.id = $1 AND s.id = q.segment_id AND s.item_id = $2`,
      [question.id, id, normalized.stem, JSON.stringify(normalized.options), normalized.answerKey]);
      if (!result.rowCount) throw new HttpError('Câu hỏi không thuộc học liệu này.', 400, 'INVALID_QUESTION');
    }
    await client.query('UPDATE cs_items SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    return getItem(id, client);
  });
}

async function deleteItem(id) {
  requireId(id);
  const { rowCount } = await db.query('DELETE FROM cs_items WHERE id = $1', [id]);
  if (!rowCount) throw new HttpError('Không tìm thấy học liệu.', 404, 'ITEM_NOT_FOUND');
  return { id };
}

module.exports = {
  listFolders, createFolder, updateFolder, deleteFolder,
  detect, listItems, createItem, getItem, updateItem, updateContent, deleteItem, normalizeSegments, normalizeTasks, TASKS,
  markStale, dictionarySentencesStale, staleSummary,
  folderSummary: summaryService.folderSummary, recentItems: summaryService.recentItems, attention: summaryService.attention,
};
