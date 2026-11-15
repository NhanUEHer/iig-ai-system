'use strict';

// Rule-based detection of TOEIC LR passages + questions from pasted text or DOCX text.
// Pure function: no I/O, so it is unit-testable and the UI can show the result for confirmation.

const SET_HEADER = /^\s*questions?\s+(\d{1,3})\s*(?:[-–—]|to|and)\s*(\d{1,3})\s+(?:refer|are based)\b/i;
const QUESTION_START = /^\s*(?:question\s*|câu\s*|q)?(\d{1,3})\s*[.):]\s*(.*)$/i;
const OPTION_LINE = /^\s*\(?([A-Da-d])\s*[.)]\s*(.*)$/;
const INLINE_OPTION = /\(([A-D])\)\s*/g;
const ANSWER_LINE = /^\s*(?:answer|đáp án|key|correct answer)\s*[:\-–]?\s*\(?([A-D])\)?\s*\.?\s*$/i;
const ANSWER_KEY_BLOCK = /^\s*(?:answer key|answers|đáp án|key)\s*[:\-–]?\s*((?:\d{1,3}\s*[-.:)]?\s*\(?[A-D]\)?[\s,;]*){1,})$/i;
const ANSWER_PAIR = /(\d{1,3})\s*[-.:)]?\s*\(?([A-D])\)?/g;
const BLANK = /-{2,}\s*\[?\(?\d{1,3}\)?\]?\s*-{2,}|_{3,}\s*\(?\d{1,3}\)?|\(\d{1,3}\)\s*_{2,}/;

const clean = value => String(value || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

function splitInlineOptions(text) {
  const matches = [...text.matchAll(INLINE_OPTION)];
  if (matches.length < 2) return null;
  const options = {};
  matches.forEach((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    options[match[1]] = clean(text.slice(match.index + match[0].length, end));
  });
  return { stem: clean(text.slice(0, matches[0].index)), options };
}

function parseAnswerKey(line) {
  const match = line.match(ANSWER_KEY_BLOCK);
  if (!match) return null;
  const pairs = {};
  for (const pair of match[1].matchAll(ANSWER_PAIR)) pairs[Number(pair[1])] = pair[2].toUpperCase();
  return Object.keys(pairs).length ? pairs : null;
}

function detectContent(rawText) {
  const lines = String(rawText || '').replace(/\r\n?/g, '\n').split('\n');
  const groups = [];
  const answerKey = {};
  let group = null;
  let question = null;

  const newGroup = header => { group = { header: header || null, passage: [], questions: [] }; groups.push(group); question = null; };
  const ensureGroup = () => { if (!group) newGroup(); };

  for (const rawLine of lines) {
    const line = clean(rawLine);
    if (!line) continue;

    const key = parseAnswerKey(line);
    if (key) { Object.assign(answerKey, key); continue; }

    if (SET_HEADER.test(line)) { newGroup(line); continue; }

    const answer = line.match(ANSWER_LINE);
    if (answer && question) { question.answerKey = answer[1].toUpperCase(); continue; }

    const option = line.match(OPTION_LINE);
    if (option && question) {
      const inline = splitInlineOptions(line);
      if (inline && !inline.stem) Object.assign(question.options, inline.options);
      else question.options[option[1].toUpperCase()] = clean(option[2]);
      continue;
    }

    const start = line.match(QUESTION_START);
    if (start && !BLANK.test(line)) {
      // A question that follows a finished one inside a group whose passage came after it starts a new group.
      ensureGroup();
      const inline = splitInlineOptions(start[2]);
      question = { number: Number(start[1]), stem: inline ? inline.stem : clean(start[2]), options: inline ? inline.options : {}, answerKey: null };
      group.questions.push(question);
      continue;
    }

    if (question && Object.keys(question.options).length === 0) { question.stem = clean(`${question.stem} ${line}`); continue; }

    // Plain text after a completed question block begins the next passage.
    if (group && group.questions.length) newGroup();
    ensureGroup();
    group.passage.push(rawLine.trim());
  }

  const segments = [];
  const warnings = [];
  for (const current of groups) {
    const passageText = current.passage.join('\n').trim();
    let passageIndex = null;
    if (passageText) {
      passageIndex = segments.length;
      segments.push({
        kind: 'passage', text: passageText,
        meta: { header: current.header, hasBlanks: BLANK.test(passageText), sentenceCount: countSentences(passageText) },
      });
    }
    if (current.questions.length) {
      const questions = current.questions.map(item => ({ ...item, answerKey: item.answerKey || answerKey[item.number] || null }));
      segments.push({
        kind: 'question_set', text: '',
        meta: { header: current.header, passageIndex, part: guessPart(passageText, questions) },
        questions,
      });
      for (const item of questions) {
        const optionCount = Object.keys(item.options).length;
        if (optionCount < 3) warnings.push({ code: 'MISSING_OPTIONS', number: item.number, message: `Câu ${item.number}: chỉ nhận được ${optionCount} đáp án.` });
        if (!item.answerKey) warnings.push({ code: 'MISSING_ANSWER', number: item.number, message: `Câu ${item.number}: chưa có đáp án đúng.` });
      }
    }
  }

  const questionCount = segments.reduce((sum, segment) => sum + (segment.questions?.length || 0), 0);
  const passageCount = segments.filter(segment => segment.kind === 'passage').length;
  if (!segments.length) warnings.push({ code: 'EMPTY', message: 'Chưa có nội dung.' });
  return {
    segments, warnings,
    summary: { passageCount, questionCount, questionRange: questionRange(segments) },
    confidence: !segments.length ? 0 : warnings.some(item => item.code === 'MISSING_OPTIONS') ? 0.5 : 0.9,
    title: suggestTitle(segments),
  };
}

function countSentences(text) {
  return text.split(/\n+/).flatMap(part => part.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map(clean).filter(Boolean).length;
}

function guessPart(passageText, questions) {
  if (passageText && BLANK.test(passageText)) return 6;
  if (passageText) return 7;
  if (questions.every(item => /_{2,}|-{3,}/.test(item.stem))) return 5;
  return null;
}

function questionRange(segments) {
  const numbers = segments.flatMap(segment => (segment.questions || []).map(item => item.number));
  if (!numbers.length) return null;
  return { from: Math.min(...numbers), to: Math.max(...numbers) };
}

function suggestTitle(segments) {
  const passage = segments.find(segment => segment.kind === 'passage');
  const first = passage ? passage.text.split('\n').map(clean).find(Boolean) : null;
  if (first) return first.length > 80 ? `${first.slice(0, 77)}…` : first;
  const range = questionRange(segments);
  return range ? `Câu ${range.from}–${range.to}` : 'Học liệu mới';
}

module.exports = { detectContent, countSentences };
