const crypto = require('crypto');
const db = require('../../config/db');
const HttpError = require('../../http/httpError');
const dify = require('../../clients/dictionaryDifyClient');

const clean = value => String(value ?? '').trim();
const DEFAULT_MAX_ITEMS = 300;
const DEFAULT_GENERATION_CONCURRENCY = 6;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_WORKER_POLL_MS = 1000;
const maxItems = () => {
  const configured = Number.parseInt(process.env.DICTIONARY_MAX_ITEMS || '', 10);
  return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 1000) : DEFAULT_MAX_ITEMS;
};
const generationConcurrency = () => {
  const configured = Number.parseInt(process.env.DICTIONARY_GENERATION_CONCURRENCY || '', 10);
  return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 20) : DEFAULT_GENERATION_CONCURRENCY;
};
const outputOf = raw => raw?.data?.outputs?.structured_output ?? raw?.data?.outputs?.result ?? raw?.outputs?.structured_output ?? raw;
const workflowIdOf = raw => raw?.workflow_run_id || raw?.data?.workflow_run_id || raw?.data?.id || null;
const normalizedSentence = value => clean(value).replace(/\s+/g, ' ').toLocaleLowerCase();
const sameSentence = (left, right) => normalizedSentence(left) === normalizedSentence(right);
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsExactTerm = (text, term) => {
  const value=clean(term);if(!value)return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapePattern(value)}(?=$|[^\\p{L}\\p{N}])`,'iu').test(clean(text));
};

function normalizeExtracted(raw) {
  const output = outputOf(raw);
  const items = Array.isArray(output?.sentences)
    ? output.sentences.flatMap(sentence => (Array.isArray(sentence?.items) ? sentence.items : []).map(item => ({
      text: clean(typeof item === 'string' ? item : item?.original_chunk || item?.item || item?.text),
      sentenceText: clean(sentence?.sentence_text)
    })))
    : (Array.isArray(output) ? output : output?.items);
  if (!Array.isArray(items)) throw new HttpError('Workflow bóc từ trả về sai định dạng.', 502, 'INVALID_DICTIONARY_ITEMS');
  const seen = new Set();
  return items.map(item => typeof item === 'object' && item?.text !== undefined
    ? { text: clean(item.text), sentenceText: clean(item.sentenceText) }
    : { text: clean(typeof item === 'string' ? item : item?.original_chunk || item?.item), sentenceText: clean(item?.sentence_text) })
    .filter(item => {
      const key = `${item.sentenceText}\u0000${item.text}`.toLocaleLowerCase();
      if (!item.text || seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, maxItems());
}

function normalizeEntry(raw, requestedItem = '') {
  const value = outputOf(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError('Workflow từ điển trả về sai định dạng.', 502, 'INVALID_DICTIONARY_ENTRY');
  const context = value.context_analysis || {};
  const usage = value.usage || {};
  const example = usage.example || value.example || {};
  const entry = {
    originalChunk: clean(requestedItem || value.original_chunk), canonical: clean(value.canonical || requestedItem),
    partOfSpeech: clean(value.pos || 'Phrase'), ipa: clean(value.ipa), meaningVi: clean(value.meaning_vn), meaningEn: clean(value.meaning_en),
    originalSentence: clean(context.original_sentence), contextExplanation: clean(context.explanation),
    exampleEn: clean(example.en), exampleVi: clean(example.vn),
    collocations: Array.isArray(usage.collocations || value.collocations) ? (usage.collocations || value.collocations).map(clean).filter(Boolean) : [],
    synonyms: Array.isArray(usage.synonyms || value.synonyms) ? (usage.synonyms || value.synonyms).map(clean).filter(Boolean) : [],
    wordFamily: clean(usage.word_family || value.word_family), workflowRunId: workflowIdOf(raw), rawResponse: value
  };
  if (!entry.originalChunk || !entry.canonical || !entry.meaningVi || !entry.meaningEn || !entry.originalSentence || !entry.contextExplanation) {
    throw new HttpError('Mục từ điển thiếu từ, nghĩa hoặc phân tích ngữ cảnh.', 502, 'INVALID_DICTIONARY_ENTRY');
  }
  return entry;
}

function sentenceForCandidate(candidate, passage) {
  const stored = clean(candidate?.source_sentence);
  if (stored) return stored;
  const target = clean(candidate?.original_chunk);
  const sentences = clean(passage).match(/[^.!?\n]+(?:[.!?]+|$)/g) || [];
  if (!target) return clean(passage);
  const escaped = escapePattern(target);
  const exactTerm = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
  return clean(sentences.find(sentence => exactTerm.test(sentence)) || passage);
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
  const items = (payload?.items || []).map(item => typeof item === 'string'
    ? { text: clean(item), sentenceText: '' }
    : { text: clean(item?.text || item?.originalChunk || item?.item), sentenceText: clean(item?.sentenceText || item?.sentence_text) })
    .filter(item => { const key=`${item.sentenceText}\u0000${item.text}`.toLowerCase(); if(!item.text||seen.has(key))return false; seen.add(key); return true; });
  if (!items.length || items.length > maxItems()) throw new HttpError(`Danh sách từ phải có từ 1 đến ${maxItems()} mục.`, 400, 'INVALID_DICTIONARY_LIST');
  items.forEach((item,index)=>{
    if(item.sentenceText&&!clean(passage).toLocaleLowerCase().includes(item.sentenceText.toLocaleLowerCase())) throw new HttpError(`Câu nguồn của mục ${index+1} không thuộc đoạn văn.`,400,'DICTIONARY_SENTENCE_NOT_IN_PASSAGE');
    if(item.sentenceText&&!containsExactTerm(item.sentenceText,item.text)) throw new HttpError(`Từ/cụm từ thứ ${index+1} không xuất hiện chính xác trong câu nguồn.`,400,'DICTIONARY_ITEM_NOT_IN_SENTENCE');
  });
  return db.transaction(async client => {
    const hash = crypto.createHash('sha256').update(passage).digest('hex');
    const source = await client.query(`INSERT INTO content_passages (content,content_hash,created_by) VALUES ($1,$2,$3)
      ON CONFLICT (content_hash) DO UPDATE SET updated_at=CURRENT_TIMESTAMP RETURNING id`, [passage, hash, userId]);
    const generation = await client.query(`INSERT INTO dictionary_generations
      (passage_id,status,extraction_workflow_run_id,raw_extraction_response,failed_items,created_by)
      VALUES ($1,'draft',$2,$3::jsonb,'[]'::jsonb,$4) RETURNING id,status,created_at`, [source.rows[0].id, payload.extractionWorkflowRunId || null, JSON.stringify(payload.rawExtractionResponse ?? null), userId]);
    for (let index = 0; index < items.length; index += 1) {
      await client.query('INSERT INTO dictionary_candidates (generation_id,original_chunk,source_sentence,display_order) VALUES ($1,$2,$3,$4)', [generation.rows[0].id,items[index].text,items[index].sentenceText||null,index]);
    }
    return detail(generation.rows[0].id, client);
  });
}

async function refreshGenerationStatus(generationId) {
  await db.query(`UPDATE dictionary_generations g SET status=summary.status,updated_at=CURRENT_TIMESTAMP FROM (
    SELECT generation_id,CASE WHEN COUNT(*) FILTER(WHERE status IN ('queued','generating'))>0 THEN 'generating'
      WHEN COUNT(*) FILTER(WHERE status='failed')>0 THEN 'partial'
      WHEN COUNT(*) FILTER(WHERE status='completed')=COUNT(*) THEN 'completed' ELSE 'draft' END AS status
    FROM dictionary_candidates WHERE generation_id=$1 GROUP BY generation_id) summary WHERE g.id=summary.generation_id`, [generationId]);
}

async function processCandidate(candidate, passage, userId) {
  const sentence = sentenceForCandidate(candidate, passage);
  const requestPayload = { passage, sentence, target_chunk: candidate.original_chunk };
  const attempt = await db.query(`INSERT INTO dictionary_generation_attempts
    (generation_id,candidate_id,attempt_number,request_payload)
    SELECT $1,$2,COALESCE(MAX(attempt_number),0)+1,$3::jsonb
    FROM dictionary_generation_attempts WHERE candidate_id=$2
    RETURNING id,started_at`,
  [candidate.generation_id,candidate.id,JSON.stringify(requestPayload)]);
  const startedAt = new Date(attempt.rows[0].started_at).getTime();
  try {
    const raw = await dify.generateEntry(passage, sentence, candidate.original_chunk, userId);
    const entry = normalizeEntry(raw, candidate.original_chunk);
    if (!sameSentence(sentence, entry.originalSentence)) {
      throw new HttpError('Dify trả về câu ngữ cảnh không khớp câu nguồn.',502,'DICTIONARY_CONTEXT_MISMATCH');
    }
    await db.transaction(async client => {
      await client.query('DELETE FROM dictionary_entries WHERE candidate_id=$1', [candidate.id]);
      await client.query(`INSERT INTO dictionary_entries
        (generation_id,candidate_id,original_chunk,canonical,part_of_speech,ipa,meaning_vi,meaning_en,original_sentence,context_explanation,example_en,example_vi,collocations,synonyms,word_family,workflow_run_id,raw_response,display_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [candidate.generation_id,candidate.id,entry.originalChunk,entry.canonical,entry.partOfSpeech,entry.ipa,entry.meaningVi,entry.meaningEn,sentence,entry.contextExplanation,entry.exampleEn,entry.exampleVi,JSON.stringify(entry.collocations),JSON.stringify(entry.synonyms),entry.wordFamily,entry.workflowRunId,entry.rawResponse,candidate.display_order]);
      await client.query("UPDATE dictionary_candidates SET status='completed',error_message=NULL,completed_at=CURRENT_TIMESTAMP,next_attempt_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [candidate.id]);
      await client.query(`UPDATE dictionary_generation_attempts SET status='completed',response_payload=$2::jsonb,
        workflow_run_id=$3,duration_ms=$4,completed_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [attempt.rows[0].id,JSON.stringify(entry.rawResponse),entry.workflowRunId,Math.max(0,Date.now()-startedAt)]);
    });
  } catch (error) {
    const maxAttempts = Math.max(1,Number.parseInt(process.env.DICTIONARY_MAX_ATTEMPTS || '',10) || DEFAULT_MAX_ATTEMPTS);
    const shouldRetry = candidate.attempt_count < maxAttempts;
    await db.transaction(async client => {
      await client.query(`UPDATE dictionary_generation_attempts SET status='failed',error_code=$2,error_message=$3,
        duration_ms=$4,completed_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [attempt.rows[0].id,error.code||'DICTIONARY_GENERATION_FAILED',error.message,Math.max(0,Date.now()-startedAt)]);
      await client.query(`UPDATE dictionary_candidates SET status=$2,error_message=$3,
        next_attempt_at=CASE WHEN $2='queued' THEN CURRENT_TIMESTAMP + ($4 * INTERVAL '5 seconds') ELSE NULL END,
        updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [candidate.id,shouldRetry?'queued':'failed',error.message,candidate.attempt_count]);
    });
  }
}

async function claimCandidate() {
  const claimed = await db.query(`WITH next_candidate AS (
    SELECT id FROM dictionary_candidates
    WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=CURRENT_TIMESTAMP)
    ORDER BY updated_at,display_order FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE dictionary_candidates candidate
    SET status='generating',attempt_count=attempt_count+1,started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    FROM next_candidate WHERE candidate.id=next_candidate.id RETURNING candidate.*`);
  if (!claimed.rows[0]) return null;
  const context = await db.query(`SELECT p.content AS passage,g.created_by AS user_id
    FROM dictionary_generations g JOIN content_passages p ON p.id=g.passage_id WHERE g.id=$1`,[claimed.rows[0].generation_id]);
  return context.rows[0] ? { candidate:claimed.rows[0], ...context.rows[0] } : null;
}

let workerTimer=null,workerRunning=false;
async function runWorkerBatch() {
  if(workerRunning)return;workerRunning=true;
  try {
    const jobs=[];
    for(let index=0;index<generationConcurrency();index+=1){const job=await claimCandidate();if(!job)break;jobs.push(job);}
    await Promise.all(jobs.map(async job=>{await processCandidate(job.candidate,job.passage,job.user_id);await refreshGenerationStatus(job.candidate.generation_id);}));
  } finally {workerRunning=false;}
}
async function startWorker(){
  if(workerTimer)return;
  await db.query(`UPDATE dictionary_candidates SET status='queued',next_attempt_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE status='generating' AND updated_at<CURRENT_TIMESTAMP-INTERVAL '5 minutes'`);
  const pollMs=Math.max(250,Number.parseInt(process.env.DICTIONARY_WORKER_POLL_MS||'',10)||DEFAULT_WORKER_POLL_MS);
  workerTimer=setInterval(()=>runWorkerBatch().catch(error=>console.error('[DictionaryWorker]',error)),pollMs);
  workerTimer.unref?.();
  await runWorkerBatch();
}
function stopWorker(){if(workerTimer){clearInterval(workerTimer);workerTimer=null;}}

async function startGeneration(generationId, candidateIds, userId) {
  const ids = [...new Set(Array.isArray(candidateIds) ? candidateIds.map(clean).filter(Boolean) : [])];
  if (!ids.length) throw new HttpError('Hãy chọn ít nhất một từ để gen.',400,'NO_CANDIDATES_SELECTED');
  const generation = await db.query(`SELECT g.id,p.content AS passage FROM dictionary_generations g JOIN content_passages p ON p.id=g.passage_id WHERE g.id=$1`,[generationId]);
  if(!generation.rows[0]) throw new HttpError('Không tìm thấy bộ từ điển.',404,'DICTIONARY_NOT_FOUND');
  const candidates = await db.query(`UPDATE dictionary_candidates SET status='queued',error_message=NULL,attempt_count=0,
    next_attempt_at=CURRENT_TIMESTAMP,started_at=NULL,completed_at=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE generation_id=$1 AND id=ANY($2::uuid[]) AND status NOT IN ('queued','generating')
    RETURNING id,generation_id,original_chunk,source_sentence,display_order`,[generationId,ids]);
  if(!candidates.rows.length) throw new HttpError('Các từ đã chọn đang được xử lý.',409,'CANDIDATES_ALREADY_RUNNING');
  await db.query("UPDATE dictionary_generations SET status='generating',updated_at=CURRENT_TIMESTAMP WHERE id=$1",[generationId]);
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
  const [generation, candidates, attempts] = await Promise.all([
    queryable.query(`SELECT g.id,g.status,g.created_at,p.content AS passage,u.name AS created_by_name FROM dictionary_generations g JOIN content_passages p ON p.id=g.passage_id JOIN users u ON u.id=g.created_by WHERE g.id=$1`, [id]),
    queryable.query(`SELECT c.id,c.original_chunk AS "originalChunk",CASE WHEN c.status='queued' THEN 'generating' ELSE c.status END AS status,c.error_message AS "errorMessage",c.attempt_count AS "attemptCount",
      e.canonical,e.part_of_speech AS "partOfSpeech",e.ipa,e.meaning_vi AS "meaningVi",e.meaning_en AS "meaningEn",e.original_sentence AS "originalSentence",e.context_explanation AS "contextExplanation",e.example_en AS "exampleEn",e.example_vi AS "exampleVi",e.collocations,e.synonyms,e.word_family AS "wordFamily",
      c.source_sentence AS "sentenceText" FROM dictionary_candidates c LEFT JOIN dictionary_entries e ON e.candidate_id=c.id WHERE c.generation_id=$1 ORDER BY c.display_order`, [id]),
    queryable.query(`SELECT candidate_id AS "candidateId",attempt_number AS "attemptNumber",status,workflow_run_id AS "workflowRunId",
      error_code AS "errorCode",error_message AS "errorMessage",duration_ms AS "durationMs",started_at AS "startedAt",completed_at AS "completedAt"
      FROM dictionary_generation_attempts WHERE generation_id=$1 ORDER BY candidate_id,attempt_number DESC`,[id])
  ]);
  if (!generation.rows[0]) throw new HttpError('Không tìm thấy bộ từ điển.',404,'DICTIONARY_NOT_FOUND');
  const attemptsByCandidate=new Map();
  attempts.rows.forEach(attempt=>{const values=attemptsByCandidate.get(attempt.candidateId)||[];values.push(attempt);attemptsByCandidate.set(attempt.candidateId,values)});
  return { ...generation.rows[0], candidates: candidates.rows.map(candidate=>({...candidate,attempts:attemptsByCandidate.get(candidate.id)||[]})) };
}

module.exports = { extract, saveCandidates, startGeneration, history, detail, normalizeExtracted, normalizeEntry, sentenceForCandidate, sameSentence, maxItems, startWorker, stopWorker, runWorkerBatch };
