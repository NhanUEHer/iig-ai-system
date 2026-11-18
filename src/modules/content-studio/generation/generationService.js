'use strict';
const db = require('../../../config/db');
const HttpError = require('../../../http/httpError');
const { splitSentences } = require('../detect/detectContent');
const { validate } = require('./validators');
const { artifactHash } = require('../sourceHash');
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
async function loadContext(client, artifact) {
  const { rows: segments } = await client.query('SELECT id, kind, position, text, meta FROM cs_segments WHERE item_id = $1 ORDER BY position', [artifact.item_id]);
  if (artifact.type === 'question_pack') {
    const { rows: [question] } = await client.query(
      'SELECT id, segment_id, number, stem, options, answer_key AS "answerKey" FROM cs_questions WHERE id = $1', [artifact.question_id]);
    if (!question) throw new Error('Question no longer exists');
    const set = segments.find(segment => segment.id === question.segment_id);
    const passageIndex = set?.meta?.passageIndex;
    const passageSegment = segments.find(segment => segment.kind === 'passage' && segment.position === passageIndex) || segments.find(segment => segment.kind === 'passage');
    const passage = passageSegment?.text || '';
    // The whole set goes to AI in one call; a Vietnamese passage helps when it already exists.
    const { rows: setQuestions } = await client.query(
      'SELECT id, number, stem, options, answer_key AS "answerKey" FROM cs_questions WHERE segment_id = $1 ORDER BY number', [question.segment_id]);
    const { rows: [translation] } = passageSegment ? await client.query(
      `SELECT content FROM cs_artifacts WHERE segment_id = $1 AND type = 'passage_translation' AND status IN ('ready','needs_review')`,
      [passageSegment.id]) : { rows: [] };
    const passageVi = (translation?.content?.sentences || []).map(row => row?.vi).filter(Boolean).join(' ');
    return { itemId: artifact.item_id, question, setId: question.segment_id, setQuestions, passage, passageVi, sentences: splitSentences(passage) };
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
  const { rows: [artifact] } = await db.query(`
    UPDATE cs_artifacts SET status = 'queued', attempts = 0, error = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status NOT IN ('queued','generating') RETURNING item_id`, [artifactId]);
  if (!artifact) throw new HttpError('Không thể tạo lại nội dung này lúc này.', 409, 'ARTIFACT_BUSY');
  await db.transaction(client => refreshItemStatus(client, artifact.item_id));
  kickWorker();
  return { id: artifactId };
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
      SELECT id FROM cs_artifacts
      WHERE status = 'queued' OR (status = 'generating' AND locked_at < CURRENT_TIMESTAMP - INTERVAL '${STALE_LOCK_MINUTES} minutes')
      ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *`);
  return artifact || null;
}

async function processArtifact(artifact) {
  const selected = provider();
  try {
    const context = await loadContext(db, artifact);
    const content = await selected.generate(artifact.type, context);
    const validation = validate(artifact.type, content, context);
    await db.transaction(async client => {
      await client.query(`
        UPDATE cs_artifacts SET content = $2, validation = $3, status = $4, source = 'ai', provider = $5, error = NULL, locked_at = NULL,
          source_hash = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`, [artifact.id, JSON.stringify(content), JSON.stringify(validation), validation.issues.length ? 'needs_review' : 'ready', selected.name, artifactHash(artifact.type, context)]);
      await client.query(`INSERT INTO cs_artifact_versions (artifact_id, content, validation, source, provider) VALUES ($1, $2, $3, 'ai', $4)`,
        [artifact.id, JSON.stringify(content), JSON.stringify(validation), selected.name]);
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
    processArtifact(artifact).finally(() => { active -= 1; pump(); });
  }
}

function kickWorker() { if (timer) pump(); }

function startWorker() {
  if (timer) return;
  timer = setInterval(pump, 3000);
  timer.unref?.();
  pump();
}

function stopWorker() { if (timer) clearInterval(timer); timer = null; }

module.exports = { enqueue, regenerate, saveEdit, startWorker, stopWorker, loadContext };
