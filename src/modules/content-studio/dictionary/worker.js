'use strict';

const db = require('../../../config/db');
const mockProvider = require('../generation/mockProvider');
const difyProvider = require('../generation/difyProvider');
const { mapDictionaryEntries, normalizeExtract, sameSentence, validateEntry } = require('./normalize');

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 150000;
const STALE_MS = TIMEOUT_MS + 30000;
const CONCURRENCY = Math.max(1, Math.min(20, Number(process.env.CONTENT_STUDIO_DICTIONARY_CONCURRENCY || 4)));
const PROVIDERS = { mock: mockProvider, dify: difyProvider };

function provider() {
  const name = process.env.CONTENT_STUDIO_PROVIDER || 'mock';
  const selected = PROVIDERS[name];
  if (!selected) throw new Error(`Unknown CONTENT_STUDIO_PROVIDER "${name}"`);
  return selected;
}

async function claimExtract() {
  return db.transaction(async client => {
    const { rows: [item] } = await client.query(`SELECT i.id FROM cs_items i
      WHERE EXISTS (SELECT 1 FROM cs_dict_sentences s WHERE s.item_id = i.id AND s.status = 'queued')
        AND NOT EXISTS (SELECT 1 FROM cs_dict_candidates c WHERE c.item_id = i.id)
      ORDER BY i.updated_at FOR UPDATE OF i SKIP LOCKED LIMIT 1`);
    if (!item) return null;
    const { rows: sentences } = await client.query(`UPDATE cs_dict_sentences SET status = 'generating', updated_at = CURRENT_TIMESTAMP
      WHERE item_id = $1 AND status = 'queued' RETURNING id, item_id, segment_id, position, text`, [item.id]);
    return { itemId: item.id, sentences: sentences.sort((a, b) => a.position - b.position) };
  });
}

async function processExtract(job) {
  const selected = provider();
  const passage = job.sentences.map(sentence => sentence.text).join(' ');
  try {
    const raw = await selected.generate('dictionary_extract', { passage, sentences: job.sentences.map(sentence => sentence.text) });
    const extracted = normalizeExtract(raw, passage);
    await db.transaction(async client => {
      let count = 0;
      for (const row of extracted) {
        const sentence = job.sentences.find(value => sameSentence(value.text, row.sentenceText));
        if (!sentence) throw new Error('Extracted sentence does not match a stored sentence');
        for (let position = 0; position < row.items.length; position += 1) {
          const chunk = row.items[position];
          await client.query(`INSERT INTO cs_dict_candidates (item_id, sentence_id, position, chunk, status)
            VALUES ($1, $2, $3, $4, 'draft')`, [job.itemId, sentence.id, position, chunk]);
          count += 1;
        }
      }
      await client.query(`UPDATE cs_dict_sentences SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE item_id = $1`, [job.itemId]);
      await client.query('UPDATE cs_items SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [job.itemId]);
    });
  } catch (error) {
    await db.query(`UPDATE cs_dict_sentences SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE item_id = $1`, [job.itemId]);
    console.error('[ContentStudioDictionaryExtract]', job.itemId, error.message);
  }
}

async function recoverStale() {
  const { rows } = await db.transaction(async client => {
    const stale = await client.query(`UPDATE cs_dict_candidates SET status = 'failed',
      error = 'Dify không trả kết quả trong thời gian cho phép.', locked_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE status = 'generating' AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
      RETURNING id, sentence_id, attempts`, [STALE_MS]);
    for (const candidate of stale.rows) {
      await client.query(`UPDATE cs_dict_attempts SET error = COALESCE(error, 'Dify không trả kết quả trong thời gian cho phép.'),
        duration_ms = COALESCE(duration_ms, $3) WHERE candidate_id = $1 AND attempt = $2`,
      [candidate.id, candidate.attempts, STALE_MS]);
    }
    await client.query(`UPDATE cs_dict_sentences s SET status = 'failed', updated_at = CURRENT_TIMESTAMP
      WHERE s.status = 'generating' AND s.updated_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
        AND NOT EXISTS (SELECT 1 FROM cs_dict_candidates c WHERE c.item_id = s.item_id)`, [STALE_MS]);
    return stale;
  });
  for (const sentenceId of [...new Set(rows.map(row => row.sentence_id))]) await refreshSentenceStatus(db, sentenceId);
}

async function claimBatch() {
  return db.transaction(async client => {
    const { rows: [sentence] } = await client.query(`SELECT s.id, s.item_id, s.text
      FROM cs_dict_sentences s WHERE EXISTS (
        SELECT 1 FROM cs_dict_candidates c WHERE c.sentence_id = s.id AND c.status = 'queued'
          AND (c.locked_at IS NULL OR c.locked_at <= CURRENT_TIMESTAMP))
      ORDER BY s.updated_at, s.position FOR UPDATE OF s SKIP LOCKED LIMIT 1`);
    if (!sentence) return null;
    const { rows: candidates } = await client.query(`UPDATE cs_dict_candidates SET status = 'generating',
      attempts = attempts + 1, locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE sentence_id = $1 AND status = 'queued' AND (locked_at IS NULL OR locked_at <= CURRENT_TIMESTAMP)
      RETURNING id, item_id, sentence_id, position, chunk, attempts`, [sentence.id]);
    await client.query(`UPDATE cs_dict_sentences SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [sentence.id]);
    const { rows: passageRows } = await client.query(`SELECT text FROM cs_dict_sentences WHERE item_id = $1 ORDER BY position`, [sentence.item_id]);
    return {
      ...sentence,
      candidates: candidates.sort((a, b) => a.position - b.position),
      sentences: passageRows.map(row => row.text),
      passage: passageRows.map(row => row.text).join(' '),
    };
  });
}

async function callWithTimeout(selected, job) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  timeout.unref?.();
  try {
    return await selected.generate('dictionary_entries', {
      passage: job.passage,
      sentence: job.text,
      sentences: job.sentences,
      targetChunks: job.candidates.map(candidate => candidate.chunk),
    }, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function beginAttempt(client, candidate, request) {
  await client.query(`INSERT INTO cs_dict_attempts (candidate_id, attempt, request, response, error, duration_ms)
    VALUES ($1, $2, $3, NULL, NULL, NULL) ON CONFLICT (candidate_id, attempt) DO NOTHING`,
  [candidate.id, candidate.attempts, JSON.stringify(request)]);
}

async function finishAttempt(client, candidate, response, error, durationMs) {
  await client.query(`UPDATE cs_dict_attempts SET response = $3, error = $4, duration_ms = $5
    WHERE candidate_id = $1 AND attempt = $2`, [candidate.id, candidate.attempts,
    response ? JSON.stringify(response) : null, error ? String(error.message || error).slice(0, 1000) : null, durationMs]);
}

async function processBatch(job) {
  const selected = provider();
  const request = { passage: job.passage, sentence: job.text, target_chunk: JSON.stringify(job.candidates.map(candidate => candidate.chunk)) };
  const started = Date.now();
  await db.transaction(async client => {
    for (const candidate of job.candidates) await beginAttempt(client, candidate, request);
  });
  try {
    const raw = await callWithTimeout(selected, job);
    const entries = mapDictionaryEntries(raw, job.candidates.map(candidate => candidate.chunk), job.text);
    await db.transaction(async client => {
      for (let index = 0; index < job.candidates.length; index += 1) {
        const candidate = job.candidates[index];
        const checked = validateEntry(entries[index], job.text);
        const status = checked.validation.issues.length ? 'needs_review' : 'ready';
        await finishAttempt(client, candidate, raw?.dictionary_entries?.[index] || raw, null, Date.now() - started);
        await client.query(`INSERT INTO cs_dict_entries (candidate_id, content, validation, source, provider)
          VALUES ($1, $2, $3, 'ai', $4) ON CONFLICT (candidate_id) DO UPDATE SET content = EXCLUDED.content,
          validation = EXCLUDED.validation, source = 'ai', provider = EXCLUDED.provider, updated_at = CURRENT_TIMESTAMP`,
        [candidate.id, JSON.stringify(checked.content), JSON.stringify(checked.validation), selected.name]);
        await client.query(`UPDATE cs_dict_candidates SET status = $2, error = NULL, locked_at = NULL,
          updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'generating'`, [candidate.id, status]);
      }
      await refreshSentenceStatus(client, job.id);
    });
  } catch (error) {
    const timeout = error.code === 'DICTIONARY_PROVIDER_TIMEOUT' || error.name === 'AbortError' || error.code === 'ERR_CANCELED';
    await db.transaction(async client => {
      for (const candidate of job.candidates) {
        await finishAttempt(client, candidate, null, error, Date.now() - started);
        const retry = !timeout && candidate.attempts < MAX_ATTEMPTS;
        await client.query(`UPDATE cs_dict_candidates SET status = $2, error = $3,
          locked_at = CASE WHEN $2 = 'queued' THEN CURRENT_TIMESTAMP + ($4 * INTERVAL '5 seconds') ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'generating'`,
        [candidate.id, retry ? 'queued' : 'failed', String(error.message || error).slice(0, 500), candidate.attempts]);
      }
      await refreshSentenceStatus(client, job.id);
    });
    console.error('[ContentStudioDictionaryBatch]', job.id, error.message);
  }
}

async function refreshSentenceStatus(client, sentenceId) {
  await client.query(`UPDATE cs_dict_sentences s SET status = (SELECT CASE
      WHEN COUNT(*) = 0 THEN 'draft'
      WHEN bool_or(c.status = 'failed') THEN 'failed'
      WHEN bool_or(c.status IN ('queued','generating')) THEN CASE WHEN bool_or(c.status = 'generating') THEN 'generating' ELSE 'queued' END
      WHEN bool_or(c.status = 'draft') THEN 'draft'
      WHEN bool_or(c.status = 'needs_review') THEN 'needs_review'
      ELSE 'ready' END FROM cs_dict_candidates c WHERE c.sentence_id = s.id),
    updated_at = CURRENT_TIMESTAMP WHERE s.id = $1`, [sentenceId]);
}

let timer = null;
let active = 0;
let pumping = false;

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    await recoverStale();
    while (active < CONCURRENCY) {
      const extraction = await claimExtract();
      const job = extraction || await claimBatch();
      if (!job) break;
      active += 1;
      (extraction ? processExtract(job) : processBatch(job)).finally(() => {
        active -= 1;
        pump().catch(error => console.error('[ContentStudioDictionaryWorker]', error.message));
      });
    }
  } finally {
    pumping = false;
  }
}

function kickWorker() { if (timer) void pump(); }
function startWorker() {
  if (timer) return;
  timer = setInterval(() => void pump(), 1000);
  timer.unref?.();
  void pump();
}
function stopWorker() { if (timer) clearInterval(timer); timer = null; }

module.exports = { kickWorker, refreshSentenceStatus, startWorker, stopWorker };
