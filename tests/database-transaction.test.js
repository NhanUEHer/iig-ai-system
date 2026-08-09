const assert = require('node:assert/strict');
const test = require('node:test');

const runTransaction = require('../src/database/transaction');

test('database transaction commits successful work', async () => {
  const calls = [];
  const client = { query: async sql => calls.push(sql), release: () => calls.push('RELEASE') };
  const result = await runTransaction({ connect: async () => client }, async () => 'ok');
  assert.equal(result, 'ok');
  assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'RELEASE']);
});

test('database transaction rolls back failed work', async () => {
  const calls = [];
  const client = { query: async sql => calls.push(sql), release: () => calls.push('RELEASE') };
  await assert.rejects(
    () => runTransaction({ connect: async () => client }, async () => { throw new Error('failed'); }),
    /failed/
  );
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});
