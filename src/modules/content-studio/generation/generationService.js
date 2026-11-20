'use strict';
const db = require('../../../config/db');
const HttpError = require('../../../http/httpError');
const { splitSentences } = require('../detect/detectContent');
const { validate } = require('./validators');
const { artifactHash } = require('../sourceHash');
const LETTERS = ['A', 'B', 'C', 'D'];
const mockProvider = require('./mockProvider');
const aiCoreProvider = require('./aiCoreProvider');
const dictionary = require('../dictionary/dictionaryService');

const PROVIDERS = { mock: mockProvider, 'ai-core': aiCoreProvider };
const MAX_ATTEMPTS = 3;
const STALE_LOCK_MINUTES = 10;
const PASSAGE_TYPES = { translation: 'passage_translation', vocab: 'vocab' };
const PASSAGE_TASKS = [...Object.keys(PASSAGE_TYPES), 'dictionary'];
const QUESTION_TASKS = ['translation', 'hint', 'explanation', 'note'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function provider() {
  const name = process.env.CONTENT_STUDIO_PROVIDER || 'mock';
  const selected = PROVIDERS[name];
  if (!selected) throw new Error(`Unknown CONTENT_STUDIO_PROVIDER "${name}"`);
  return selected;
}

const requireId = (value, label) => {
  if (!UUID.test(String(value || ''))) throw new HttpError(`${label} không hợp lệ.`, 400, 'INVALID_ID');
  return value;
};

// Everything a provider or validator needs for one artifact, loaded fresh from the database.
const questionText = question => [`${question.number}. ${question.stem || ''}`.trim(),
  ...LETTERS.filter(letter => question.options?.[letter]).map(letter => `(${letter}) ${question.options[letter]}`)].join('\n');

// The questions an image belongs to: its own question (Part 1 photo), its set (Part 3/4 graphic),
// or every question of the item when it was left unattached.
async function imageContext(client, artifact) {
  const { rows: [image] } = await client.query(`
    SELECT id, segment_id, question_id, storage_key AS "storedKey", mime, sha256 FROM cs_item_images WHERE id = $1`, [artifact.image_id]);
  if (!image) throw new Error('Image no longer exists');
  const { rows: questions } = await client.query(`
    SELECT q.id, q.segment_id, q.number, q.stem, q.options FROM cs_questions q JOIN cs_segments s ON s.id = q.segment_id
    WHERE s.item_id = $1 ORDER BY q.number`, [artifact.item_id]);
  const related = image.question_id ? questions.filter(question => question.id === image.question_id)
    : image.segment_id ? questions.filter(question => question.segment_id === image.segment_id) : questions;
  return { itemId: artifact.item_id, image, contextText: related.map(questionText).join('\n\n').slice(0, 6000) };
}

// Descriptions of every image that belongs to this question's set, labelled for the question_pack prompt.
async function imageDescriptionsForSet(client, itemId, segmentId) {
  const { rows } = await client.query(`
    SELECT im.position, q.number, a.content FROM cs_item_images im
    JOIN cs_artifacts a ON a.image_id = im.id AND a.type = 'image_description' AND a.status IN ('ready','needs_review') AND a.content IS NOT NULL
    LEFT JOIN cs_questions q ON q.id = im.question_id
    WHERE im.item_id = $1 AND (im.segment_id = $2 OR im.segment_id IS NULL) ORDER BY im.position`, [itemId, segmentId]);
  return rows.map((row, index) => {
    const label = row.number ? `[Image for question ${row.number}]` : `[Image ${index + 1} for this question set]`;
    const type = row.content?.imageType ? ` (${row.content.imageType})` : '';
    return `${label}${type}\n${String(row.content?.description || '').trim()}`;
  }).filter(text => text.trim()).join('\n\n');
}

async function loadContext(client, artifact) {
  if (artifact.type === 'image_description') return imageContext(client, artifact);
  const { rows: segments } = await client.query('SELECT id, kind, position, text, meta FROM cs_segments WHERE item_id = $1 ORDER BY position', [artifact.item_id]);
  if (artifact.type === 'question_pack') {
    const { rows: [question] } = await client.query(
      'SELECT id, segment_id, number, stem, options, answer_key AS "answerKey" FROM cs_questions WHERE id = $1', [artifact.question_id]);
    if (!question) throw new Error('Question no longer exists');
    const set = segments.find(segment => segment.id === question.segment_id);
    const passageIndex = set?.meta?.passageIndex;
    // A question-only set (Part 1/2/5) has passageIndex null: it must not borrow another set's passage.
    const questionOnly = set?.meta?.questionOnly === true || (set?.meta && Object.hasOwn(set.meta, 'passageIndex') && set.meta.passageIndex === null);
    const passageSegment = questionOnly ? null
      : segments.find(segment => segment.kind === 'passage' && segment.position === passageIndex) || segments.find(segment => segment.kind === 'passage');
    const passage = passageSegment?.text || '';
    // The whole set goes to AI in one call; a Vietnamese passage helps when it already exists.
    const { rows: setQuestions } = await client.query(
      'SELECT id, number, stem, options, answer_key AS "answerKey" FROM cs_questions WHERE segment_id = $1 ORDER BY number', [question.segment_id]);
    const { rows: [translation] } = passageSegment ? await client.query(
      `SELECT content FROM cs_artifacts WHERE segment_id = $1 AND type = 'passage_translation' AND status IN ('ready','needs_review')`,
      [passageSegment.id]) : { rows: [] };
    const passageVi = (translation?.content?.sentences || []).map(row => row?.vi).filter(Boolean).join(' ');
    const imageDescription = await imageDescriptionsForSet(client, artifact.item_id, question.segment_id);
    return { itemId: artifact.item_id, question, setId: question.segment_id, setQuestions, passage, passageVi, imageDescription, sentences: splitSentences(passage) };
  }
  const segment = segments.find(row => row.id === artifact.segment_id);
  if (!segment) throw new Error('Segment no longer exists');
  const context = { itemId: artifact.item_id, passage: segment.text, sentences: splitSentences(segment.text) };
  if (artifact.type === 'vocab') {
    const { rows: [item] } = await client.query('SELECT tasks FROM cs_items WHERE id = $1', [artifact.item_id]);
    context.level = item?.tasks?.vocab?.level;
    context.mode = item?.tasks?.vocab?.mode;
  }
  return context;
}

async function refreshItemStatus(client, itemId) {
  await client.query(`
    UPDATE cs_items SET status = COALESCE((
      SELECT CASE
        WHEN bool_or(status IN ('queued','generating')) THEN 'generating'
        WHEN bool_or(status = 'failed') THEN 'failed'
        WHEN bool_or(status = 'needs_review') THEN 'needs_review'
        ELSE 'ready' END
      FROM cs_artifacts WHERE item_id = $1), 'draft'), updated_at = CURRENT_TIMESTAMP
    WHERE id = $1`, [itemId]);
}

async function upsertQueued(client, itemId, { segmentId = null, questionId = null, type }) {
  const targetKey = questionId ? `q:${questionId}` : `s:${segmentId}`;
  await client.query(`
    INSERT INTO cs_artifacts (item_id, segment_id, question_id, target_key, type, status)
    VALUES ($1, $2, $3, $4, $5, 'queued')
    ON CONFLICT (item_id, target_key, type) DO UPDATE
      SET status = 'queued', attempts = 0, error = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP`,
  [itemId, segmentId, questionId, targetKey, type]);
}

async function enqueue(itemId, tasks) {
  requireId(itemId, 'id');
  return db.transaction(async client => {
    const { rows: [item] } = await client.query('SELECT id, tasks FROM cs_items WHERE id = $1 FOR UPDATE', [itemId]);
    if (!item) throw new HttpError('Không tìm thấy học liệu.', 404, 'ITEM_NOT_FOUND');
    // Items saved before task selection existed have no task groups: default to everything.
    const defaults = { passage: PASSAGE_TASKS, question: QUESTION_TASKS };
    const requested = tasks || {
      passage: item.tasks?.passage ?? defaults.passage,
      question: item.tasks?.question ?? defaults.question,
    };
    const requestedPassageTasks = (requested.passage || []).filter(task => PASSAGE_TASKS.includes(task));
    const passageTasks = requestedPassageTasks.filter(task => PASSAGE_TYPES[task]);
    const wantsDictionary = requestedPassageTasks.includes('dictionary');
    const wantsQuestions = (requested.question || []).some(task => QUESTION_TASKS.includes(task));
    const { rows: segments } = await client.query('SELECT id, kind FROM cs_segments WHERE item_id = $1', [itemId]);
    let count = 0;
    for (const segment of segments.filter(row => row.kind === 'passage')) {
      for (const task of passageTasks) { await upsertQueued(client, itemId, { segmentId: segment.id, type: PASSAGE_TYPES[task] }); count += 1; }
    }
    if (wantsDictionary && segments.some(row => row.kind === 'passage')) count += 1;
    if (wantsQuestions) {
      const { rows: questions } = await client.query(
        'SELECT q.id, q.segment_id FROM cs_questions q JOIN cs_segments s ON s.id = q.segment_id WHERE s.item_id = $1', [itemId]);
      for (const question of questions) { await upsertQueued(client, itemId, { segmentId: question.segment_id, questionId: question.id, type: 'question_pack' }); count += 1; }
      // Images are described once (background job, before the question packs that read them);
      // a finished description is kept — only "Tạo lại" asks the AI again.
      const { rows: images } = await client.query('SELECT id FROM cs_item_images WHERE item_id = $1', [itemId]);
      for (const image of images) {
        const { rowCount } = await client.query(`
          INSERT INTO cs_artifacts (item_id, image_id, target_key, type, status) VALUES ($1, $2, $3, 'image_description', 'queued')
          ON CONFLICT (item_id, target_key, type) DO UPDATE
            SET status = 'queued', attempts = 0, error = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE cs_artifacts.status = 'failed'`, [itemId, image.id, `img:${image.id}`]);
        count += rowCount;
      }
    }
    if (!count) throw new HttpError('Chưa chọn nội dung nào để tạo.', 400, 'NO_TASKS');
    if (tasks) {
      // Partial runs (one tab, one group) add to the item's task list instead of replacing it.
      const merge = (group, list) => [...new Set([...(item.tasks?.[group] || []), ...list])];
      await client.query('UPDATE cs_items SET tasks = $2 WHERE id = $1', [itemId, JSON.stringify({
        passage: merge('passage', requestedPassageTasks), question: merge('question', (requested.question || []).filter(task => QUESTION_TASKS.includes(task))),
        vocab: requested.vocab || item.tasks?.vocab || { level: 650, mode: 'balanced' },
      })]);
    }
    await refreshItemStatus(client, itemId);
    return { queued: count, wantsDictionary };
  }).then(async result => {
    if (result.wantsDictionary) await dictionary.extract(itemId);
    kickWorker();
    return { queued: result.queued };
  });
}

async function regenerate(artifactId) {
  requireId(artifactId, 'id');
  const { rows: [current] } = await db.query('SELECT * FROM cs_artifacts WHERE id = $1', [artifactId]);
  if (!current) throw new HttpError('Không tìm thấy nội dung.', 404, 'ARTIFACT_NOT_FOUND');
  if (current.type === 'question_pack') {
    return regenerateQuestion(current);
  }
  const { rows: [artifact] } = await db.query(`
    UPDATE cs_artifacts SET status = 'queued', attempts = 0, error = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status NOT IN ('queued','generating') RETURNING item_id`, [artifactId]);
  if (!artifact) throw new HttpError('Không thể tạo lại nội dung này lúc này.', 409, 'ARTIFACT_BUSY');
  await db.transaction(client => refreshItemStatus(client, artifact.item_id));
  kickWorker();
  return { id: artifactId };
}

async function claimSingle(artifactId, expectedType) {
  const { rows: [artifact] } = await db.query(`
    UPDATE cs_artifacts SET status = 'generating', error = NULL, locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND type = $2 AND status NOT IN ('queued','generating') RETURNING *`, [artifactId, expectedType]);
  if (artifact) return artifact;
  const { rows: [existing] } = await db.query('SELECT type, status FROM cs_artifacts WHERE id = $1', [artifactId]);
  if (!existing) throw new HttpError('Không tìm thấy nội dung.', 404, 'ARTIFACT_NOT_FOUND');
  if (existing.type !== expectedType) throw new HttpError('Loại nội dung không hợp lệ.', 400, 'INVALID_ARTIFACT_TYPE');
  throw new HttpError('Nội dung đang được tạo, hãy chờ hoàn tất.', 409, 'ARTIFACT_BUSY');
}

async function finishSingle(artifact, content, context, providerName = aiCoreProvider.name) {
  const validation = validate(artifact.type, content, context);
  const status = validation.issues.length ? 'needs_review' : 'ready';
  await db.transaction(async client => {
    await client.query(`
      UPDATE cs_artifacts SET content = $2, validation = $3, status = $4, source = 'ai', provider = $5,
        error = NULL, locked_at = NULL, source_hash = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [artifact.id, JSON.stringify(content), JSON.stringify(validation), status, providerName, artifactHash(artifact.type, context)]);
    await client.query(`INSERT INTO cs_artifact_versions (artifact_id, content, validation, source, provider) VALUES ($1, $2, $3, 'ai', $4)`,
      [artifact.id, JSON.stringify(content), JSON.stringify(validation), providerName]);
    await refreshItemStatus(client, artifact.item_id);
  });
  return { id: artifact.id, status, validation, content };
}

async function failSingle(artifact, error) {
  await db.query(`UPDATE cs_artifacts SET status = $2, error = $3, locked_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [artifact.id, artifact.content ? (artifact.validation?.issues?.length ? 'needs_review' : 'ready') : 'failed', String(error.message || error).slice(0, 500)]);
  await db.transaction(client => refreshItemStatus(client, artifact.item_id));
}

async function fillVocab(artifactId, index) {
  requireId(artifactId, 'id');
  if (!Number.isInteger(index) || index < 0) throw new HttpError('Vị trí từ vựng không hợp lệ.', 400, 'INVALID_INDEX');
  const artifact = await claimSingle(artifactId, 'vocab');
  try {
    const context = await loadContext(db, artifact);
    const items = Array.isArray(artifact.content?.items) ? artifact.content.items : [];
    const item = items[index];
    if (!item) throw new HttpError('Không tìm thấy dòng từ vựng.', 404, 'VOCAB_ITEM_NOT_FOUND');
    const word = String(item.inText || item.lemma || '').trim();
    if (!word) throw new HttpError('Hãy nhập từ trong bài trước khi dùng AI điền.', 400, 'VOCAB_WORD_REQUIRED');
    if (!context.passage.toLocaleLowerCase().includes(word.toLocaleLowerCase())) {
      throw new HttpError(`Không tìm thấy “${word}” trong đoạn văn.`, 400, 'VOCAB_WORD_NOT_IN_PASSAGE');
    }
    const filled = await aiCoreProvider.fillVocabItem({ passage: context.passage, word, itemId: context.itemId });
    const content = { ...artifact.content, items: items.map((value, itemIndex) => itemIndex === index ? { ...value, ...filled } : value) };
    return await finishSingle(artifact, content, context);
  } catch (error) {
    await failSingle(artifact, error);
    throw error;
  }
}

async function regenerateTranslationSentence(artifactId, index) {
  requireId(artifactId, 'id');
  if (!Number.isInteger(index) || index < 0) throw new HttpError('Vị trí câu dịch không hợp lệ.', 400, 'INVALID_INDEX');
  const artifact = await claimSingle(artifactId, 'passage_translation');
  try {
    const context = await loadContext(db, artifact);
    const rows = Array.isArray(artifact.content?.sentences) ? artifact.content.sentences : [];
    if (!rows[index] || !context.sentences[index]) throw new HttpError('Không tìm thấy câu dịch.', 404, 'TRANSLATION_SENTENCE_NOT_FOUND');
    const generated = await aiCoreProvider.generate('passage_translation', { ...context, sentences: [context.sentences[index]] });
    const vi = generated.sentences?.[0]?.vi || '';
    const content = { ...artifact.content, sentences: rows.map((row, rowIndex) => rowIndex === index ? { ...row, en: context.sentences[index], vi } : row) };
    return await finishSingle(artifact, content, context);
  } catch (error) {
    await failSingle(artifact, error);
    throw error;
  }
}

async function regenerateQuestion(knownArtifact) {
  const artifact = await claimSingle(knownArtifact.id, 'question_pack');
  try {
    const context = await loadContext(db, artifact);
    const singleContext = { ...context, setQuestions: [context.question], bypassSetCache: true };
    const content = await aiCoreProvider.generate('question_pack', singleContext);
    return await finishSingle(artifact, content, context);
  } catch (error) {
    await failSingle(artifact, error);
    throw error;
  }
}

// Editors keep empty items while typing comma lists; drop them before storing.
function cleanDictionaryLists(content) {
  const clean = list => (Array.isArray(list) ? list.map(value => String(value).trim()).filter(Boolean) : []);
  return { ...content, sentences: (content.sentences || []).map(sentence => ({
    ...sentence,
    entries: (sentence.entries || []).map(entry => ({ ...entry, synonyms: clean(entry.synonyms), collocations: clean(entry.collocations), wordFamily: clean(entry.wordFamily) })),
  })) };
}

async function saveEdit(artifactId, content, userId) {
  requireId(artifactId, 'id');
  if (!content || typeof content !== 'object') throw new HttpError('Nội dung không hợp lệ.', 400, 'INVALID_CONTENT');
  return db.transaction(async client => {
    const { rows: [artifact] } = await client.query('SELECT * FROM cs_artifacts WHERE id = $1 FOR UPDATE', [artifactId]);
    if (!artifact) throw new HttpError('Không tìm thấy nội dung.', 404, 'ARTIFACT_NOT_FOUND');
    if (['queued', 'generating'].includes(artifact.status)) throw new HttpError('Nội dung đang được tạo, hãy chờ xong rồi sửa.', 409, 'ARTIFACT_BUSY');
    if (artifact.type === 'dictionary') content = cleanDictionaryLists(content);
    const context = await loadContext(client, artifact);
    const validation = validate(artifact.type, content, context);
    const status = validation.issues.length ? 'needs_review' : 'ready';
    // A human save confirms the content against the current source.
    await client.query(`
      UPDATE cs_artifacts SET content = $2, validation = $3, status = $4, source = 'human', error = NULL, source_hash = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [artifactId, JSON.stringify(content), JSON.stringify(validation), status, artifactHash(artifact.type, context)]);
    await client.query(`INSERT INTO cs_artifact_versions (artifact_id, content, validation, source, created_by) VALUES ($1, $2, $3, 'human', $4)`,
      [artifactId, JSON.stringify(content), JSON.stringify(validation), userId]);
    await refreshItemStatus(client, artifact.item_id);
    return { id: artifactId, status, validation, content };
  });
}

// ---------- worker ----------
async function claimNext() {
  const { rows: [artifact] } = await db.query(`
    UPDATE cs_artifacts SET status = 'generating', locked_at = CURRENT_TIMESTAMP, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = (
      SELECT a.id FROM cs_artifacts a
      WHERE (a.status = 'queued' OR (a.status = 'generating' AND a.locked_at < CURRENT_TIMESTAMP - INTERVAL '${STALE_LOCK_MINUTES} minutes'))
        -- A question pack waits until the images of its set are described (failed ones do not block).
        AND NOT (a.type = 'question_pack' AND EXISTS (
          SELECT 1 FROM cs_artifacts d
          JOIN cs_item_images im ON im.id = d.image_id
          JOIN cs_questions q ON q.id = a.question_id
          WHERE d.item_id = a.item_id AND d.type = 'image_description' AND d.status IN ('queued','generating')
            AND (im.segment_id = q.segment_id OR im.segment_id IS NULL)))
      ORDER BY (a.type = 'image_description') DESC, a.updated_at FOR UPDATE OF a SKIP LOCKED LIMIT 1)
    RETURNING *`);
  return artifact || null;
}

// Same image bytes + same question context described before (any item) → reuse, no AI call.
// Skipped when this artifact already has content: that means "Tạo lại", which must ask the AI again.
async function reusableImageDescription(artifact, context) {
  if (artifact.type !== 'image_description' || artifact.content) return null;
  const { rows: [hit] } = await db.query(`
    SELECT content FROM cs_artifacts
    WHERE type = 'image_description' AND source_hash = $1 AND id <> $2 AND content IS NOT NULL AND status IN ('ready','needs_review')
    ORDER BY updated_at DESC LIMIT 1`, [artifactHash(artifact.type, context), artifact.id]);
  return hit?.content || null;
}

async function processArtifact(artifact) {
  const selected = provider();
  try {
    const context = await loadContext(db, artifact);
    const cached = await reusableImageDescription(artifact, context);
    const content = cached || await selected.generate(artifact.type, context);
    const providerName = cached ? 'cache' : selected.name;
    const validation = validate(artifact.type, content, context);
    await db.transaction(async client => {
      await client.query(`
        UPDATE cs_artifacts SET content = $2, validation = $3, status = $4, source = 'ai', provider = $5, error = NULL, locked_at = NULL,
          source_hash = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`, [artifact.id, JSON.stringify(content), JSON.stringify(validation), validation.issues.length ? 'needs_review' : 'ready', providerName, artifactHash(artifact.type, context)]);
      await client.query(`INSERT INTO cs_artifact_versions (artifact_id, content, validation, source, provider) VALUES ($1, $2, $3, 'ai', $4)`,
        [artifact.id, JSON.stringify(content), JSON.stringify(validation), providerName]);
      await refreshItemStatus(client, artifact.item_id);
    });
  } catch (error) {
    // AI Core refusals (ceiling, budget, config, auth, input size) will not succeed on retry.
    const failed = artifact.attempts >= MAX_ATTEMPTS || (error.code && error.retryable === false);
    await db.query(`UPDATE cs_artifacts SET status = $2, error = $3, locked_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [artifact.id, failed ? 'failed' : 'queued', String(error.code ? `${error.code}: ${error.message}` : error.message || error).slice(0, 500)]);
    await db.transaction(client => refreshItemStatus(client, artifact.item_id));
    console.error('[ContentStudioWorker]', artifact.id, error.message);
  }
}

const CONCURRENCY = Math.max(1, Number(process.env.CONTENT_STUDIO_CONCURRENCY || 4));
let timer = null;
let active = 0;

async function pump() {
  while (active < CONCURRENCY) {
    const artifact = await claimNext().catch(error => { console.error('[ContentStudioWorker] claim failed', error.message); return null; });
    if (!artifact) return;
    active += 1;
    // A DB hiccup inside the failure path must never become an unhandled rejection (it would kill the API).
    processArtifact(artifact)
      .catch(error => console.error('[ContentStudioWorker] job failed', artifact.id, error.message))
      .finally(() => { active -= 1; pump().catch(error => console.error('[ContentStudioWorker] pump failed', error.message)); });
  }
}

function kickWorker() { if (timer) pump().catch(error => console.error('[ContentStudioWorker] pump failed', error.message)); }

function startWorker() {
  if (timer) return;
  timer = setInterval(() => { pump().catch(error => console.error('[ContentStudioWorker] pump failed', error.message)); }, 3000);
  timer.unref?.();
  pump();
}

function stopWorker() { if (timer) clearInterval(timer); timer = null; }

module.exports = { enqueue, regenerate, fillVocab, regenerateTranslationSentence, saveEdit, startWorker, stopWorker, loadContext };
