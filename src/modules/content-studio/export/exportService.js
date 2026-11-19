'use strict';

// Content Studio export. Key Vocab and Dictionary go through the EXISTING exporters
// (same templates, same columns, same formatting as the legacy modules); this file only maps data.
const db = require('../../../config/db');
const HttpError = require('../../../http/httpError');
const contentStudio = require('../contentStudioService');
const keyVocabExporter = require('../../key-vocab/keyVocabExporter');
const dictionaryExporter = require('../../dictionary/dictionaryExporter');
const documentExporter = require('../../learning-materials/learningMaterialDocumentExporter');
const docx = require('./docxDocuments');

const clean = value => String(value ?? '').trim();
const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function passageText(item) {
  return item.segments.filter(segment => segment.kind === 'passage').map(segment => segment.text).join('\n\n');
}

// vocab artifact items → legacy Key Vocab rows { o, t, p, i, m }
function mapVocab(item) {
  const vocabularies = item.artifacts
    .filter(artifact => artifact.type === 'vocab' && artifact.content)
    .sort((a, b) => item.segments.findIndex(s => s.id === a.segmentId) - item.segments.findIndex(s => s.id === b.segmentId))
    .flatMap(artifact => artifact.content.items || [])
    .map(entry => ({ o: clean(entry.inText || entry.lemma), t: clean(entry.lemma), p: clean(entry.pos), i: clean(entry.ipa), m: clean(entry.meaningVi) }));
  if (!vocabularies.length) throw new HttpError('Chưa có Từ vựng để xuất.', 400, 'EMPTY_VOCAB_EXPORT');
  const settings = item.tasks?.vocab || {};
  return { vocabularies, passage: passageText(item), target_score: settings.level || 650, selection_mode: settings.mode || 'balanced', created_at: item.createdAt };
}

// cs_dict_* rows → legacy dictionary candidates (ready = completed, everything else is skipped like before)
async function mapDictionary(item, client = db) {
  const { rows } = await client.query(`
    SELECT c.status, c.chunk, e.content, s.text AS sentence
    FROM cs_dict_candidates c
    JOIN cs_dict_sentences s ON s.id = c.sentence_id
    LEFT JOIN cs_dict_entries e ON e.candidate_id = c.id
    WHERE c.item_id = $1 ORDER BY s.position, c.position`, [item.id]);
  const candidates = rows.map(row => {
    const content = row.content || {};
    const family = Array.isArray(content.wordFamily) ? content.wordFamily.map(clean).filter(Boolean).join(' - ') : clean(content.wordFamily);
    return {
      status: row.status === 'ready' && row.content ? 'completed' : row.status,
      originalChunk: clean(content.inText || row.chunk), canonical: clean(content.lemma), partOfSpeech: clean(content.pos),
      ipa: clean(content.ipa), meaningVi: clean(content.meaningVi), meaningEn: clean(content.meaningEn),
      originalSentence: clean(content.sentence || row.sentence), sentenceText: clean(row.sentence),
      contextExplanation: clean(content.context),
      exampleEn: clean(content.example?.en), exampleVi: clean(content.example?.vi),
      collocations: content.collocations || [], synonyms: content.synonyms || [], wordFamily: family,
    };
  });
  const skipped = candidates.filter(candidate => candidate.status !== 'completed').length;
  return { candidates, skipped, passage: passageText(item), created_at: item.createdAt };
}

// Everything the bilingual / question / full documents need, in reading order.
async function lessonModel(item, client = db) {
  const passages = item.segments.filter(segment => segment.kind === 'passage').map(segment => {
    const translation = item.artifacts.find(artifact => artifact.type === 'passage_translation' && artifact.segmentId === segment.id);
    return { text: segment.text, sentences: translation?.content?.sentences || [] };
  });
  const questions = item.segments.flatMap(segment => segment.questions || []).sort((a, b) => a.number - b.number).map(question => {
    const pack = item.artifacts.find(artifact => artifact.type === 'question_pack' && artifact.questionId === question.id)?.content;
    return { ...question, pack: pack ? { translation: typeof pack.translation === 'string' ? pack.translation : '', hint: pack.hint, explanation: pack.explanation, note: pack.note } : null };
  });
  const vocab = item.artifacts.filter(artifact => artifact.type === 'vocab' && artifact.content).flatMap(artifact => artifact.content.items || []);
  const { rows } = await client.query(`
    SELECT e.content FROM cs_dict_candidates c JOIN cs_dict_sentences s ON s.id = c.sentence_id JOIN cs_dict_entries e ON e.candidate_id = c.id
    WHERE c.item_id = $1 AND c.status = 'ready' ORDER BY s.position, c.position`, [item.id]);
  const firstPassage = item.segments.find(segment => segment.kind === 'passage');
  return {
    title: item.title, part: firstPassage?.meta?.part,
    questionRange: (range => (range?.from ? (range.to && range.to !== range.from ? `${range.from}–${range.to}` : String(range.from)) : null))(item.detection?.summary?.questionRange),
    passages, questions, vocab, dictionary: rows.map(row => row.content),
  };
}

function fileName(item, kind, format) {
  const base = clean(item.title).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'hoc_lieu';
  const prefix = { vocab: 'KeyVocabulary', dictionary: 'VocabularyDictionary', bilingual: 'SongNgu', questions: 'CauHoi_GiaoVien', full: 'HocLieu' }[kind] || kind;
  return `${prefix}_${base}.${format}`;
}

async function exportItem(itemId, kind, format) {
  const item = await contentStudio.getItem(itemId);
  if (kind === 'vocab') {
    const detail = mapVocab(item);
    const file = format === 'xlsx' ? await keyVocabExporter.createWorkbook(detail.vocabularies)
      : format === 'docx' ? await documentExporter.create('key-vocab', 'docx', detail) : null;
    if (!file) throw new HttpError('Định dạng không hỗ trợ.', 400, 'INVALID_EXPORT_FORMAT');
    return { file, mime: MIME[format], name: fileName(item, kind, format) };
  }
  if (kind === 'dictionary') {
    const detail = await mapDictionary(item);
    const file = format === 'xlsx' ? await dictionaryExporter.createWorkbook(detail.candidates)
      : format === 'docx' ? await documentExporter.create('dictionary', 'docx', detail) : null;
    if (!file) throw new HttpError('Định dạng không hỗ trợ.', 400, 'INVALID_EXPORT_FORMAT');
    return { file, mime: MIME[format], name: fileName(item, kind, format), skipped: detail.skipped };
  }
  if (['bilingual', 'questions', 'full'].includes(kind)) {
    if (format !== 'docx') throw new HttpError('Định dạng không hỗ trợ.', 400, 'INVALID_EXPORT_FORMAT');
    const model = await lessonModel(item);
    if (kind === 'bilingual' && !model.passages.some(passage => passage.sentences.length)) throw new HttpError('Chưa có bản dịch để xuất.', 400, 'EMPTY_TRANSLATION_EXPORT');
    if (kind.startsWith('questions') && !model.questions.some(question => question.pack)) throw new HttpError('Chưa có nội dung câu hỏi để xuất.', 400, 'EMPTY_QUESTION_EXPORT');
    const file = kind === 'bilingual' ? await docx.buildBilingual(model)
      : kind === 'full' ? await docx.buildFull(model)
        : await docx.buildQuestions(model);
    return { file, mime: MIME.docx, name: fileName(item, kind, 'docx') };
  }
  throw new HttpError('Loại export không hỗ trợ.', 400, 'INVALID_EXPORT_KIND');
}

module.exports = { exportItem, mapVocab, mapDictionary, lessonModel, fileName, MIME };
