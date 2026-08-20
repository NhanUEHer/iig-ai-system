const db = require('../../config/db');
const HttpError = require('../../http/httpError');
const difyClient = require('../../clients/keyVocabDifyClient');
const crypto = require('crypto');

const ALLOWED_TYPES = new Set(['Noun','Verb','Adjective','Adverb','Noun Phrase','Phrasal Verb','Adjective Phrase','Idiom','Verb Phrase','Preposition','Prepositional Phrase','Prefix','Suffix','Conjunction','Interjection','Phrase']);
const TARGET_SCORES = new Set([450, 500, 650, 700, 800]);
const SELECTION_MODES = new Set(['phrase_focused', 'balanced', 'single_word_focused']);

function normalizeSettings(targetScore = 500, selectionMode = 'balanced') {
  const score = Number(targetScore);
  const mode = String(selectionMode || 'balanced');
  if (!TARGET_SCORES.has(score)) throw new HttpError('Level TOEIC không hợp lệ.', 400, 'INVALID_TARGET_SCORE');
  if (!SELECTION_MODES.has(mode)) throw new HttpError('Mode chọn từ không hợp lệ.', 400, 'INVALID_SELECTION_MODE');
  return { targetScore: score, selectionMode: mode };
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(text); } catch { throw new HttpError('AI Academy trả về JSON không hợp lệ.', 502, 'INVALID_AI_OUTPUT'); }
}

const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const appearsExactly = (passage, original) => new RegExp(
  `(?<![\\p{L}\\p{N}_])${escapePattern(original)}(?![\\p{L}\\p{N}_])`, 'u'
).test(passage);

function inferOriginalForm(passage, canonical) {
  const term = String(canonical || '').trim();
  if (!passage || !term) return '';
  const words = term.split(' ');
  const last = words.pop();
  const prefix = words.length ? `${words.join(' ')} ` : '';
  const variants = [term, `${prefix}${last}s`, `${prefix}${last}es`, `${prefix}${last}ed`, `${prefix}${last}ing`];
  if (last.endsWith('y')) variants.push(`${prefix}${last.slice(0, -1)}ies`);
  if (last.endsWith('e')) variants.push(`${prefix}${last}d`, `${prefix}${last.slice(0, -1)}ing`);
  for (const candidate of [...new Set(variants)]) {
    const match = String(passage).match(new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapePattern(candidate)}(?![\\p{L}\\p{N}_])`, 'iu'
    ));
    if (match) return match[0];
  }
  return '';
}

function normalizeVocabulary(payload, { passage = '', requireOriginal = true } = {}) {
  const value = parseJson(payload);
  const parsed = value?.result && !value.w ? parseJson(value.result) : value;
  if (!Array.isArray(parsed.w) || !parsed.w.length || parsed.w.length > 30) {
    throw new HttpError('Kết quả AI phải có danh sách từ vựng hợp lệ.', 422, 'INVALID_VOCAB_LIST');
  }
  return parsed.w.map((item, index) => {
    const value = { o: String(item?.o || '').trim(), t: String(item?.t || '').trim(), p: String(item?.p || '').trim(), i: String(item?.i || '').trim(), m: String(item?.m || '').trim() };
    if (!value.o && passage) value.o = inferOriginalForm(passage, value.t);
    if ((!value.o && requireOriginal) || !value.t || !value.i || !value.m || !ALLOWED_TYPES.has(value.p)) {
      throw new HttpError(`Từ vựng thứ ${index + 1} thiếu dữ liệu hoặc sai loại từ.`, 422, 'INVALID_VOCAB_ITEM');
    }
    if (!value.o) value.o = value.t;
    if (passage && !appearsExactly(passage, value.o)) {
      throw new HttpError(`Từ vựng thứ ${index + 1} có dạng gốc không xuất hiện chính xác trong đoạn văn.`, 422, 'VOCAB_NOT_IN_PASSAGE');
    }
    return value;
  });
}

async function generate(passage, userId, targetScore, selectionMode) {
  const text = String(passage || '').trim();
  if (text.length < 80) throw new HttpError('Đoạn văn cần tối thiểu 80 ký tự.', 400, 'PASSAGE_TOO_SHORT');
  if (text.length > 20000) throw new HttpError('Đoạn văn không được vượt quá 20.000 ký tự.', 400, 'PASSAGE_TOO_LONG');
  const settings = normalizeSettings(targetScore, selectionMode);
  const raw = await difyClient.generate(text, userId, settings.targetScore, settings.selectionMode);
  const outputs = raw?.data?.outputs || raw?.outputs || raw;
  const candidate = outputs?.result ?? outputs?.structured_output ?? outputs?.output ?? outputs;
  return { passage: text, ...settings, vocabularies: normalizeVocabulary(candidate, { passage: text }), workflowRunId: raw?.workflow_run_id || raw?.data?.workflow_run_id || null };
}

async function save({ passage, vocabularies, workflowRunId, targetScore, selectionMode }, userId) {
  const text = String(passage || '').trim();
  if (text.length < 80 || text.length > 20000) throw new HttpError('Đoạn văn lưu trữ không hợp lệ.', 400, 'INVALID_PASSAGE');
  const settings = normalizeSettings(targetScore, selectionMode);
  const items = normalizeVocabulary({ w: vocabularies }, { passage: text });
  return db.transaction(async client => {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const passageResult = await client.query(
      `INSERT INTO content_passages (content,content_hash,created_by) VALUES ($1,$2,$3)
       ON CONFLICT (content_hash) DO UPDATE SET updated_at=CURRENT_TIMESTAMP RETURNING id`,
      [text, hash, userId]
    );
    const generation = await client.query(
      `INSERT INTO key_vocab_generations
       (passage, passage_id, workflow_run_id, target_score, selection_mode, created_by) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, passage, provider, workflow_run_id, target_score, selection_mode, created_at`,
      [text, passageResult.rows[0].id, workflowRunId || null, settings.targetScore, settings.selectionMode, userId]
    );
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await client.query(`INSERT INTO key_vocab_items
        (generation_id,original_term,term,part_of_speech,pronunciation,meaning_vi,display_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [generation.rows[0].id, item.o, item.t, item.p, item.i, item.m, index]);
    }
    return { ...generation.rows[0], vocabularies: items };
  });
}

async function history({ page = 1, limit = 10, search = '' }) {
  const safePage = Math.max(1, Number(page) || 1); const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const term = `%${String(search).trim()}%`;
  const [rows, count] = await Promise.all([
    db.query(`SELECT g.id,g.passage,g.provider,g.target_score,g.selection_mode,g.created_at,u.name AS created_by_name,
      COUNT(i.id)::int AS item_count FROM key_vocab_generations g JOIN users u ON u.id=g.created_by
      LEFT JOIN key_vocab_items i ON i.generation_id=g.id WHERE g.passage ILIKE $1
      GROUP BY g.id,u.name ORDER BY g.created_at DESC LIMIT $2 OFFSET $3`, [term, safeLimit, (safePage - 1) * safeLimit]),
    db.query('SELECT COUNT(*)::int AS total FROM key_vocab_generations WHERE passage ILIKE $1', [term])
  ]);
  const total = count.rows[0]?.total || 0;
  return { data: rows.rows, meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
}

async function detail(id) {
  const [generation, items] = await Promise.all([
    db.query(`SELECT g.id,g.passage,g.provider,g.workflow_run_id,g.target_score,g.selection_mode,g.created_at,u.name AS created_by_name
      FROM key_vocab_generations g JOIN users u ON u.id=g.created_by WHERE g.id=$1`, [id]),
    db.query(`SELECT COALESCE(original_term,term) AS o,term AS t,part_of_speech AS p,pronunciation AS i,meaning_vi AS m
      FROM key_vocab_items WHERE generation_id=$1 ORDER BY display_order`, [id])
  ]);
  if (!generation.rows[0]) throw new HttpError('Không tìm thấy lịch sử Key Vocab.', 404, 'KEY_VOCAB_NOT_FOUND');
  return { ...generation.rows[0], vocabularies: items.rows };
}

module.exports = { generate, save, history, detail, normalizeSettings, normalizeVocabulary, inferOriginalForm, ALLOWED_TYPES };
