const assert = require('node:assert/strict');
const test = require('node:test');

const transcribeAnswer = require('../src/modules/scoring/transcribeAnswer');
const parseTranscription = require('../src/modules/scoring/transcriptionParser');
const { resolveSttAudio } = require('../src/modules/scoring/sttAudioResolver');

test('transcription parser supports direct, JSON-wrapped, and fallback outputs', () => {
  assert.equal(parseTranscription({ transcribe: 'direct' }), 'direct');
  assert.equal(parseTranscription({ result: 'prefix {"transcribe":"wrapped"} suffix' }), 'wrapped');
  assert.equal(parseTranscription({ value: 1 }), '{"value":1}');
});

function dependenciesFor(targetType, writes) {
  const answer = {
    id: 'answer-1',
    section: 'Speaking',
    question_no: 8,
    prompt_text: 'Prompt',
    student_audio_file_id: 'student-file',
    question_audio_file_id: 'question-file',
    context_audio_file_id: 'context-file'
  };
  return {
    submissions: {
      findAnswerById: async () => answer,
      updateQuestionName: async (...args) => writes.push(['question', ...args]),
      updateContextText: async (...args) => writes.push(['context', ...args])
    },
    evaluations: {
      findAudioState: async () => null,
      upsertTranscription: async value => writes.push(['student_answer', value])
    },
    selectAgent: async () => ({ api_endpoint: 'https://dify.example', api_key: 'key' }),
    tokens: { ensureFreshToken: async () => 'token' },
    iig: {
      getMigratedFileUrl: async fileId => `https://iig.example/${targetType}/${fileId}`
    },
    storage: { isR2Key: () => false, getSignedAudioUrl: async () => null },
    dify: {
      transcribeSpeech: async (endpoint, key, url, fileKey) => ({
        data: { outputs: { result: `{"transcribe":"${fileKey}:${url}"}` } }
      })
    },
    now: () => new Date('2026-08-08T00:00:00Z')
  };
}

for (const targetType of ['student_answer', 'question', 'context']) {
  test(`transcribeAnswer resolves and persists ${targetType}`, async () => {
    const writes = [];
    const result = await transcribeAnswer(
      { answerId: 'answer-1', targetType },
      dependenciesFor(targetType, writes)
    );

    assert.equal(result.targetType, targetType);
    assert.equal(writes[0][0], targetType);
    assert.match(result.transcribe, new RegExp(targetType === 'student_answer' ? 'student_audio' : `audio_${targetType}`));
  });
}

test('transcribeAnswer rejects unsupported targets before external calls', async () => {
  await assert.rejects(
    () => transcribeAnswer({ answerId: 'answer-1', targetType: 'invalid' }),
    error => error.statusCode === 400
  );
});

test('STT prefers cleaned audio and does not request the original file', async () => {
  let originalRequests = 0;
  const url = await resolveSttAudio({
    answer: { id: 'answer-1', student_audio_file_id: 'original-file' },
    targetType: 'student_answer'
  }, {
    evaluations: { findAudioState: async () => ({ cleaned_audio_url: 'r2:cleaned.mp3' }) },
    storage: { isR2Key: () => true, getSignedAudioUrl: async () => 'https://r2.example/cleaned.mp3' },
    tokens: { ensureFreshToken: async () => 'token' },
    iig: { getMigratedFileUrl: async () => { originalRequests += 1; return 'https://iig.example/original.mp3'; } }
  });
  assert.equal(url, 'https://r2.example/cleaned.mp3');
  assert.equal(originalRequests, 0);
});

test('STT falls back to original audio when cleaned audio is unavailable', async () => {
  const url = await resolveSttAudio({
    answer: { id: 'answer-1', student_audio_file_id: 'original-file' },
    targetType: 'student_answer'
  }, {
    evaluations: { findAudioState: async () => ({ cleaned_audio_url: null }) },
    storage: { isR2Key: () => false },
    tokens: { ensureFreshToken: async () => 'token' },
    iig: { getMigratedFileUrl: async fileId => `https://iig.example/${fileId}` }
  });
  assert.equal(url, 'https://iig.example/original-file');
});
