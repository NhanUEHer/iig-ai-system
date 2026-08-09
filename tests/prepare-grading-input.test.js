const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SILENT_AUDIO_URL,
  resolveStudentAudio,
  prepareSpeakingGradingInput
} = require('../src/modules/scoring/prepareSpeakingGradingInput');

test('resolveStudentAudio prefers a signed R2 URL', async () => {
  const url = await resolveStudentAudio(
    { student_audio_file_id: 'original' },
    { cleaned_audio_url: 'r2:cleaned/audio.mp3' },
    {
      storage: { isR2Key: () => true, getSignedAudioUrl: async () => 'https://r2.example/signed' },
      tokens: { ensureFreshToken: async () => 'unused' },
      iig: { getMigratedFileUrl: async () => 'unused' }
    }
  );
  assert.equal(url, 'https://r2.example/signed');
});

test('resolveStudentAudio replaces reachable local origin or falls back to IIG', async () => {
  const dependencies = {
    storage: { isR2Key: () => false },
    tokens: { ensureFreshToken: async () => 'token' },
    iig: { getMigratedFileUrl: async () => 'https://iig.example/original' }
  };
  assert.equal(await resolveStudentAudio(
    { student_audio_file_id: 'original' },
    { cleaned_audio_url: 'http://localhost:5000/cleaned.mp3' },
    dependencies,
    'https://admin.example'
  ), 'https://admin.example/cleaned.mp3');
  assert.equal(await resolveStudentAudio(
    { student_audio_file_id: 'original' },
    { cleaned_audio_url: 'http://localhost:5000/cleaned.mp3' },
    dependencies,
    null
  ), 'https://iig.example/original');
});

test('prepareSpeakingGradingInput auto-transcribes and persists missing texts', async () => {
  const writes = [];
  const answer = {
    id: 'answer-1', section: 'Speaking', question_no: 8, prompt_text: 'Prompt',
    student_audio_file_id: 'student', context_audio_file_id: 'context',
    question_audio_file_id: 'question', context_text: '', question_name: ''
  };
  const prepared = await prepareSpeakingGradingInput(answer, {}, {
    submissions: {
      updateContextText: async (...args) => writes.push(['context', ...args]),
      updateQuestionName: async (...args) => writes.push(['question', ...args])
    },
    evaluations: {
      findAudioState: async () => ({ cleaned_audio_url: null, transcribe: '' }),
      upsertTranscription: async value => writes.push(['student', value])
    },
    findAgent: async ({ sttTarget }) => ({ api_endpoint: sttTarget, api_key: 'key' }),
    tokens: { ensureFreshToken: async () => 'token' },
    iig: { getMigratedFileUrl: async fileId => `https://iig.example/${fileId}` },
    storage: { isR2Key: () => false },
    dify: {
      transcribeSpeech: async endpoint => ({ data: { outputs: { transcribe: `${endpoint}-text` } } }),
      evaluateSpeech: async () => ({ data: { outputs: { transcribe: 'student-text' } } })
    }
  });

  assert.equal(prepared.contextText, 'context-text');
  assert.equal(prepared.questionName, 'question-text');
  assert.equal(prepared.transcription, 'student-text');
  assert.equal(writes.length, 3);
});

test('resolveStudentAudio preserves legacy silence fallback when no source exists', async () => {
  const url = await resolveStudentAudio({}, null, {
    storage: { isR2Key: () => false },
    tokens: { ensureFreshToken: async () => 'token' },
    iig: { getMigratedFileUrl: async () => null }
  });
  assert.equal(url, SILENT_AUDIO_URL);
});
