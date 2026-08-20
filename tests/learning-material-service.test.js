const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('dictionary generation uses a durable queue with retry attempts', () => {
  const migration = read('src/database/migrations/054_dictionary_durable_queue.sql');
  const service = read('src/modules/dictionary/dictionaryService.js');
  assert.match(migration, /dictionary_generation_attempts/);
  assert.match(migration, /status IN \('pending','queued','generating','completed','failed'\)/);
  assert.match(service, /FOR UPDATE SKIP LOCKED/);
  assert.match(service, /DEFAULT_MAX_ATTEMPTS = 3/);
  assert.match(service, /DEFAULT_GENERATION_CONCURRENCY = 6/);
  assert.match(service, /DICTIONARY_CONTEXT_MISMATCH/);
});

test('Key Vocab and Dictionary history share canonical content passages', () => {
  const migration = read('src/database/migrations/055_learning_material_passages.sql');
  const service = read('src/modules/learning-materials/learningMaterialService.js');
  const app = read('src/app.js');
  assert.match(migration, /passage_id SET NOT NULL/);
  assert.match(migration, /DROP COLUMN IF EXISTS passage/);
  assert.match(service, /FROM content_passages passage/);
  assert.match(service, /key_vocab_generations/);
  assert.match(service, /dictionary_generations/);
  assert.match(app, /\/api\/learning-materials/);
});
