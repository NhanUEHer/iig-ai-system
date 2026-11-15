'use strict';

// Quality gates for generated or edited artifacts. Issues never discard content:
// an artifact with issues is stored as "needs_review" and the issues are shown to the editor.

const LETTERS = ['A', 'B', 'C', 'D'];
const BANNED_NOTE_WORDS = ['bẫy', 'đánh lừa', 'lừa'];
const norm = text => String(text || '').toLowerCase().replace(/[“”"‘’']/g, '').replace(/\s+/g, ' ').trim();
const digits = text => (String(text || '').match(/\d+(?:[.:,]\d+)*/g) || []);
const issue = (code, message, path) => ({ code, message, ...(path ? { path } : {}) });

function validatePassageTranslation(content, { sentences }) {
  const issues = [];
  const rows = Array.isArray(content?.sentences) ? content.sentences : [];
  if (rows.length !== sentences.length) issues.push(issue('SENTENCE_COUNT', `Số câu dịch (${rows.length}) khác số câu gốc (${sentences.length}).`));
  rows.forEach((row, index) => {
    if (!String(row?.vi || '').trim()) issues.push(issue('EMPTY_TRANSLATION', `Câu ${index + 1} chưa có bản dịch.`, `sentences.${index}`));
    const missing = digits(row?.en).filter(number => !String(row?.vi || '').includes(number));
    if (missing.length) issues.push(issue('NUMBER_MISMATCH', `Câu ${index + 1}: bản dịch thiếu số ${missing.join(', ')}.`, `sentences.${index}`));
  });
  return issues;
}

function quotesIn(text) {
  return [...String(text || '').matchAll(/[“"]([^”"]{12,})[”"]/g)].map(match => match[1]);
}

function validateQuestionPack(content, { question, passage }) {
  const issues = [];
  const answer = question.answerKey;
  for (const field of ['hint', 'explanation', 'note']) {
    if (!String(content?.[field] || '').trim()) issues.push(issue('EMPTY_FIELD', `Câu ${question.number}: thiếu ${field === 'hint' ? 'Hint' : field === 'explanation' ? 'Explanation' : 'Note'}.`, field));
  }
  if (!String(content?.translation?.stem || '').trim()) issues.push(issue('EMPTY_FIELD', `Câu ${question.number}: thiếu bản dịch câu hỏi.`, 'translation'));
  for (const letter of Object.keys(question.options || {})) {
    if (!String(content?.translation?.options?.[letter] || '').trim()) issues.push(issue('EMPTY_FIELD', `Câu ${question.number}: thiếu bản dịch đáp án (${letter}).`, 'translation'));
  }
  if (!answer) {
    issues.push(issue('NO_ANSWER_KEY', `Câu ${question.number}: chưa có đáp án đúng để kiểm tra Explanation.`, 'explanation'));
    return issues;
  }
  const explanation = String(content?.explanation || '');
  if (explanation && !new RegExp(`\\(${answer}\\)|\\b${answer}\\b`).test(explanation)) {
    issues.push(issue('ANSWER_MISMATCH', `Câu ${question.number}: Explanation không nêu đáp án đúng (${answer}).`, 'explanation'));
  }
  const otherLetters = LETTERS.filter(letter => letter !== answer && question.options?.[letter]);
  const unmentioned = otherLetters.filter(letter => !explanation.includes(`(${letter})`));
  if (explanation && unmentioned.length) issues.push(issue('WRONG_OPTIONS_NOT_EXPLAINED', `Câu ${question.number}: Explanation chưa giải thích phương án ${unmentioned.map(letter => `(${letter})`).join(', ')}.`, 'explanation'));
  const passageText = norm(passage);
  for (const quote of quotesIn(explanation)) {
    if (passageText && !passageText.includes(norm(quote).replace(/[.…]+$/, ''))) issues.push(issue('QUOTE_NOT_IN_PASSAGE', `Câu ${question.number}: trích dẫn không có trong bài: “${quote.slice(0, 60)}…”`, 'explanation'));
  }
  const hint = norm(content?.hint);
  const correct = norm(question.options?.[answer]);
  if (hint && (correct.length > 3 && hint.includes(correct) || new RegExp(`(?:đáp án|answer)\\s*(?:là|is)?\\s*\\(?${answer.toLowerCase()}\\)?(?![a-z])`).test(hint))) {
    issues.push(issue('HINT_LEAKS_ANSWER', `Câu ${question.number}: Hint làm lộ đáp án.`, 'hint'));
  }
  const note = norm(content?.note);
  const banned = BANNED_NOTE_WORDS.filter(word => new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, 'u').test(note));
  if (banned.length) issues.push(issue('BANNED_WORDS', `Câu ${question.number}: Note dùng từ không phù hợp (${banned.join(', ')}).`, 'note'));
  return issues;
}

function validateVocab(content, { passage }) {
  const issues = [];
  const items = Array.isArray(content?.items) ? content.items : [];
  if (!items.length) issues.push(issue('EMPTY', 'Chưa có từ vựng nào.'));
  if (items.length > 30) issues.push(issue('TOO_MANY', 'Tối đa 30 từ vựng.'));
  const text = norm(passage);
  items.forEach((item, index) => {
    if (!String(item?.lemma || '').trim() || !String(item?.meaningVi || '').trim()) issues.push(issue('EMPTY_FIELD', `Dòng ${index + 1}: thiếu dạng từ điển hoặc nghĩa.`, `items.${index}`));
    if (item?.inText && !text.includes(norm(item.inText))) issues.push(issue('NOT_IN_PASSAGE', `“${item.inText}” không có trong đoạn văn.`, `items.${index}`));
  });
  return issues;
}

function validateDictionary(content, { sentences }) {
  const issues = [];
  const rows = Array.isArray(content?.sentences) ? content.sentences : [];
  if (rows.length !== sentences.length) issues.push(issue('SENTENCE_COUNT', `Số câu (${rows.length}) khác số câu gốc (${sentences.length}).`));
  rows.forEach((row, index) => {
    if (sentences[index] && norm(row?.text) !== norm(sentences[index])) issues.push(issue('SENTENCE_MISMATCH', `Câu ${index + 1} không khớp với câu gốc.`, `sentences.${index}`));
    (row?.entries || []).forEach((entry, entryIndex) => {
      if (!String(entry?.lemma || '').trim() || !String(entry?.meaningVi || '').trim()) issues.push(issue('EMPTY_FIELD', `Câu ${index + 1}, mục ${entryIndex + 1}: thiếu từ hoặc nghĩa.`, `sentences.${index}.entries.${entryIndex}`));
      if (entry?.inText && !norm(row?.text).includes(norm(entry.inText))) issues.push(issue('NOT_IN_SENTENCE', `“${entry.inText}” không có trong câu ${index + 1}.`, `sentences.${index}.entries.${entryIndex}`));
    });
  });
  return issues;
}

const VALIDATORS = {
  passage_translation: validatePassageTranslation,
  question_pack: validateQuestionPack,
  vocab: validateVocab,
  dictionary: validateDictionary,
};

function validate(type, content, context) {
  const issues = VALIDATORS[type](content, context);
  return { issues, checkedAt: new Date().toISOString() };
}

module.exports = { validate };
