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
