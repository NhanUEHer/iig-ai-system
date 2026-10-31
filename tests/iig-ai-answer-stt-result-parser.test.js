const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseAnswerSttResult,
  classifyAnswerSttOutcome,
} = require('../src/modules/iig-ai-scoring/answerSttResultParser');

function success(overrides = {}) {
  return {
    schema_version: 1,
    status: 'SUCCESS',
    transcript: 'Have you ever wonder what make the bakery famous.',
    detected_language: 'en',
    speech_detected: true,
    confidence: 0.91,
    flags: [],
    ...overrides,
  };
}

test('parser accepts a direct valid object and returns canonical internal fields', () => {
  assert.deepEqual(parseAnswerSttResult(success({ flags: ['hesitation', 'HESITATION'] })), {
    schemaVersion: 1,
    status: 'SUCCESS',
    transcript: 'Have you ever wonder what make the bakery famous.',
    detectedLanguage: 'en',
    speechDetected: true,
    confidence: 0.91,
    flags: ['HESITATION'],
  });
});

test('parser unwraps Dify outputs and JSON code fences', () => {
  const parsed = parseAnswerSttResult({
    data: {
      outputs: {
        stt_result: `\n\`\`\`json\n${JSON.stringify(success())}\n\`\`\`\n`,
        workflow_run_id: 'ignored-metadata',
      },
    },
  });
  assert.equal(parsed.status, 'SUCCESS');
  assert.match(parsed.transcript, /bakery famous/);
});

test('parser can extract one JSON object from a short model prefix', () => {
  const parsed = parseAnswerSttResult(`Result:\n${JSON.stringify(success())}`);
  assert.equal(parsed.confidence, 0.91);
});

test('parser treats no-speech as a valid business outcome, not a transcript', () => {
  const result = parseAnswerSttResult({
    schema_version: 1,
    status: 'NO_SPEECH',
    transcript: '',
    detected_language: null,
    speech_detected: false,
    confidence: 0.99,
    flags: ['NO_SPEECH'],
  });
  assert.deepEqual(classifyAnswerSttOutcome(result), {
    action: 'INVALID_AUDIO', retryable: false, terminal: true,
  });
});

test('wrong-language and unintelligible outputs route to review without retry', () => {
  for (const status of ['WRONG_LANGUAGE_VI', 'WRONG_LANGUAGE_OTHER', 'UNINTELLIGIBLE']) {
    const result = parseAnswerSttResult({
      schema_version: 1,
      status,
      transcript: status === 'WRONG_LANGUAGE_VI' ? 'Em không biết đọc.' : '',
      detected_language: status === 'WRONG_LANGUAGE_VI' ? 'vi' : null,
      speech_detected: true,
      confidence: null,
      flags: [status],
    });
    assert.equal(classifyAnswerSttOutcome(result).action, 'REVIEW_REQUIRED');
    assert.equal(classifyAnswerSttOutcome(result).retryable, false);
  }
});

test('FAILED is a technical retry outcome', () => {
  const result = parseAnswerSttResult({
    schema_version: 1,
    status: 'FAILED',
    transcript: '',
    detected_language: null,
    speech_detected: false,
    confidence: null,
    flags: ['MODEL_TIMEOUT'],
  });
  assert.deepEqual(classifyAnswerSttOutcome(result), {
    action: 'RETRY', retryable: true, terminal: false,
  });
});

test('invalid JSON and ambiguous Dify outputs are retryable contract failures', () => {
  for (const raw of [
    'not-json',
    { outputs: { first: 'one', second: 'two' } },
  ]) {
    assert.throws(
      () => parseAnswerSttResult(raw),
      error => error.code.startsWith('IIG_AI_STT_OUTPUT_') && error.retryable === true
    );
  }
});

test('unsupported schema version is a non-retryable deployment mismatch', () => {
  assert.throws(
    () => parseAnswerSttResult(success({ schema_version: 2 })),
    error => error.code === 'IIG_AI_STT_SCHEMA_UNSUPPORTED' && error.retryable === false
  );
});

test('successful output requires real speech, transcript and valid confidence', () => {
  const invalidCases = [
    [success({ transcript: '' }), 'IIG_AI_STT_TRANSCRIPT_MISSING'],
    [success({ speech_detected: false }), 'IIG_AI_STT_SPEECH_FLAG_CONFLICT'],
    [success({ confidence: 2 }), 'IIG_AI_STT_CONFIDENCE_INVALID'],
    [success({ detected_language: 'vi' }), 'IIG_AI_STT_LANGUAGE_CONFLICT'],
  ];
  for (const [payload, code] of invalidCases) {
    assert.throws(() => parseAnswerSttResult(payload), error => error.code === code);
  }
});

test('legacy Vietnamese error strings cannot be stored as successful transcripts', () => {
  for (const transcript of [
    'Audio không có giọng nói của bạn',
    'Đoạn ghi âm không đúng yêu cầu (Phát hiện thí sinh nói Tiếng Việt)',
  ]) {
    assert.throws(
      () => parseAnswerSttResult(success({ transcript })),
      error => error.code === 'IIG_AI_STT_ERROR_AS_TRANSCRIPT'
    );
  }
});

test('NO_SPEECH cannot contain transcript text or speech_detected=true', () => {
  assert.throws(
    () => parseAnswerSttResult({
      schema_version: 1,
      status: 'NO_SPEECH',
      transcript: 'noise',
      detected_language: null,
      speech_detected: true,
      confidence: 0.5,
      flags: [],
    }),
    error => error.code === 'IIG_AI_STT_NO_SPEECH_CONFLICT'
  );
});
