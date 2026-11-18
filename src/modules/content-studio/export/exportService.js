'use strict';

// Content Studio export. Key Vocab and Dictionary go through the EXISTING exporters
// (same templates, same columns, same formatting as the legacy modules); this file only maps data.
const db = require('../../../config/db');
const HttpError = require('../../../http/httpError');
const contentStudio = require('../contentStudioService');
const keyVocabExporter = require('../../key-vocab/keyVocabExporter');
const dictionaryExporter = require('../../dictionary/dictionaryExporter');
const documentExporter = require('../../learning-materials/learningMaterialDocumentExporter');

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

function fileName(item, kind, format) {
  const base = clean(item.title).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'hoc_lieu';
  const prefix = { vocab: 'KeyVocabulary', dictionary: 'VocabularyDictionary' }[kind] || kind;
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
  throw new HttpError('Loại export không hỗ trợ.', 400, 'INVALID_EXPORT_KIND');
}

module.exports = { exportItem, mapVocab, mapDictionary, fileName, MIME };
