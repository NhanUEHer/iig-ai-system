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

test('translation validator checks sentence count and preserved numbers', () => {
  const issues = validate('passage_translation', { sentences: [{ en: sentences[0], vi: 'Ông Howard đề xuất ngày tháng Ba.' }] }, { sentences }).issues.map(issue => issue.code);
  assert.deepEqual(issues.sort(), ['NUMBER_MISMATCH', 'SENTENCE_COUNT']);
});
