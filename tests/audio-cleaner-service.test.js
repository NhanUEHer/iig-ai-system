const assert = require('node:assert/strict');
const test = require('node:test');
const { ensureSafeDuration } = require('../src/services/audioCleanerService');

test('duration guard accepts cleaned audio that preserves the recording length', async () => {
  const durations = ['45.00\n', '44.92\n'];
  const result = await ensureSafeDuration('input.wav', 'output.wav', {
    execute: async () => ({ stdout: durations.shift() })
  });
  assert.equal(result.inputDuration, 45);
  assert.equal(result.outputDuration, 44.92);
});

test('duration guard rejects output truncated at the first natural pause', async () => {
  const durations = ['44.976\n', '1.764\n'];
  await assert.rejects(
    () => ensureSafeDuration('input.wav', 'output.wav', {
      execute: async () => ({ stdout: durations.shift() })
    }),
    /shortened the recording unexpectedly/
  );
});
