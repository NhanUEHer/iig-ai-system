const assert = require('node:assert/strict');
const test = require('node:test');

const {
  words,
  sequenceAlignment,
  extractFeatures,
} = require('../src/modules/iig-ai-scoring/featureExtractor');

function aiInput(scorerType, overrides = {}) {
  return {
    schemaVersion: 1,
    question: {
      scorerType,
      questionText: 'What would you recommend?',
      promptText: 'Respond clearly.',
      contextText: 'Good evening everyone and welcome to our program.',
      ...(overrides.question || {}),
    },
    response: scorerType.startsWith('WRITE_') || scorerType === 'RESPOND_TO_WRITTEN_REQUEST'
      ? { type: 'text', text: overrides.answerText || 'I recommend extending the opening hours.' }
      : { type: 'audio', audio: { durationSeconds: overrides.durationSeconds ?? 30 } },
  };
}

test('tokenizer normalizes unicode apostrophes and preserves words deterministically', () => {
  assert.deepEqual(words("I’m sure it's well-known."), ["i'm", "sure", "it's", 'well-known']);
});

test('sequence alignment separates omissions, insertions and substitutions', () => {
  const result = sequenceAlignment(
    ['we', 'welcome', 'all', 'guests'],
    ['we', 'greet', 'guests', 'today']
  );
  assert.equal(result.matches, 2);
  assert.equal(result.substitutions + result.omissions + result.insertions, 3);
  assert.equal(result.cost, 3);
});

test('RTA features quantify alignment without retaining source or transcript text', () => {
  const output = extractFeatures({
    aiInput: aiInput('READ_TEXT_ALOUD'),
    transcript: 'Good evening everyone and welcome to our show.',
    featureVersion: 'features-v1',
  });
  assert.equal(output.features.modality, 'SPEAKING');
  assert.equal(output.features.schemaVersion, 2);
  assert.equal(output.features.task.profile, 'READ_ALOUD');
  assert.deepEqual(output.features.evidenceContract, {
    contractVersion: 'ets-rta-evidence-v2',
    officialScoreMode: 'TRAIT_SCORES',
    officialScale: [0, 1, 2, 3],
    officialTraits: ['pronunciation', 'intonation_stress'],
    requiredEvidenceFamilies: ['validity', 'alignment', 'pronunciation', 'prosody'],
    auxiliaryEvidenceFamilies: ['fluency', 'audio_quality'],
  });
  assert.equal(output.features.task.deterministic.rtaAlignment.referenceWordCount, 8);
  assert.ok(output.features.task.deterministic.rtaAlignment.matches >= 6);
  assert.ok(output.features.task.deterministic.rtaAlignment.alignmentRatio > 0.5);
  assert.equal(output.features.common.response.wordsPerMinute, 16);
  assert.deepEqual(output.features.completion, {
    deterministic: 'READY',
    speech: 'NOT_REQUIRED',
    taskSemantic: 'NOT_REQUIRED',
  });
  assert.match(output.inputFingerprint, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(output.features), /Good evening|our show/);
});

test('free-speech features include duration, pace, fillers and repetitions', () => {
  const output = extractFeatures({
    aiInput: aiInput('EXPRESS_AN_OPINION', { durationSeconds: 20 }),
    transcript: 'Um I I prefer working from home because it saves time.',
    featureVersion: 'features-v1',
  });
  assert.equal(output.features.task.deterministic.rtaAlignment, null);
  assert.equal(output.features.evidenceContract.officialScoreMode, 'HOLISTIC');
  assert.deepEqual(output.features.evidenceContract.officialScale, [0, 1, 2, 3, 4, 5]);
  assert.equal(output.features.evidenceContract.officialTraits.length, 7);
  assert.equal(output.features.common.response.fillerCount, 1);
  assert.equal(output.features.common.response.consecutiveRepetitionCount, 1);
  assert.equal(output.features.common.response.wordsPerMinute, 33);
  assert.equal(output.features.completion.speech, 'NOT_REQUIRED');
  assert.equal(output.features.completion.taskSemantic, 'NOT_REQUIRED');
});

test('Describe Picture goes directly from deterministic features to its Dify scoring flow', () => {
  const output = extractFeatures({
    aiInput: aiInput('DESCRIBE_PICTURE', { durationSeconds: 25 }),
    transcript: 'Two people are talking next to a table.',
    featureVersion: 'features-v1',
  });
  assert.deepEqual(output.features.completion, {
    deterministic: 'READY',
    speech: 'NOT_REQUIRED',
    taskSemantic: 'NOT_REQUIRED',
  });
});

test('writing features are extracted from answer text without an STT transcript', () => {
  const output = extractFeatures({
    aiInput: aiInput('WRITE_OPINION_ESSAY', {
      answerText: 'First, public transport reduces traffic.\n\nSecond, it lowers pollution.',
    }),
    transcript: null,
    featureVersion: 'features-v1',
  });
  assert.equal(output.features.modality, 'WRITING');
  assert.equal(output.features.common.response.paragraphCount, 2);
  assert.equal(output.features.common.response.durationSeconds, null);
  assert.equal(output.features.task.deterministic.rtaAlignment, null);
  assert.equal(output.features.evidenceContract.contractVersion, 'ets-opinion-essay-evidence-v1');
  assert.deepEqual(output.features.evidenceContract.officialScale, [0, 1, 2, 3, 4, 5]);
  assert.equal(output.features.completion.speech, 'NOT_REQUIRED');
  assert.equal(output.features.completion.taskSemantic, 'PENDING');
});

test('speaking evidence keeps only whitelisted prepared-audio quality metrics', () => {
  const input = aiInput('RESPOND_TO_QUESTIONS', { durationSeconds: 12 });
  input.response.audio.checksumSha256 = 'a'.repeat(64);
  input.response.audio.quality = {
    meanVolumeDb: -18.2,
    maxVolumeDb: -2.1,
    silenceDurationSeconds: 2.5,
    silenceRatio: 0.21,
    cleanupMethod: 'ai',
    signedUrl: 'https://should-not-be-persisted.example',
  };
  const output = extractFeatures({
    aiInput: input,
    transcript: 'I prefer the morning class.',
    featureVersion: 'features-v1',
  });
  assert.deepEqual(output.features.common.audioQuality, {
    durationSeconds: 12,
    meanVolumeDb: -18.2,
    maxVolumeDb: -2.1,
    silenceDurationSeconds: 2.5,
    silenceRatio: 0.21,
    cleanupMethod: 'ai',
  });
  assert.doesNotMatch(JSON.stringify(output.features), /should-not-be-persisted/);
});

test('feature fingerprint changes when the candidate response changes', () => {
  const input = aiInput('RESPOND_TO_QUESTIONS');
  const first = extractFeatures({ aiInput: input, transcript: 'Monday morning.', featureVersion: 'v1' });
  const second = extractFeatures({ aiInput: input, transcript: 'Tuesday morning.', featureVersion: 'v1' });
  assert.notEqual(first.inputFingerprint, second.inputFingerprint);
});

test('missing response and unsupported profiles are permanent contract errors', () => {
  assert.throws(
    () => extractFeatures({ aiInput: aiInput('RESPOND_TO_QUESTIONS'), transcript: '', featureVersion: 'v1' }),
    error => error.code === 'IIG_AI_FEATURE_RESPONSE_MISSING' && error.retryable === false
  );
  assert.throws(
    () => extractFeatures({ aiInput: aiInput('UNKNOWN'), transcript: 'answer', featureVersion: 'v1' }),
    error => error.code === 'IIG_AI_FEATURE_PROFILE_UNSUPPORTED' && error.retryable === false
  );
});
