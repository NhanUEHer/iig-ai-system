const assert = require('node:assert/strict');
const test = require('node:test');

const { CONTRACTS, getEvidenceContract } = require('../src/modules/iig-ai-scoring/evidenceContractRegistry');
const {
  SUPPORTED_TYPES,
  buildFreeSpeechEvidenceRequest,
  normalizeFreeSpeechEvidence,
} = require('../src/modules/iig-ai-scoring/freeSpeechEvidenceContract');
const {
  FIELD_SPECS,
  buildTaskEvidenceRequest,
  normalizeTaskEvidence,
} = require('../src/modules/iig-ai-scoring/taskEvidenceContract');

function audioInput(scorerType) {
  return {
    question: {
      scorerType,
      questionText: 'Please answer the question.',
      promptText: 'Respond clearly.',
      contextText: scorerType === 'RESPOND_USING_INFORMATION' ? 'The class starts at 9 AM.' : '',
    },
    response: {
      type: 'audio',
      audio: { durationSeconds: 20, checksumSha256: 'a'.repeat(64) },
    },
    media: scorerType === 'DESCRIBE_PICTURE'
      ? { questionImages: [image('question-image')] }
      : {},
  };
}

function writingInput(scorerType) {
  return {
    question: {
      scorerType,
      questionText: 'Write your response.',
      promptText: 'Use both keywords.',
      contextText: 'The original request or opinion topic.',
    },
    response: { type: 'text', text: 'I support this idea because it improves access.' },
    media: scorerType === 'WRITE_SENTENCE_PICTURE'
      ? { questionImages: [image('writing-image')] }
      : {},
  };
}

function image(id) {
  return {
    id,
    storage: { mimeType: 'image/png' },
    checksumSha256: 'b'.repeat(64),
  };
}

function freeSpeechOutput(scorerType) {
  return {
    schema_version: 1,
    contract_version: getEvidenceContract(scorerType).contractVersion,
    status: 'SUCCESS',
    validity: { speech_present: true, language_code: 'en', intelligible_speech: true },
    delivery: {
      intelligibility: 0.82,
      listener_effort: 'LITTLE',
      pronunciation_accuracy: 0.8,
      stress_appropriateness: 0.7,
      pause_appropriateness: 0.75,
      pitch_appropriateness: 0.68,
      rhythm_appropriateness: 0.72,
    },
    fluency: {
      speech_rate_wpm: 118,
      filler_count: 1,
      repetition_count: 0,
      longest_pause_ms: 1300,
    },
  };
}

function evidenceValue(spec) {
  if (spec.type === 'boolean') return true;
  if (spec.type === 'integer') return 1;
  if (spec.type === 'number') return 0.75;
  return spec.values[0];
}

function taskOutput(scorerType) {
  return {
    schema_version: 1,
    contract_version: getEvidenceContract(scorerType).contractVersion,
    status: 'SUCCESS',
    validity: { usable: true, task_related: true },
    evidence: Object.fromEntries(
      Object.entries(FIELD_SPECS[scorerType]).map(([field, spec]) => [field, evidenceValue(spec)])
    ),
  };
}

test('registry covers every TOEIC Speaking and Writing scorer type', () => {
  assert.deepEqual(Object.keys(CONTRACTS).sort(), [
    'DESCRIBE_PICTURE',
    'EXPRESS_AN_OPINION',
    'READ_TEXT_ALOUD',
    'RESPOND_TO_QUESTIONS',
    'RESPOND_TO_WRITTEN_REQUEST',
    'RESPOND_USING_INFORMATION',
    'WRITE_OPINION_ESSAY',
    'WRITE_SENTENCE_PICTURE',
  ]);
  assert.equal(CONTRACTS.READ_TEXT_ALOUD.officialScoreMode, 'TRAIT_SCORES');
  for (const [type, contract] of Object.entries(CONTRACTS)) {
    if (type !== 'READ_TEXT_ALOUD') assert.equal(contract.officialScoreMode, 'HOLISTIC', type);
    assert.match(contract.contractVersion, /-v\d+$/, type);
    assert.ok(contract.officialTraits.length >= 2, type);
  }
});

test('free-speaking contract covers Q3 through Q11 without returning scores', () => {
  for (const scorerType of SUPPORTED_TYPES) {
    const request = buildFreeSpeechEvidenceRequest({
      aiInput: audioInput(scorerType),
      transcript: 'I would choose the morning option because it is convenient.',
    });
    const normalized = normalizeFreeSpeechEvidence(scorerType, freeSpeechOutput(scorerType));
    assert.equal(request.contract_version, getEvidenceContract(scorerType).contractVersion);
    assert.equal(normalized.delivery.listenerEffort, 'LITTLE');
    assert.equal(normalized.fluency.speechRateWpm, 118);
    assert.equal(Object.hasOwn(normalized, 'score'), false);
  }
});

test('semantic task contract builds and normalizes all seven remaining task profiles', () => {
  for (const scorerType of Object.keys(FIELD_SPECS)) {
    const aiInput = scorerType.startsWith('WRITE_') || scorerType === 'RESPOND_TO_WRITTEN_REQUEST'
      ? writingInput(scorerType)
      : audioInput(scorerType);
    const request = buildTaskEvidenceRequest({
      aiInput,
      transcript: aiInput.response.type === 'audio' ? 'This is my complete spoken response.' : null,
    });
    const normalized = normalizeTaskEvidence(scorerType, taskOutput(scorerType));
    assert.deepEqual(request.required_evidence_fields, Object.keys(FIELD_SPECS[scorerType]));
    assert.equal(Object.keys(normalized.evidence).length, Object.keys(FIELD_SPECS[scorerType]).length);
    assert.equal(Object.hasOwn(normalized, 'score'), false);
  }
});

test('picture and information contracts require canonical prompt context', () => {
  const describe = audioInput('DESCRIBE_PICTURE');
  describe.media = {};
  assert.throws(
    () => buildTaskEvidenceRequest({ aiInput: describe, transcript: 'A person is walking.' }),
    error => error.code === 'IIG_AI_TASK_EVIDENCE_IMAGE_REQUIRED'
  );

  const information = audioInput('RESPOND_USING_INFORMATION');
  information.question.contextText = '';
  assert.throws(
    () => buildTaskEvidenceRequest({ aiInput: information, transcript: 'It starts at nine.' }),
    error => error.code === 'IIG_AI_TASK_EVIDENCE_CONTEXT_REQUIRED'
  );
});

test('task evidence rejects missing fields and contradictory completion counts', () => {
  const missing = taskOutput('DESCRIBE_PICTURE');
  delete missing.evidence.cohesion;
  assert.throws(
    () => normalizeTaskEvidence('DESCRIBE_PICTURE', missing),
    error => error.code === 'IIG_AI_TASK_EVIDENCE_FIELD_MISSING'
  );

  const contradictory = taskOutput('RESPOND_TO_QUESTIONS');
  contradictory.evidence.subquestions_total = 1;
  contradictory.evidence.subquestions_answered = 2;
  assert.throws(
    () => normalizeTaskEvidence('RESPOND_TO_QUESTIONS', contradictory),
    error => error.code === 'IIG_AI_TASK_EVIDENCE_CONTRADICTORY'
  );
});

test('invalid responses carry validity only and cannot fabricate semantic evidence', () => {
  const normalized = normalizeTaskEvidence('WRITE_OPINION_ESSAY', {
    schema_version: 1,
    contract_version: CONTRACTS.WRITE_OPINION_ESSAY.contractVersion,
    status: 'INVALID_RESPONSE',
    validity: { usable: false, task_related: false },
    flags: ['NON_ENGLISH_RESPONSE'],
  });
  assert.equal(normalized.evidence, null);
  assert.deepEqual(normalized.flags, ['NON_ENGLISH_RESPONSE']);
});
