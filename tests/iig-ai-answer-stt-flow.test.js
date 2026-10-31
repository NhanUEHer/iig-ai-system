const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FLOW_PATH = path.join(
  __dirname,
  '..',
  'dify-flows',
  'iig-ai-scoring',
  'answer-stt-v1.yml'
);

test('Answer STT Dify artifact preserves the backend input and output contract', () => {
  const source = fs.readFileSync(FLOW_PATH, 'utf8');
  const requiredInputs = [
    'schema_version',
    'stt_profile',
    'question_code',
    'reference_text',
    'question_text',
    'context_text',
    'student_audio',
  ];
  for (const variable of requiredInputs) {
    assert.match(source, new RegExp(`variable: ${variable}(?:\\n|$)`));
  }
  assert.match(source, /variable: stt_result(?:\n|$)/);
  assert.match(source, /value_type: object/);
  assert.match(source, /READ_ALOUD_GUIDED/);
  assert.match(source, /FREE_SPEECH/);
  assert.equal((source.match(/type: end(?:\n|$)/g) || []).length, 1);
  assert.equal((source.match(/type: variable-aggregator(?:\n|$)/g) || []).length, 1);
  assert.match(source, /- answer-stt-normalize\n\s+- stt_result/);
});

test('Answer STT Dify artifact keeps structured statuses and safe model settings', () => {
  const source = fs.readFileSync(FLOW_PATH, 'utf8');
  for (const status of [
    'SUCCESS',
    'NO_SPEECH',
    'WRONG_LANGUAGE_VI',
    'WRONG_LANGUAGE_OTHER',
    'UNINTELLIGIBLE',
    'FAILED',
  ]) {
    assert.match(source, new RegExp(`- ${status}(?:\\n|$)`));
  }
  assert.equal((source.match(/max_output_tokens: 4000/g) || []).length, 2);
  assert.equal((source.match(/thinking_mode: false/g) || []).length, 2);
  assert.equal((source.match(/temperature: 0\.1/g) || []).length, 2);
  assert.equal((source.match(/name: gemini-3\.8-flash/g) || []).length, 2);
  assert.equal((source.match(/vision:\n\s+configs:\n\s+detail: high\n\s+variable_selector:\n\s+- answer-stt-start\n\s+- student_audio\n\s+enabled: true/g) || []).length, 2);
  assert.match(source, /title: Normalize STT Contract/);
  assert.match(source, /normalized == "true"/);
  assert.doesNotMatch(source, /app-[A-Za-z0-9_-]{10,}/);
  assert.doesNotMatch(source, /api[_-]?key:\s*[^\s]/i);
});

test('embedded prompts retain separate guided and free-speech safety boundaries', () => {
  const source = fs.readFileSync(FLOW_PATH, 'utf8');
  assert.match(source, /You transcribe one TOEIC Read a Text Aloud response/);
  assert.match(source, /You transcribe one TOEIC Speaking response/);
  assert.match(source, /Use reference_text only to recognize heavily accented words/);
  assert.match(source, /lexical hints only/);
  assert.match(source, /Never copy words from them unless the candidate says those words/);
});
