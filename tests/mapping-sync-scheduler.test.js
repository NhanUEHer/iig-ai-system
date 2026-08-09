const assert = require('node:assert/strict');
const test = require('node:test');

const scheduler = require('../src/services/mappingSyncScheduler');

test('mapping scheduler calculates the Vietnam local day and previous date', () => {
  assert.deepEqual(
    scheduler.dateParts(new Date('2026-08-08T18:30:00.000Z'), 'Asia/Ho_Chi_Minh'),
    { date: '2026-08-09', time: '01:30' }
  );
  assert.equal(scheduler.previousDate('2026-03-01'), '2026-02-28');
});

test('mapping scheduler runs once with yesterday-to-today filters', async () => {
  const calls = [];
  const repository = {
    get: async () => ({ enabled: true, run_time: '01:00:00', page_size: 250, timezone: 'Asia/Ho_Chi_Minh', last_run_date: null }),
    claim: async runDate => ({ page_size: 250, runDate }),
    complete: async result => calls.push(['complete', result]),
    fail: async error => calls.push(['fail', error])
  };
  const syncService = {
    syncMappings: async filters => { calls.push(['sync', filters]); return 17; }
  };

  const result = await scheduler.check(new Date('2026-08-08T01:00:00.000Z'), { repository, syncService });

  assert.deepEqual(result, { count: 17, runDate: '2026-08-08' });
  assert.deepEqual(calls, [
    ['sync', { pageSize: 250, fromSubmittedDate: '2026-08-07', toSubmittedDate: '2026-08-08' }],
    ['complete', { count: 17 }]
  ]);
});

test('mapping scheduler skips disabled, early, and already-run schedules', async () => {
  let syncCount = 0;
  const syncService = { syncMappings: async () => { syncCount += 1; } };
  const scenarios = [
    { enabled: false, run_time: '01:00:00', timezone: 'Asia/Ho_Chi_Minh' },
    { enabled: true, run_time: '09:00:00', timezone: 'Asia/Ho_Chi_Minh' },
    { enabled: true, run_time: '01:00:00', timezone: 'Asia/Ho_Chi_Minh', last_run_date: '2026-08-08' }
  ];

  for (const config of scenarios) {
    const repository = { get: async () => config, claim: async () => { throw new Error('must not claim'); } };
    assert.equal(await scheduler.check(new Date('2026-08-08T01:00:00.000Z'), { repository, syncService }), null);
  }
  assert.equal(syncCount, 0);
});
