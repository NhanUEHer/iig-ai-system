const test = require('node:test');
const assert = require('node:assert/strict');
const { detectContent } = require('../src/modules/content-studio/detect/detectContent');
const service = require('../src/modules/content-studio/contentStudioService');

const LETTER = `Dear Miss Joseph,
I am writing this letter in reference to your proposal which was sent to HF Manufacturers on 8th March 2021. I am pleased to inform you that the Vice President would like to meet with the representatives.
Mr. Howard will be away until 18th March so he suggests 20th March.

1. What is the purpose of the letter?
(A) To ask for details of a proposal
(B) To arrange a business meeting
(C) To request a business proposal
(D) To agree on a mutual deal
2. What is the proposed date for the meeting?
A. 8th March
B. 10th March
C. 18th March
D. 20th March
Answer: D

Answer key: 1B`;

test('detects passage followed by questions, options and answer keys', () => {
  const result = detectContent(LETTER);
  assert.deepEqual(result.segments.map(s => s.kind), ['passage', 'question_set']);
  assert.match(result.segments[0].text, /^Dear Miss Joseph/);
  const [q1, q2] = result.segments[1].questions;
  assert.equal(q1.stem, 'What is the purpose of the letter?');
  assert.equal(q1.options.B, 'To arrange a business meeting');
  assert.equal(q1.answerKey, 'B');
  assert.equal(q2.answerKey, 'D');
  assert.equal(result.segments[1].meta.part, 7);
  assert.deepEqual(result.summary, { passageCount: 1, questionCount: 2, questionRange: { from: 1, to: 2 } });
  assert.equal(result.warnings.length, 0);
  assert.equal(result.title, 'Dear Miss Joseph');
});

test('splits multiple sets on "Questions x-y refer to" headers and supports inline options', () => {
  const text = `Questions 147-148 refer to the following notice.
The library will close early on Friday.
147. When will the library close? (A) Monday (B) Tuesday (C) Thursday (D) Friday
148. Who wrote it? (A) A guest (B) A librarian (C) A student (D) A mayor
Questions 149-150 refer to the following e-mail.
Please send the report by noon.
149. What is requested?
(A) A report (B) A call (C) A visit (D) A fee
150. By when?
(A) Noon (B) Night (C) Monday (D) Today`;
  const result = detectContent(text);
  assert.deepEqual(result.segments.map(s => s.kind), ['passage', 'question_set', 'passage', 'question_set']);
  assert.equal(result.segments[1].questions[0].options.D, 'Friday');
  assert.equal(result.segments[1].questions[0].stem, 'When will the library close?');
  assert.equal(result.segments[3].questions[0].options.C, 'A visit');
  assert.equal(result.segments[3].meta.passageIndex, 2);
  assert.equal(result.warnings.filter(w => w.code === 'MISSING_ANSWER').length, 4);
});

test('marks Part 6 when the passage contains numbered blanks', () => {
  const result = detectContent(`Thank you for your order. We ---131--- it today.\n131. (A) ship (B) shipped (C) shipping (D) ships`);
  assert.equal(result.segments[1].meta.part, 6);
  assert.equal(result.segments[0].meta.hasBlanks, true);
});

test('passage-only text yields a single passage segment', () => {
  const result = detectContent('Just a passage. With two sentences.');
  assert.deepEqual(result.segments.map(s => s.kind), ['passage']);
  assert.equal(result.segments[0].meta.sentenceCount, 2);
});

test('rejects invalid answers and empty sources', () => {
  assert.throws(() => service.detect('   '), /dán nội dung/);
  assert.throws(() => service.normalizeSegments([{ kind: 'question_set', questions: [{ number: 1, answerKey: 'E' }] }]), /A–D/);
});

test('extracts paragraph text from a DOCX package', async () => {
  const JSZip = require('jszip');
  const { docxToText } = require('../src/modules/content-studio/detect/docxText');
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document><w:body><w:p><w:pPr/><w:r><w:t>Dear &amp; Co,</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">1. Why </w:t></w:r><w:r><w:t>now?</w:t></w:r></w:p></w:body></w:document>');
  const text = await docxToText(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.equal(text, 'Dear & Co,\n1. Why now?');
  await assert.rejects(docxToText(Buffer.from('nope')), /DOCX/);
});

test('suggests a title from the set header and counts only real sentences', () => {
  const result = detectContent(`Questions 1-2 refer to the following letter.
Dear Ms. Joseph,
We met on 8 March at 10:00 A.M. in the office. Please call 555-0142!
Sincerely,
Daniel Brooks
1. Why? (A) a (B) b (C) c (D) d
2. When? (A) a (B) b (C) c (D) d`);
  assert.equal(result.title, 'Letter · Câu 1–2');
  assert.equal(result.segments[0].meta.sentenceCount, 2);
});

test('keeps only known generation tasks that match detected content and normalizes vocab settings', () => {
  const segments = service.normalizeSegments([{ kind: 'passage', text: 'Hi.' }]);
  assert.deepEqual(service.normalizeTasks({ passage: ['translation', 'vocab', 'x', 'vocab'], question: ['hint'], vocab: { level: 700, mode: 'phrase_focused' } }, segments), {
    passage: ['translation', 'vocab'], question: [], vocab: { level: 700, mode: 'phrase_focused' },
  });
  assert.deepEqual(service.normalizeTasks({ passage: ['vocab'], vocab: { level: 999, mode: 'unknown' } }, segments), {
    passage: ['vocab'], question: [], vocab: { level: 650, mode: 'balanced' },
  });
});

test('question-only Part 2 input yields questions with no passage', () => {
  const result = detectContent(`7. Where is the meeting?\n(A) In room 3.\n(B) At 2 o'clock.\n(C) Yes, I will.\nAnswer: A\n8. Who wrote the report?\n(A) Ms. Kim did.\n(B) It's on my desk.\n(C) Last week.\nAnswer: A`);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].kind, 'question_set');
  assert.equal(result.segments[0].meta.passageIndex, null);
  assert.equal(result.segments[0].meta.questionOnly, true);
  assert.equal(result.segments[0].meta.part, 2);
  assert.deepEqual(result.segments[0].questions.map(q => [q.number, q.answerKey]), [[7, 'A'], [8, 'A']]);
  assert.equal(result.warnings.length, 0);
});

test('Part 1 options-only questions are recognised without a passage', () => {
  const result = detectContent(`1.\n(A) A man is typing.\n(B) A woman is reading.\n(C) They are walking.\n(D) Chairs are stacked.\nAnswer: B`);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].meta.part, 1);
  assert.equal(result.segments[0].questions[0].stem, '');
});

test('Part 1: section label, directions and "Look at the picture" stems are not passage text', () => {
  const options = '(A) A man is typing.\n(B) A woman is reading.\n(C) They are walking.\n(D) Chairs are stacked.';
  const result = detectContent(`PART 1\nDirections: For each question in this part, you will hear four\nstatements about a picture in your test book.\n1. Look at the picture marked number 1 in your test book.\n${options}\n2.\n${options}\nAnswer key: 1-A 2-D`);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].meta.part, 1);
  assert.equal(result.segments[0].meta.questionOnly, true);
  assert.deepEqual(result.segments[0].questions.map(q => [q.number, q.stem, q.answerKey]), [[1, '', 'A'], [2, '', 'D']]);
});

test('photo questions and question–response items pasted together become separate sets', () => {
  const result = detectContent(`6.\n(A) a\n(B) b\n(C) c\n(D) d\nAnswer: A\n7. Where is the meeting?\n(A) In room 3.\n(B) At 2.\n(C) Yes.\nAnswer: A`);
  assert.deepEqual(result.segments.map(segment => [segment.kind, segment.meta.part, segment.questions.map(q => q.number)]), [['question_set', 1, [6]], ['question_set', 2, [7]]]);
});

test('directions before a reading passage keep the passage', () => {
  const result = detectContent('Directions: In this part you will read a selection of texts.\nDear Ms. Kim,\nThank you for your order. It will ship on Monday.\n147. When will the order ship?\n(A) Monday\n(B) Tuesday\n(C) Friday\n(D) Sunday\nAnswer: A');
  assert.equal(result.segments[0].kind, 'passage');
  assert.match(result.segments[0].text, /^Dear Ms\. Kim/);
  assert.equal(result.segments[1].meta.part, 7);
});

test('unnumbered "Question" blocks and bare option lists become numbered questions', () => {
  const options = '(A) She is checking her backpack.\n(B) She is putting some items into a shopping cart.\n(C) She is choosing some clothes.\n(D) She is pointing at a mirror.';
  const blocks = detectContent(`Question\n${options}\nKey C\nQuestion\n${options}\nKey A`);
  assert.deepEqual(blocks.segments.map(segment => segment.kind), ['question_set']);
  assert.deepEqual(blocks.segments[0].questions.map(q => [q.number, q.stem, Object.keys(q.options).join(''), q.answerKey]), [[1, '', 'ABCD', 'C'], [2, '', 'ABCD', 'A']]);
  const bare = detectContent(`${options}\nKey C\n${options}\nKey B`);
  assert.deepEqual(bare.segments[0].questions.map(q => [q.number, q.answerKey]), [[1, 'C'], [2, 'B']]);
  const withStem = detectContent('Question: Where is the meeting?\n(A) In room 3.\n(B) At 2.\n(C) Yes.\nKey: A');
  assert.deepEqual(withStem.segments[0].questions.map(q => [q.number, q.stem, q.answerKey]), [[1, 'Where is the meeting?', 'A']]);
});

test('"(A)" inside a passage and sentences starting with "Question" stay passage text', () => {
  const form = detectContent('The form has two parts.\n(A) Personal details must be complete.\nPlease sign below.\n1. What is required?\n(A) x\n(B) y\n(C) z\n(D) w\nAnswer: A');
  assert.deepEqual(form.segments.map(segment => segment.kind), ['passage', 'question_set']);
  assert.match(form.segments[0].text, /\(A\) Personal details/);
  const sentence = detectContent('Question everything you read in the news.\n1. Why?\n(A) a\n(B) b\n(C) c\n(D) d\nAnswer: B');
  assert.equal(sentence.segments[0].kind, 'passage');
});
