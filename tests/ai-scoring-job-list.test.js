const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/modules/ai-scoring-jobs/jobListValidator');
const { JobListRepository, map } = require('../src/modules/ai-scoring-jobs/jobListRepository');

test('job list validator normalizes exact search and bounded pagination', () => {
  const value = validate({ search: ' abc123 ', scope: 's+w', page: '2', pageSize: '50', hasRetry: 'true' });
  assert.equal(value.search, 'abc123'); assert.equal(value.scope, 'S+W'); assert.equal(value.page, 2); assert.equal(value.pageSize, 50); assert.equal(value.hasRetry, true);
});

test('job export requires a maximum 31 day range', () => {
  assert.throws(() => validate({}, { exportMode: true }), error => error.code === 'EXPORT_RANGE_REQUIRED');
  assert.throws(() => validate({ from: '2026-01-01', to: '2026-03-01' }, { exportMode: true }), error => error.code === 'EXPORT_RANGE_REQUIRED');
});

test('job list repository uses parameterized filters and returns metadata only', async () => {
  const calls=[]; const database={query:async(sql,values)=>{calls.push({sql,values});return calls.length===1?{rows:[{total:1}]}:{rows:[{id:'job',source_scoring_id:'score',keycode:'ABC123',scope:'S',display_status:'COMPLETED',stage:'COMPLETED',accepted_at:'2026-10-01T00:00:00Z',terminal_at:'2026-10-01T00:00:10Z'}]};}};
  const result=await new JobListRepository(database).list({search:'ABC123',tenantId:'tenant',status:'COMPLETED',scope:'S',from:null,to:null,hasRetry:false,page:1,pageSize:25});
  assert.equal(result.items[0].keycode,'ABC123'); assert.equal(result.items[0].durationMs,10000); assert.equal('answerText' in result.items[0],false); assert.match(calls[1].sql,/LIMIT \$5 OFFSET \$6/); assert.deepEqual(calls[1].values,['ABC123','tenant','COMPLETED','S',25,0]);
});

test('job row mapper never exposes candidate content', () => {
  const value=map({id:'1',answer_text:'secret',transcript:'secret',source_payload:{secret:true}});
  assert.deepEqual(Object.keys(value).sort(),['acceptedAt','durationMs','errorCode','id','keycode','progress','retryCount','runType','scope','scoringId','stage','status','tenant','updatedAt'].sort());
});
