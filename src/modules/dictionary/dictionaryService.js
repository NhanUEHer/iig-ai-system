const crypto = require('crypto');
const db = require('../../config/db');
const HttpError = require('../../http/httpError');
const dify = require('../../clients/dictionaryDifyClient');

const clean = value => String(value ?? '').trim();
const outputOf = raw => raw?.data?.outputs?.structured_output ?? raw?.data?.outputs?.result ?? raw?.outputs?.structured_output ?? raw;
const workflowIdOf = raw => raw?.workflow_run_id || raw?.data?.workflow_run_id || raw?.data?.id || null;

function normalizeExtracted(raw) {
  const output = outputOf(raw);
  const items = Array.isArray(output) ? output : output?.items;
  if (!Array.isArray(items)) throw new HttpError('Workflow bóc từ trả về sai định dạng.', 502, 'INVALID_DICTIONARY_ITEMS');
  const seen = new Set();
  return items.map(item => clean(typeof item === 'string' ? item : item?.original_chunk || item?.item))
    .filter(item => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 30);
}

function normalizeEntry(raw, requestedItem = '') {
  const value = outputOf(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError('Workflow từ điển trả về sai định dạng.', 502, 'INVALID_DICTIONARY_ENTRY');
  const context = value.context_analysis || {};
  const example = value.example || {};
  const entry = {
    originalChunk: clean(value.original_chunk || requestedItem), canonical: clean(value.canonical || requestedItem),
    partOfSpeech: clean(value.pos || 'Phrase'), ipa: clean(value.ipa), meaningVi: clean(value.meaning_vn), meaningEn: clean(value.meaning_en),
    originalSentence: clean(context.original_sentence), contextExplanation: clean(context.explanation),
    exampleEn: clean(example.en), exampleVi: clean(example.vn),
    collocations: Array.isArray(value.collocations) ? value.collocations.map(clean).filter(Boolean) : [],
    synonyms: Array.isArray(value.synonyms) ? value.synonyms.map(clean).filter(Boolean) : [],
    wordFamily: clean(value.word_family), workflowRunId: workflowIdOf(raw), rawResponse: value
  };
  if (!entry.originalChunk || !entry.canonical || !entry.meaningVi) throw new HttpError('Mục từ điển thiếu từ hoặc nghĩa tiếng Việt.', 502, 'INVALID_DICTIONARY_ENTRY');
  return entry;
}

async function extract(passage, userId) {
  const text = clean(passage);
  if (text.length < 80) throw new HttpError('Đoạn văn cần tối thiểu 80 ký tự.', 400, 'PASSAGE_TOO_SHORT');
  if (text.length > 20000) throw new HttpError('Đoạn văn không được vượt quá 20.000 ký tự.', 400, 'PASSAGE_TOO_LONG');
  const extractionRaw = await dify.extractItems(text, userId);
  const items = normalizeExtracted(extractionRaw);
  if (!items.length) throw new HttpError('AI không tìm thấy từ phù hợp trong đoạn văn.', 422, 'NO_DICTIONARY_ITEMS');
  return { passage: text, items, extractionWorkflowRunId: workflowIdOf(extractionRaw), rawExtractionResponse: outputOf(extractionRaw) };
}

async function saveCandidates(payload, userId) {
  const passage = clean(payload?.passage);
  if (passage.length < 80 || passage.length > 20000) throw new HttpError('Đoạn văn lưu trữ không hợp lệ.', 400, 'INVALID_PASSAGE');
  const seen = new Set();
  const items = (payload?.items || []).map(clean).filter(item => { const key=item.toLowerCase(); if(!item||seen.has(key))return false; seen.add(key); return true; });
  if (!items.length || items.length > 30) throw new HttpError('Danh sách từ không hợp lệ.', 400, 'INVALID_DICTIONARY_LIST');
  return db.transaction(async client => {
    const hash = crypto.createHash('sha256').update(passage).digest('hex');
    const source = await client.query(`INSERT INTO content_passages (content,content_hash,created_by) VALUES ($1,$2,$3)
      ON CONFLICT (content_hash) DO UPDATE SET updated_at=CURRENT_TIMESTAMP RETURNING id`, [passage, hash, userId]);
    const generation = await client.query(`INSERT INTO dictionary_generations
      (passage_id,status,extraction_workflow_run_id,raw_extraction_response,failed_items,created_by)
      VALUES ($1,'draft',$2,$3,'[]'::jsonb,$4) RETURNING id,status,created_at`, [source.rows[0].id, payload.extractionWorkflowRunId || null, payload.rawExtractionResponse || null, userId]);
    for (let index = 0; index < items.length; index += 1) {
      await client.query('INSERT INTO dictionary_candidates (generation_id,original_chunk,display_order) VALUES ($1,$2,$3)', [generation.rows[0].id,items[index],index]);
    }
    return detail(generation.rows[0].id, client);
  });
}

async function refreshGenerationStatus(generationId) {
  await db.query(`UPDATE dictionary_generations g SET status=summary.status,updated_at=CURRENT_TIMESTAMP FROM (
    SELECT generation_id,CASE WHEN COUNT(*) FILTER(WHERE status='generating')>0 THEN 'generating'
      WHEN COUNT(*) FILTER(WHERE status='failed')>0 THEN 'partial'
      WHEN COUNT(*) FILTER(WHERE status='completed')=COUNT(*) THEN 'completed' ELSE 'draft' END AS status
    FROM dictionary_candidates WHERE generation_id=$1 GROUP BY generation_id) summary WHERE g.id=summary.generation_id`, [generationId]);
}

async function processCandidate(candidate, passage, userId) {
  try {
    const entry = normalizeEntry(await dify.generateEntry(candidate.original_chunk, passage, userId), candidate.original_chunk);
    await db.transaction(async client => {
      await client.query('DELETE FROM dictionary_entries WHERE candidate_id=$1', [candidate.id]);
      await client.query(`INSERT INTO dictionary_entries
        (generation_id,candidate_id,original_chunk,canonical,part_of_speech,ipa,meaning_vi,meaning_en,original_sentence,context_explanation,example_en,example_vi,collocations,synonyms,word_family,workflow_run_id,raw_response,display_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [candidate.generation_id,candidate.id,entry.originalChunk,entry.canonical,entry.partOfSpeech,entry.ipa,entry.meaningVi,entry.meaningEn,entry.originalSentence,entry.contextExplanation,entry.exampleEn,entry.exampleVi,JSON.stringify(entry.collocations),JSON.stringify(entry.synonyms),entry.wordFamily,entry.workflowRunId,entry.rawResponse,candidate.display_order]);
      await client.query("UPDATE dictionary_candidates SET status='completed',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [candidate.id]);
    });
  } catch (error) {
    await db.query("UPDATE dictionary_candidates SET status='failed',error_message=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [candidate.id,error.message]);
  }
}

async function runInBackground(generationId, candidates, passage, userId) {
  let cursor=0;
  async function worker(){while(cursor<candidates.length){const candidate=candidates[cursor++];await processCandidate(candidate,passage,userId);await refreshGenerationStatus(generationId);}}
  await Promise.all(Array.from({length:Math.min(4,candidates.length)},worker));
  await refreshGenerationStatus(generationId);
}

async function startGeneration(generationId, candidateIds, userId) {
  const ids = [...new Set(Array.isArray(candidateIds) ? candidateIds.map(clean).filter(Boolean) : [])];
  if (!ids.length) throw new HttpError('Hãy chọn ít nhất một từ để gen.',400,'NO_CANDIDATES_SELECTED');
  const generation = await db.query(`SELECT g.id,p.content AS passage FROM dictionary_generations g JOIN content_passages p ON p.id=g.passage_id WHERE g.id=$1`,[generationId]);
  if(!generation.rows[0]) throw new HttpError('Không tìm thấy bộ từ điển.',404,'DICTIONARY_NOT_FOUND');
  const candidates = await db.query(`UPDATE dictionary_candidates SET status='generating',error_message=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE generation_id=$1 AND id=ANY($2::uuid[]) AND status<>'generating' RETURNING id,generation_id,original_chunk,display_order`,[generationId,ids]);
  if(!candidates.rows.length) throw new HttpError('Các từ đã chọn đang được xử lý.',409,'CANDIDATES_ALREADY_RUNNING');
  await db.query("UPDATE dictionary_generations SET status='generating',updated_at=CURRENT_TIMESTAMP WHERE id=$1",[generationId]);
  setImmediate(()=>runInBackground(generationId,candidates.rows,generation.rows[0].passage,userId).catch(error=>console.error('[DictionaryJob]',error)));
  return { generationId, queued:candidates.rows.length };
}

async function history({ page = 1, limit = 10, search = '' }) {
  const p = Math.max(1, Number(page) || 1), l = Math.min(50, Math.max(1, Number(limit) || 10)), term = `%${clean(search)}%`;
  const [rows, count] = await Promise.all([
    db.query(`SELECT g.id,g.status,g.created_at,p.content AS passage,u.name AS created_by_name,COUNT(c.id)::int AS item_count,COUNT(c.id) FILTER(WHERE c.status='failed')::int AS failed_count
      FROM dictionary_generations g JOIN content_passages p ON p.id=g.passage_id JOIN users u ON u.id=g.created_by LEFT JOIN dictionary_candidates c ON c.generation_id=g.id
      WHERE p.content ILIKE $1 GROUP BY g.id,p.content,u.name ORDER BY g.created_at DESC LIMIT $2 OFFSET $3`, [term,l,(p-1)*l]),
    db.query(`SELECT COUNT(*)::int AS total FROM dictionary_generations g JOIN content_passages p ON p.id=g.passage_id WHERE p.content ILIKE $1`, [term])
  ]);
  const total = count.rows[0]?.total || 0; return { data: rows.rows, meta: { page:p,limit:l,total,totalPages:Math.max(1,Math.ceil(total/l)) } };
}

async function detail(id, queryable=db) {
  const [generation, candidates] = await Promise.all([
    queryable.query(`SELECT g.id,g.status,g.created_at,p.content AS passage,u.name AS created_by_name FROM dictionary_generations g JOIN content_passages p ON p.id=g.passage_id JOIN users u ON u.id=g.created_by WHERE g.id=$1`, [id]),
    queryable.query(`SELECT c.id,c.original_chunk AS "originalChunk",c.status,c.error_message AS "errorMessage",
      e.canonical,e.part_of_speech AS "partOfSpeech",e.ipa,e.meaning_vi AS "meaningVi",e.meaning_en AS "meaningEn",e.original_sentence AS "originalSentence",e.context_explanation AS "contextExplanation",e.example_en AS "exampleEn",e.example_vi AS "exampleVi",e.collocations,e.synonyms,e.word_family AS "wordFamily"
      FROM dictionary_candidates c LEFT JOIN dictionary_entries e ON e.candidate_id=c.id WHERE c.generation_id=$1 ORDER BY c.display_order`, [id])
  ]);
  if (!generation.rows[0]) throw new HttpError('Không tìm thấy bộ từ điển.',404,'DICTIONARY_NOT_FOUND');
  return { ...generation.rows[0], candidates: candidates.rows };
}

module.exports = { extract, saveCandidates, startGeneration, history, detail, normalizeExtracted, normalizeEntry };
