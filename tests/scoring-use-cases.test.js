const assert = require('node:assert/strict');
const test = require('node:test');

const cleanAnswerAudio = require('../src/modules/scoring/cleanAnswerAudio');
const { cleanAnswersAudio } = require('../src/modules/scoring/cleanAnswerAudio');
const saveTeacherNote = require('../src/modules/scoring/saveTeacherNote');

test('saveTeacherNote validates answer id and delegates persistence', async () => {
  await assert.rejects(() => saveTeacherNote({}), error => error.statusCode === 400);

  const calls = [];
  await saveTeacherNote(
    { answerId: 'answer-1', teacherNote: 'Good work' },
    { evaluationRepository: { upsertTeacherNote: async (...args) => calls.push(args) } }
  );
  assert.deepEqual(calls, [['answer-1', 'Good work']]);
});

test('cleanAnswerAudio processes local output and persists its public URL', async () => {
  const persisted = [];
  const result = await cleanAnswerAudio({
    answerId: 'answer-2',
    method: 'dsp',
    publicOrigin: 'http://localhost:5000'
  }, {
    submissions: {
      findAnswerById: async () => ({ id: 'answer-2', student_audio_file_id: 'audio-2' })
    },
    evaluations: {
      upsertCleanedAudio: async (...args) => persisted.push(args)
    },
    tokens: { ensureFreshToken: async () => 'Bearer token' },
    iig: { getMigratedFileUrl: async () => 'https://iig.example/audio.wav' },
    cleaner: {
      cleanAudio: async () => ({ urlPath: '/cleaned-audio/audio-2.mp3', methodUsed: 'dsp' })
    },
    storage: {
      isR2Key: () => false,
      getSignedAudioUrl: async () => null
    }
  });

  assert.deepEqual(persisted, [['answer-2', 'http://localhost:5000/cleaned-audio/audio-2.mp3']]);
  assert.equal(result.cleanedAudioUrl, 'http://localhost:5000/cleaned-audio/audio-2.mp3');
  assert.equal(result.methodUsed, 'dsp');
});

test('cleanAnswerAudio stores R2 key but returns a signed playback URL', async () => {
  const persisted = [];
  const result = await cleanAnswerAudio({ answerId: 'answer-3', publicOrigin: '' }, {
    submissions: {
      findAnswerById: async () => ({ id: 'answer-3', student_audio_file_id: 'audio-3' })
    },
    evaluations: { upsertCleanedAudio: async (...args) => persisted.push(args) },
    tokens: { ensureFreshToken: async () => 'token' },
    iig: { getMigratedFileUrl: async () => 'https://iig.example/audio.wav' },
    cleaner: { cleanAudio: async () => ({ urlPath: 'r2:cleaned/audio-3.mp3', methodUsed: 'ai' }) },
    storage: {
      isR2Key: value => value.startsWith('r2:'),
      getSignedAudioUrl: async () => 'https://r2.example/signed'
    }
  });

  assert.deepEqual(persisted, [['answer-3', 'r2:cleaned/audio-3.mp3']]);
  assert.equal(result.cleanedAudioUrl, 'https://r2.example/signed');
});

test('cleanAnswersAudio returns per-answer success and failure without stopping the batch', async () => {
  const dependencies = {
    submissions: { findAnswerById: async id => id === 'bad' ? null : ({ id, student_audio_file_id: `${id}.wav` }) },
    evaluations: { upsertCleanedAudio: async () => {} },
    tokens: { ensureFreshToken: async () => 'token' },
    iig: { getMigratedFileUrl: async fileId => `https://audio.test/${fileId}` },
    cleaner: { cleanAudio: async (_url, fileId) => ({ urlPath: `/cleaned/${fileId}.mp3`, methodUsed: 'ai' }) },
    storage: { isR2Key: () => false }
  };
  const result = await cleanAnswersAudio({ answerIds: ['good', 'bad'], publicOrigin: 'https://admin.test' }, dependencies);
  assert.equal(result.total, 2);
  assert.equal(result.success, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.results.find(item => item.answerId === 'bad').status, 'error');
});
