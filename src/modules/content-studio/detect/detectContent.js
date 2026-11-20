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

// Section labels and test directions copied with the questions are not passage text.
const SECTION_LABEL = /^\s*(?:part|phần)\s*[1-7]\s*[:.\-–—]?\s*(?:[A-Za-zÀ-ỹ ]{0,40})?$/i;
const DIRECTIONS = /^\s*directions?\s*[:.]/i;
// Part 1 stems are only the instruction to look at the photo; the question is the photo itself.
// A question block without a number: a line that is just "Question" / "Câu hỏi" (optionally "Question: stem").
// "Question everything…" (no separator) stays text.
const QUESTION_LABEL = /^\s*(?:question|câu\s*hỏi)\s*(?:[:.)\-–]\s*(.*))?$/i;
const PHOTO_STEM = /^\s*look at the (?:picture|photo(?:graph)?)\b.*$/i;

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
  let skippedDirections = false;

  // Unnumbered questions take the next number after the last one seen (1 when none).
  let lastNumber = 0;
  const startQuestion = (number, stem, options = {}) => {
    ensureGroup();
    question = { number, stem, options, answerKey: null };
    lastNumber = Math.max(lastNumber, number);
    group.questions.push(question);
  };
  const newGroup = header => { group = { header: header || null, passage: [], questions: [] }; groups.push(group); question = null; };
  const ensureGroup = () => { if (!group) newGroup(); };

  const nextLine = index => { for (let next = index + 1; next < lines.length; next += 1) { const text = clean(lines[next]); if (text) return text; } return ''; };

  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = clean(rawLine);
    if (!line) continue;

    const key = parseAnswerKey(line);
    if (key) { Object.assign(answerKey, key); continue; }

    if (SET_HEADER.test(line)) { skippedDirections = false; newGroup(line); continue; }
    // Drop section labels and the directions paragraph; a directions sentence that wraps
    // onto the next line is dropped only until it ends with . ! or ?
    const unfinished = text => !/[.!?]["')\]]*$/.test(text);
    if (SECTION_LABEL.test(line)) { skippedDirections = false; continue; }
    if (DIRECTIONS.test(line)) { skippedDirections = unfinished(line); continue; }
    if (skippedDirections && !QUESTION_START.test(line)) { skippedDirections = unfinished(line); continue; }
    skippedDirections = false;

    const answer = line.match(ANSWER_LINE);
    if (answer && question) { question.answerKey = answer[1].toUpperCase(); continue; }

    const option = line.match(OPTION_LINE);
    // "(A) …" with no open question (or after a complete one) starts an unnumbered question — only in a set
    // without a passage and only when option (B) follows, so a lettered list inside a passage
    // ("A. Registration fee / B. Late payment") stays passage text. With a passage, write "Question" first.
    const optionsFollow = () => Boolean(splitInlineOptions(line)) || /^\(?B\s*[.)]/i.test(nextLine(lineIndex));
    if (option && option[1].toUpperCase() === 'A' && (!question || question.options.A)
      && !(group && group.passage.length) && optionsFollow()) {
      startQuestion(lastNumber + 1, '');
    }
    if (option && question) {
      const inline = splitInlineOptions(line);
      if (inline && !inline.stem) Object.assign(question.options, inline.options);
      else question.options[option[1].toUpperCase()] = clean(option[2]);
      continue;
    }

    const start = line.match(QUESTION_START);
    if (start && !BLANK.test(line)) {
      // A question that follows a finished one inside a group whose passage came after it starts a new group.
      const inline = splitInlineOptions(start[2]);
      startQuestion(Number(start[1]), inline ? inline.stem : clean(start[2]), inline ? inline.options : {});
      continue;
    }

    const label = line.match(QUESTION_LABEL);
    if (label) {
      const inline = splitInlineOptions(label[1] || '');
      startQuestion(lastNumber + 1, inline ? inline.stem : clean(label[1] || ''), inline ? inline.options : {});
      continue;
    }

    if (question && Object.keys(question.options).length === 0) { question.stem = clean(`${question.stem} ${line}`); continue; }

    // Plain text after a completed question block begins the next passage.
    if (group && group.questions.length) newGroup();
    ensureGroup();
    group.passage.push(rawLine.trim());
  }

  for (const current of groups) for (const item of current.questions) if (PHOTO_STEM.test(item.stem)) item.stem = '';

  const segments = [];
  const warnings = [];
  for (const current of splitQuestionOnlyRuns(groups)) {
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
        meta: { header: current.header, passageIndex, questionOnly: passageIndex === null, part: guessPart(passageText, questions) },
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

// Without a passage, photo questions (no stem) and question–response items (stem, A–C) pasted
// together are different sets: split them into runs so each set gets its own part and images.
function splitQuestionOnlyRuns(groups) {
  return groups.flatMap(group => {
    if (group.passage.length || group.questions.length < 2) return [group];
    const runs = [];
    for (const item of group.questions) {
      const photo = !item.stem;
      const last = runs[runs.length - 1];
      if (last && last.photo === photo) last.questions.push(item);
      else runs.push({ photo, questions: [item] });
    }
    return runs.map((run, index) => ({ header: index === 0 ? group.header : null, passage: [], questions: run.questions }));
  });
}

const ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|Prof|St|No|Inc|Co|Ltd|Jr|Sr|vs|etc|e\.g|i\.e|a\.m|p\.m)\.|\b(?:[A-Z]\.){2,}/gi;

function splitSentences(text) {
  // Lines without terminal punctuation (greetings, signatures, titles) are not sentences.
  return text.split(/\n+/).map(clean).filter(line => /[.!?]["')\]]*$/.test(line))
    .flatMap(line => line.replace(ABBREVIATIONS, match => match.replace(/\./g, '\u0001'))
      .split(/(?<=[.!?]["')\]]*)\s+(?=["'(\[]?[A-Z0-9])/))
    .map(sentence => clean(sentence.replace(/\u0001/g, '.'))).filter(sentence => /\p{L}{2,}/u.test(sentence));
}

const countSentences = text => splitSentences(text).length;

function guessPart(passageText, questions) {
  if (passageText && BLANK.test(passageText)) return 6;
  if (passageText) return 7;
  // Question-only sets (no passage): Part 1 = options only (photo), Part 2 = three options, Part 5 = blank in stem.
  if (!questions.length) return null;
  if (questions.every(item => /_{2,}|-{3,}/.test(item.stem))) return 5;
  if (questions.every(item => !item.stem && Object.keys(item.options).length === 4)) return 1;
  if (questions.every(item => Object.keys(item.options).length === 3 && !item.options.D)) return 2;
  return null;
}

function questionRange(segments) {
  const numbers = segments.flatMap(segment => (segment.questions || []).map(item => item.number));
  if (!numbers.length) return null;
  return { from: Math.min(...numbers), to: Math.max(...numbers) };
}

const DOC_TYPE = /following\s+([a-z\- ]+?)(?:\s+and\s+[a-z\- ]+)?\s*\.?$/i;

function suggestTitle(segments) {
  const range = questionRange(segments);
  const rangeLabel = range ? (range.from === range.to ? `Câu ${range.from}` : `Câu ${range.from}–${range.to}`) : null;
  const header = segments.find(segment => segment.meta?.header)?.meta.header;
  const type = header?.match(DOC_TYPE)?.[1]?.trim();
  if (type) {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    return rangeLabel ? `${label} · ${rangeLabel}` : label;
  }
  const passage = segments.find(segment => segment.kind === 'passage');
  const first = passage ? passage.text.split('\n').map(clean).find(Boolean)?.replace(/[,:;]+$/, '') : null;
  if (first) return first.length > 80 ? `${first.slice(0, 77)}…` : first;
  return rangeLabel || 'Học liệu mới';
}

module.exports = { detectContent, countSentences, splitSentences };
