'use strict';

const HttpError = require('../../../http/httpError');

const clean = value => String(value ?? '').trim();
const normalizedSentence = value => clean(value).normalize('NFKC')
  .replace(/\s+/g, ' ').replace(/\s*([—–])\s*/g, '$1').toLocaleLowerCase();
const sameSentence = (left, right) => normalizedSentence(left) === normalizedSentence(right);
const sentenceBelongsToPassage = (passage, sentence) => normalizedSentence(passage).includes(normalizedSentence(sentence));
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsExactChunk = (sentence, chunk) => {
  const value = clean(chunk);
  if (!value) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapePattern(value)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(clean(sentence));
};
const outputOf = raw => raw?.data?.outputs?.structured_output
  ?? raw?.data?.outputs?.result ?? raw?.outputs?.structured_output ?? raw;

function normalizeExtract(raw, passage, maxItems = 300) {
  const output = outputOf(raw);
  if (!Array.isArray(output?.sentences)) {
    throw new HttpError('Workflow bóc từ trả về sai định dạng.', 502, 'INVALID_DICTIONARY_ITEMS');
  }
  const result = [];
  for (const row of output.sentences) {
    const sentenceText = clean(row?.sentence_text ?? row?.sentenceText ?? row?.text);
    if (!sentenceText || !sentenceBelongsToPassage(passage, sentenceText)) {
      throw new HttpError('Câu do workflow trả về không thuộc đoạn văn.', 502, 'DICTIONARY_SENTENCE_NOT_IN_PASSAGE');
    }
    if (!Array.isArray(row?.items)) {
      throw new HttpError('Workflow bóc từ trả về sai định dạng.', 502, 'INVALID_DICTIONARY_ITEMS');
    }
    const seen = new Set();
    const items = [];
    for (const item of row.items) {
      const chunk = clean(typeof item === 'string' ? item : item?.original_chunk ?? item?.item ?? item?.text);
      const key = normalizedSentence(chunk);
      if (!chunk || seen.has(key)) continue;
      if (!containsExactChunk(sentenceText, chunk)) {
        throw new HttpError(`“${chunk}” không xuất hiện chính xác trong câu nguồn.`, 502, 'DICTIONARY_ITEM_NOT_IN_SENTENCE');
      }
      seen.add(key);
      items.push(chunk);
      if (result.reduce((count, value) => count + value.items.length, 0) + items.length > maxItems) {
        throw new HttpError(`Danh sách từ vượt quá ${maxItems} mục.`, 502, 'DICTIONARY_TOO_MANY_ITEMS');
      }
    }
    result.push({ sentenceText, items });
  }
  if (!result.some(row => row.items.length)) {
    throw new HttpError('AI không tìm thấy từ phù hợp trong đoạn văn.', 422, 'NO_DICTIONARY_ITEMS');
  }
  return result;
}

const cleanList = value => (Array.isArray(value) ? value.map(clean).filter(Boolean) : []);
const splitWordFamily = value => Array.isArray(value)
  ? cleanList(value)
  : clean(value).split(/\s+-\s+|\s*–\s*/).map(clean).filter(Boolean);

function normalizeOneEntry(value, requestedChunk, sentence) {
  const context = value?.context_analysis || {};
  const usage = value?.usage || {};
  const example = usage.example || value?.example || {};
  const originalSentence = clean(context.original_sentence ?? value?.sentence);
  if (!sameSentence(sentence, originalSentence)) {
    throw new HttpError('Dify trả về câu ngữ cảnh không khớp câu nguồn.', 502, 'DICTIONARY_CONTEXT_MISMATCH');
  }
  return {
    inText: clean(requestedChunk || value?.original_chunk || value?.inText),
    lemma: clean(value?.canonical ?? value?.lemma ?? requestedChunk),
    pos: clean(value?.pos || 'Phrase'),
    ipa: clean(value?.ipa),
    meaningVi: clean(value?.meaning_vn ?? value?.meaningVi),
    meaningEn: clean(value?.meaning_en ?? value?.meaningEn),
    sentence: clean(sentence),
    context: clean(context.explanation ?? value?.context),
    example: { en: clean(example.en), vi: clean(example.vn ?? example.vi) },
    collocations: cleanList(usage.collocations ?? value?.collocations),
    synonyms: cleanList(usage.synonyms ?? value?.synonyms),
    wordFamily: splitWordFamily(usage.word_family ?? value?.word_family ?? value?.wordFamily),
  };
}

function mapDictionaryEntries(raw, requestedChunks, sentence) {
  const requested = requestedChunks.map(clean).filter(Boolean);
  const output = outputOf(raw);
  const values = output?.dictionary_entries;
  if (!Array.isArray(values)) {
    throw new HttpError('Workflow từ điển trả về sai định dạng batch.', 502, 'INVALID_DICTIONARY_BATCH');
  }
  if (values.length !== requested.length) {
    throw new HttpError(`Workflow trả về ${values.length}/${requested.length} mục từ điển.`, 502, 'DICTIONARY_BATCH_SIZE_MISMATCH');
  }
  return values.map((value, index) => normalizeOneEntry(value, requested[index], sentence));
}

function validateEntry(content, sentence) {
  const entry = {
    ...content,
    inText: clean(content?.inText), lemma: clean(content?.lemma), pos: clean(content?.pos), ipa: clean(content?.ipa),
    meaningVi: clean(content?.meaningVi), meaningEn: clean(content?.meaningEn), sentence: clean(sentence),
    context: clean(content?.context),
    example: { en: clean(content?.example?.en), vi: clean(content?.example?.vi) },
    collocations: cleanList(content?.collocations), synonyms: cleanList(content?.synonyms), wordFamily: splitWordFamily(content?.wordFamily),
  };
  const required = ['inText', 'lemma', 'pos', 'ipa', 'meaningVi', 'meaningEn', 'sentence', 'context'];
  const issues = required.filter(field => !entry[field]).map(field => ({ code: 'EMPTY_FIELD', path: field, message: `Thiếu trường ${field}.` }));
  if (!entry.example.en) issues.push({ code: 'EMPTY_FIELD', path: 'example.en', message: 'Thiếu câu ví dụ tiếng Anh.' });
  if (!entry.example.vi) issues.push({ code: 'EMPTY_FIELD', path: 'example.vi', message: 'Thiếu bản dịch câu ví dụ.' });
  if (entry.inText && !containsExactChunk(sentence, entry.inText)) {
    issues.push({ code: 'NOT_IN_SENTENCE', path: 'inText', message: `“${entry.inText}” không có trong câu nguồn.` });
  }
  return { content: entry, validation: { issues, checkedAt: new Date().toISOString() } };
}

module.exports = {
  containsExactChunk, mapDictionaryEntries, normalizeExtract, normalizedSentence,
  sameSentence, sentenceBelongsToPassage, splitWordFamily, validateEntry,
};
