const assert = require('node:assert/strict');
const test = require('node:test');

const {
  STT_PROFILES,
  STT_OUTPUT_STATUSES,
  resolveAnswerSttProfile,
  buildAnswerSttInput,
} = require('../src/modules/iig-ai-scoring/answerSttContract');

function aiInput(scorerType, overrides = {}) {
  return {
    schemaVersion: 1,
    question: {
      scorerType,
      questionText: 'What can you tell me about the schedule?',
      promptText: 'Please answer the question.',
      contextText: 'The class starts at 9 AM.',
      ...overrides.question,
    },
    response: { type: 'audio', audio: { id: 'student-audio' } },
    media: {
      questionImages: [{ id: 'question-image' }],
      contextImages: [{ id: 'context-image' }],
      ...overrides.media,
    },
    ...overrides.root,
  };
}

test('answer STT profiles are based on transcription behavior, not score group', () => {
  assert.equal(resolveAnswerSttProfile('READ_TEXT_ALOUD'), STT_PROFILES.READ_ALOUD_GUIDED);
  for (const scorerType of [
    'DESCRIBE_PICTURE',
    'RESPOND_TO_QUESTIONS',
    'RESPOND_USING_INFORMATION',
    'EXPRESS_AN_OPINION',
  ]) {
    assert.equal(resolveAnswerSttProfile(scorerType), STT_PROFILES.FREE_SPEECH);
  }
});

test('RTA payload uses the official passage only as guided reference', () => {
  const payload = buildAnswerSttInput({
    aiInput: aiInput('READ_TEXT_ALOUD', {
      question: {
        contextText: 'Have you ever wondered what makes the bakery famous?',
        questionText: 'This must not be used.',
      },
    }),
    questionCode: 's_q1',
    audioUrl: 'https://media.example.test/student-q1.mp3?signature=short-lived',
  });
  assert.deepEqual(payload, {
    schema_version: 1,
    stt_profile: 'READ_ALOUD_GUIDED',
    question_code: 'S_Q1',
    reference_text: 'Have you ever wondered what makes the bakery famous?',
    question_text: '',
    context_text: '',
    audio_url: 'https://media.example.test/student-q1.mp3?signature=short-lived',
  });
});

test('free-speech payload passes text as lexical hints without media or answer content', () => {
  const payload = buildAnswerSttInput({
    aiInput: aiInput('RESPOND_USING_INFORMATION'),
    questionCode: 'S_Q8',
    audioUrl: 'https://media.example.test/student-q8.mp3',
  });
  assert.equal(payload.stt_profile, 'FREE_SPEECH');
  assert.equal(payload.reference_text, '');
  assert.equal(payload.question_text, 'What can you tell me about the schedule?');
  assert.equal(payload.context_text, 'The class starts at 9 AM.');
  assert.equal(Object.hasOwn(payload, 'media'), false);
  assert.equal(Object.hasOwn(payload, 'response'), false);
  assert.equal(JSON.stringify(payload).includes('question-image'), false);
  assert.equal(JSON.stringify(payload).includes('context-image'), false);
});

test('Describe a Picture never sends image-derived context to STT', () => {
  const payload = buildAnswerSttInput({
    aiInput: aiInput('DESCRIBE_PICTURE'),
    questionCode: 'S_Q3',
    audioUrl: 'https://media.example.test/student-q3.mp3',
  });
  assert.equal(payload.stt_profile, 'FREE_SPEECH');
  assert.equal(payload.context_text, '');
  assert.equal(JSON.stringify(payload).includes('question-image'), false);
});

test('contract rejects unsupported types, missing RTA passages and insecure audio URLs', () => {
  assert.throws(
    () => resolveAnswerSttProfile('WRITE_OPINION_ESSAY'),
    error => error.code === 'IIG_AI_ANSWER_STT_SCORER_UNSUPPORTED'
  );
  assert.throws(
    () => buildAnswerSttInput({
      aiInput: aiInput('READ_TEXT_ALOUD', { question: { contextText: '' } }),
      questionCode: 'S_Q1',
      audioUrl: 'https://media.example.test/q1.mp3',
    }),
    error => error.code === 'IIG_AI_ANSWER_STT_REFERENCE_MISSING'
  );
  assert.throws(
    () => buildAnswerSttInput({
      aiInput: aiInput('RESPOND_TO_QUESTIONS'),
      questionCode: 'S_Q5',
      audioUrl: 'http://media.example.test/q5.mp3',
    }),
    error => error.code === 'IIG_AI_ANSWER_STT_AUDIO_URL_INVALID'
  );
});

test('output contract exposes one stable status enum for every Dify branch', () => {
  assert.deepEqual(STT_OUTPUT_STATUSES, [
    'SUCCESS',
    'NO_SPEECH',
    'WRONG_LANGUAGE_VI',
    'WRONG_LANGUAGE_OTHER',
    'UNINTELLIGIBLE',
    'FAILED',
  ]);
});
