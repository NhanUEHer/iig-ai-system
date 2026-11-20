const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/modules/content-studio/generation/validators');
const mock = require('../src/modules/content-studio/generation/mockProvider');
const { splitSentences } = require('../src/modules/content-studio/detect/detectContent');

const passage = 'Mr. Howard suggests 20 March for the meeting. Our finance advisor will also attend.';
const sentences = splitSentences(passage);
const question = { number: 2, stem: 'When is the meeting?', options: { A: '8 March', B: '10 March', C: '18 March', D: '20 March' }, answerKey: 'D' };

test('mock provider output passes every validator', async () => {
  const context = { passage, sentences, question };
  for (const type of ['passage_translation', 'vocab', 'dictionary', 'question_pack']) {
    const content = await mock.generate(type, context);
    assert.deepEqual(validate(type, content, context).issues, [], type);
  }
});

test('question pack validator flags leaks, wrong answers, fake quotes and banned words', () => {
  const content = {
    translation: { stem: 'x', options: { A: 'a', B: 'b', C: 'c', D: 'd' } },
    hint: 'Đáp án là D vì cuộc họp vào 20 March.',
    explanation: 'Đáp án đúng là (B). Trong bài có đề cập: “The meeting was moved to next week by the board.” (A) sai.',
    note: 'Đây là câu bẫy.',
  };
  const codes = validate('question_pack', content, { question, passage }).issues.map(issue => issue.code).sort();
  assert.deepEqual(codes, ['ANSWER_MISMATCH', 'BANNED_WORDS', 'HINT_LEAKS_ANSWER', 'QUOTE_NOT_IN_PASSAGE', 'WRONG_OPTIONS_NOT_EXPLAINED']);
});

test('translation validator checks text is from the passage, covers it, and keeps numbers', () => {
  const passage = sentences.join(' ');
  const issues = validate('passage_translation', { sentences: [{ en: sentences[0], vi: 'Ông Howard đề xuất ngày tháng Ba.' }, { en: 'Invented sentence here.', vi: 'Bịa.' }] }, { passage }).issues.map(issue => issue.code);
  assert.deepEqual(issues.sort(), ['MISSING_TEXT', 'NUMBER_MISMATCH', 'SENTENCE_NOT_IN_PASSAGE']);
  const full = validate('passage_translation', { sentences: sentences.map(en => ({ en, vi: `${en.match(/\d+/g)?.join(' ') || ''} dịch` })) }, { passage }).issues;
  assert.deepEqual(full, []);
});

test('sample letter fixtures pass every validator', async () => {
  const { detectContent } = require('../src/modules/content-studio/detect/detectContent');
  const fs = require('node:fs');
  const text = fs.readFileSync(require('node:path').join(__dirname, 'fixtures/content-studio-letter.txt'), 'utf8');
  const result = detectContent(text);
  const passageText = result.segments[0].text;
  const ctx = { passage: passageText, sentences: splitSentences(passageText) };
  for (const type of ['passage_translation', 'vocab', 'dictionary']) {
    const content = await mock.generate(type, ctx);
    assert.doesNotMatch(JSON.stringify(content), /Bản dịch mẫu|nghĩa của/, type);
    assert.deepEqual(validate(type, content, ctx).issues, [], type);
  }
  for (const question of result.segments[1].questions) {
    const content = await mock.generate('question_pack', { ...ctx, question });
    assert.deepEqual(validate('question_pack', content, { question, passage: passageText }).issues, [], `Q${question.number}`);
  }
});

test('translation check ignores rewritten Part 6 blank markers', () => {
  const issues = validate('passage_translation', { sentences: [{ en: 'Please ______ the form by Friday.', vi: 'Vui lòng ______ biểu mẫu trước thứ Sáu.' }] }, { passage: 'Please ---[131]--- the form by Friday.' }).issues;
  assert.deepEqual(issues, []);
});

test('question pack quotes may come from the image description', () => {
  const question = { number: 1, stem: 'Which line shows the sender?', options: { A: 'S1', B: 'S2', C: 'S3', D: 'S4' }, answerKey: 'B' };
  const content = { translation: 'x', hint: 'Nhìn vào hình.', note: 'Dạng câu hỏi đồ họa.', explanation: 'Đáp án đúng là (B). Dòng S2 là “From: Rebecca Lin, Facilities Manager”. (A) sai, (C) sai, (D) sai.' };
  const passage = 'M: The second card shows who sent the memo.';
  assert.deepEqual(validate('question_pack', content, { question, passage }).issues.map(i => i.code), ['QUOTE_NOT_IN_PASSAGE']);
  assert.deepEqual(validate('question_pack', content, { question, passage, imageDescription: '[Image 1] S2: From: Rebecca Lin, Facilities Manager' }).issues, []);
});
