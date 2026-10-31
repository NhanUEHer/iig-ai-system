const assert = require('node:assert/strict');
const test = require('node:test');

const client = require('../src/clients/geminiQuestionSttClient');

test('Gemini question STT sends inline audio without exposing the key in the URL', async () => {
  let request;
  const result = await client.transcribeQuestion({
    apiKey: 'runtime-secret',
    audioBuffer: Buffer.from('audio-data'),
    mimeType: 'audio/mpeg',
    contextText: 'Cooking class information.',
    http: {
      post: async (...args) => {
        request = args;
        return {
          data: {
            candidates: [{ content: { parts: [{ text: 'What time does the class start?' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8, totalTokenCount: 18 },
          },
        };
      },
    },
  });

  assert.equal(result.transcript, 'What time does the class start?');
  assert.equal(result.metadata.provider, 'gemini');
  assert.equal(result.metadata.usage.totalTokenCount, 18);
  assert.doesNotMatch(request[0], /runtime-secret/);
  assert.equal(request[2].headers['x-goog-api-key'], 'runtime-secret');
  assert.equal(request[1].generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(request[1].contents[0].parts[1].inlineData.data, Buffer.from('audio-data').toString('base64'));
  assert.match(request[1].contents[0].parts[0].text, /Cooking class information/);
});

test('Gemini question STT rejects empty audio before making a request', async () => {
  await assert.rejects(
    () => client.transcribeQuestion({ apiKey: 'runtime-secret', audioBuffer: Buffer.alloc(0) }),
    error => error.code === 'IIG_STT_AUDIO_EMPTY' && error.retryable === false
  );
});
