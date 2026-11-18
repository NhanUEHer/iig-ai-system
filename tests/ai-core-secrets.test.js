const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const secrets = require('../src/modules/ai-core/providers/secrets');
const { createConnectionStore } = require('../src/modules/ai-core/providers/connectionStore');
const { rotateMasterKeys } = require('../scripts/ai-core-rotate-master-key');

const KEY_V1 = Buffer.alloc(32, 1).toString('base64');
const KEY_V2 = Buffer.alloc(32, 2).toString('base64');

function encryptedRow(encrypted, overrides = {}) {
  return {
    id: 'connection-1',
    api_key_ciphertext: encrypted.ciphertext,
    api_key_iv: encrypted.iv,
    api_key_tag: encrypted.tag,
    key_version: encrypted.keyVersion,
    updated_at: '2026-11-18T00:00:00.000Z',
    ...overrides,
  };
}

test.beforeEach(() => secrets.clearCache());

test('encrypt/decrypt round trip uses AES-256-GCM and returns the correct metadata', () => {
  const env = { AI_CORE_MASTER_KEY: KEY_V1 };
  const encrypted = secrets.encrypt('gemini-secret-1234', { env });

  assert.equal(encrypted.iv.length, 12);
  assert.equal(encrypted.tag.length, 16);
  assert.equal(encrypted.last4, '1234');
  assert.equal(encrypted.keyVersion, 1);
  assert.equal(secrets.decrypt(encryptedRow(encrypted), { env }), 'gemini-secret-1234');
  assert.equal(secrets.isConfigured(env), true);
});

test('tampered ciphertext and authentication tag are rejected without exposing plaintext', () => {
  const env = { AI_CORE_MASTER_KEY: KEY_V1 };
  const encrypted = secrets.encrypt('deepseek-secret-5678', { env });

  for (const field of ['api_key_ciphertext', 'api_key_tag']) {
    const row = encryptedRow(encrypted, { id: `tampered-${field}` });
    row[field] = Buffer.from(row[field]);
    row[field][0] ^= 1;
    assert.throws(
      () => secrets.decrypt(row, { env }),
      error => error.code === 'CONFIG_MISSING' && !error.message.includes('deepseek-secret-5678'),
    );
  }
});

test('missing, malformed, and incorrect master keys fail safely', () => {
  assert.equal(secrets.isConfigured({}), false);
  assert.equal(secrets.isConfigured({ AI_CORE_MASTER_KEY: Buffer.alloc(31).toString('base64') }), false);

  const encrypted = secrets.encrypt('provider-secret-9012', {
    env: { AI_CORE_MASTER_KEY: KEY_V1 },
  });
  assert.throws(
    () => secrets.decrypt(encryptedRow(encrypted), {
      env: { AI_CORE_MASTER_KEY: KEY_V2 },
    }),
    error => error.code === 'CONFIG_MISSING' && !error.message.includes('provider-secret-9012'),
  );
});

test('version 1 ciphertext remains decryptable while version 2 becomes current', () => {
  const version1Env = {
    AI_CORE_MASTER_KEY_CURRENT: '1',
    AI_CORE_MASTER_KEY_V1: KEY_V1,
  };
  const rotationEnv = {
    AI_CORE_MASTER_KEY_CURRENT: '2',
    AI_CORE_MASTER_KEY_V1: KEY_V1,
    AI_CORE_MASTER_KEY_V2: KEY_V2,
  };
  const oldEncrypted = secrets.encrypt('rotated-secret-3456', { env: version1Env });
  const plaintext = secrets.decrypt(encryptedRow(oldEncrypted), { env: rotationEnv });
  const newEncrypted = secrets.encrypt(plaintext, { env: rotationEnv });

  assert.equal(newEncrypted.keyVersion, 2);
  assert.equal(secrets.decrypt(encryptedRow(newEncrypted), { env: rotationEnv }), 'rotated-secret-3456');
});

test('decrypted keys are cached by connection id and updated timestamp for at most five minutes', () => {
  const env = { AI_CORE_MASTER_KEY: KEY_V1 };
  const encrypted = secrets.encrypt('cached-secret-7890', { env });
  const row = encryptedRow(encrypted);
  let now = 1000;

  assert.equal(secrets.decrypt(row, { env, now: () => now }), 'cached-secret-7890');
  row.api_key_tag = Buffer.alloc(16);
  now += secrets.CACHE_TTL_MS - 1;
  assert.equal(secrets.decrypt(row, { env, now: () => now }), 'cached-secret-7890');
  now += 2;
  assert.throws(() => secrets.decrypt(row, { env, now: () => now }), { code: 'CONFIG_MISSING' });
});

test('connection store persists encrypted values and public DTOs omit key material', async () => {
  const env = { AI_CORE_MASTER_KEY: KEY_V1 };
  let storedRow;
  const calls = [];
  const database = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/INSERT INTO aic_connections/.test(sql)) {
        storedRow = {
          id: 'connection-1',
          provider: params[0],
          name: params[1],
          api_key_ciphertext: params[2],
          api_key_iv: params[3],
          api_key_tag: params[4],
          api_key_last4: params[5],
          key_version: params[6],
          base_url: params[7],
          status: params[8],
          created_by: params[9],
          updated_by: params[9],
          created_at: new Date('2026-11-18T00:00:00Z'),
          updated_at: new Date('2026-11-18T00:00:00Z'),
        };
      }
      return { rows: [storedRow], rowCount: 1 };
    },
  };
  const secretStore = {
    encrypt: plainKey => secrets.encrypt(plainKey, { env }),
    decrypt: row => secrets.decrypt(row, { env }),
    clearCache: secrets.clearCache,
  };
  const store = createConnectionStore(database, secretStore);

  const created = await store.create({
    provider: 'gemini',
    name: 'Gemini production',
    apiKey: 'provider-key-abcd',
  }, 'user-1');
  assert.equal(calls[0].params.includes('provider-key-abcd'), false);
  assert.equal(Buffer.isBuffer(storedRow.api_key_ciphertext), true);
  assert.notEqual(storedRow.api_key_ciphertext.toString('utf8'), 'provider-key-abcd');
  assert.equal(created.apiKeyLast4, 'abcd');
  assert.equal(Object.hasOwn(created, 'apiKey'), false);
  assert.equal(Object.keys(created).some(key => /ciphertext|\biv\b|\btag\b/i.test(key)), false);

  const fetched = await store.get('connection-1');
  assert.equal(Object.hasOwn(fetched, 'apiKey'), false);
  assert.doesNotMatch(calls[1].sql, /api_key_(?:ciphertext|iv|tag)/);
  const internal = await store.getWithKey('connection-1');
  assert.equal(internal.apiKey, 'provider-key-abcd');
  assert.equal(Object.keys(internal).some(key => /ciphertext|\biv\b|\btag\b/i.test(key)), false);
});

test('connection store update re-encrypts a replacement key and refreshes last4', async () => {
  const row = {
    id: 'connection-1', provider: 'deepseek', name: 'DeepSeek',
    api_key_last4: '9999', key_version: 1, base_url: null, status: 'active',
  };
  let captured;
  const database = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [row], rowCount: 1 };
    },
  };
  const store = createConnectionStore(database, {
    encrypt: () => ({
      ciphertext: Buffer.from('new'), iv: Buffer.alloc(12), tag: Buffer.alloc(16),
      last4: '9999', keyVersion: 1,
    }),
    clearCache() {},
  });

  const updated = await store.update('connection-1', { apiKey: 'new-provider-key-9999' }, 'user-2');
  assert.match(captured.sql, /api_key_ciphertext=\$2/);
  assert.equal(captured.params.includes('new-provider-key-9999'), false);
  assert.equal(updated.apiKeyLast4, '9999');
});

test('master-key rotation runs atomically and reports only the row count', async () => {
  const row = { id: 'connection-1', key_version: 1 };
  const updates = [];
  let transactionCalls = 0;
  const database = {
    async transaction(work) {
      transactionCalls += 1;
      return work({
        async query(sql, params) {
          if (/^\s*SELECT/i.test(sql)) return { rows: [row], rowCount: 1 };
          updates.push({ sql, params });
          return { rows: [], rowCount: 1 };
        },
      });
    },
  };
  let cacheCleared = false;
  const count = await rotateMasterKeys(database, {
    decrypt: value => {
      assert.equal(value, row);
      return 'rotation-secret-2468';
    },
    encrypt: value => {
      assert.equal(value, 'rotation-secret-2468');
      return {
        ciphertext: Buffer.from('rotated'), iv: Buffer.alloc(12), tag: Buffer.alloc(16),
        last4: '2468', keyVersion: 2,
      };
    },
    clearCache: () => { cacheCleared = true; },
  });

  assert.equal(transactionCalls, 1);
  assert.equal(count, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].params.includes('rotation-secret-2468'), false);
  assert.equal(cacheCleared, true);
});

test('AI Core secret-handling sources never log provider API keys', () => {
  const files = [
    '../src/modules/ai-core/providers/secrets.js',
    '../src/modules/ai-core/providers/connectionStore.js',
    '../scripts/ai-core-rotate-master-key.js',
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
    assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:apiKey|plainKey|plaintext)/i);
  }
});
