const test = require('node:test');
const assert = require('node:assert/strict');
const { JobOperationService } = require('../src/modules/ai-scoring-jobs/jobOperationService');
const { JobOperationRepository } = require('../src/modules/ai-scoring-jobs/jobOperationRepository');
const { JobPipelineService } = require('../src/modules/ai-scoring-jobs/jobPipelineService');
const { JobPipelineRepository } = require('../src/modules/ai-scoring-jobs/jobPipelineRepository');

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const NEW_RUN_ID = '33333333-3333-4333-8333-333333333333';
const CHILD_ID = '44444444-4444-4444-8444-444444444444';

test('available actions exposes retry only for latest failed run with permission', async () => {
  const service = new JobOperationService({ state: async () => ({ id:JOB_ID,run_id:RUN_ID,run_status:'FAILED' }) });
  const result = await service.availableActions(JOB_ID,['ai_scoring.operations.retry']);
  assert.equal(result.actions[0].available,true);
  assert.equal(result.actions[0].key,'retry');
});

test('available actions does not expose retry for completed run', async () => {
  const service = new JobOperationService({ state: async () => ({ id:JOB_ID,run_id:RUN_ID,run_status:'COMPLETED' }) });
  const result = await service.availableActions(JOB_ID,['ai_scoring.operations.retry']);
  assert.equal(result.actions[0].available,false);
  assert.match(result.actions[0].reason,/thất bại/);
});

test('retry validates reason and idempotency key before repository mutation', async () => {
  const service = new JobOperationService({ retry: async () => assert.fail('must not query') });
  await assert.rejects(() => service.retry(JOB_ID,{ reason:'x',idempotencyKey:'short' }),error => error.code === 'INVALID_REASON');
  await assert.rejects(() => service.retry(JOB_ID,{ reason:'Retry lỗi provider',idempotencyKey:'short' }),error => error.code === 'INVALID_IDEMPOTENCY_KEY');
});

test('repository retry creates immutable run, outbox and audit in one transaction', async () => {
  const queries = [];
  const executor = { query: async (sql,params) => {
    queries.push({ sql,params });
    if (sql.includes('SELECT j.id') && sql.includes('FOR UPDATE')) return { rows:[{ id:JOB_ID,job_status:'READY_FOR_AI',retry_count:0,submission_id:'44444444-4444-4444-8444-444444444444',run_id:RUN_ID,run_number:1,run_type:'PRODUCTION',run_status:'FAILED',scoring_policy_version:'policy-v1',input_schema_version:1,input_fingerprint:'a'.repeat(64),total_questions:2 }] };
    if (sql.includes('SELECT *,TRUE replayed')) return { rows:[] };
    if (sql.includes('INSERT INTO iig_ai_scoring_runs')) return { rows:[{ id:NEW_RUN_ID,status:'QUEUED',run_type:'RETRY' }] };
    if (sql.includes('INSERT INTO ai_scoring_job_operator_commands')) return { rows:[{ id:'55555555-5555-4555-8555-555555555555',job_id:JOB_ID,source_run_id:RUN_ID,result_run_id:NEW_RUN_ID,action:'RETRY',created_at:new Date().toISOString() }] };
    return { rows:[] };
  } };
  const repository = new JobOperationRepository({ transaction: work => work(executor) });
  const result = await repository.retry({ jobId:JOB_ID,reason:'Retry lỗi provider',idempotencyKey:'retry-key-123',actorId:null,requestId:'req-1' });
  assert.equal(result.resultRunId,NEW_RUN_ID);
  assert.ok(queries.some(query => query.sql.includes('INSERT INTO iig_ai_question_runs')));
  assert.ok(queries.some(query => query.sql.includes('INSERT INTO iig_ai_scoring_outbox')));
  assert.ok(queries.some(query => query.sql.includes('INSERT INTO ai_scoring_admin_audit_events')));
});

test('same idempotency key returns the existing command without a new run', async () => {
  const queries = [];
  const executor = { query: async sql => {
    queries.push(sql);
    if (sql.includes('SELECT j.id') && sql.includes('FOR UPDATE')) return { rows:[{ id:JOB_ID,run_id:RUN_ID,run_status:'FAILED' }] };
    if (sql.includes('SELECT *,TRUE replayed')) return { rows:[{ id:'55555555-5555-4555-8555-555555555555',job_id:JOB_ID,source_run_id:RUN_ID,result_run_id:NEW_RUN_ID,action:'RETRY',replayed:true }] };
    return { rows:[] };
  } };
  const repository = new JobOperationRepository({ transaction: work => work(executor) });
  const result = await repository.retry({ jobId:JOB_ID,reason:'Retry lỗi provider',idempotencyKey:'retry-key-123',requestId:'req-1' });
  assert.equal(result.replayed,true);
  assert.equal(queries.some(sql => sql.includes('INSERT INTO iig_ai_scoring_runs')),false);
});

test('available actions exposes cancel only for an active latest run with permission', async () => {
  const service=new JobOperationService({ state:async()=>({ id:JOB_ID,run_id:RUN_ID,run_status:'SCORING_QUESTIONS' }) });
  const result=await service.availableActions(JOB_ID,['ai_scoring.operations.cancel']);
  assert.equal(result.actions.find(action=>action.key==='cancel').available,true);
  assert.equal(result.actions.find(action=>action.key==='retry').available,false);
});

test('cancel rejects terminal attempts', async () => {
  const service=new JobOperationService({ cancel:async()=>({ invalidState:'COMPLETED' }) });
  await assert.rejects(()=>service.cancel(JOB_ID,{ reason:'Dừng theo yêu cầu vận hành',idempotencyKey:'cancel-key-123' }),error=>error.code==='CANCEL_NOT_AVAILABLE');
});

test('repository cancel preserves completed evidence and dead-letters active work', async () => {
  const queries=[];
  const executor={ query:async(sql,params)=>{
    queries.push({ sql,params });
    if(sql.includes('SELECT j.id')&&sql.includes('FOR UPDATE')) return { rows:[{ id:JOB_ID,submission_id:'44444444-4444-4444-8444-444444444444',run_id:RUN_ID,run_number:2,run_type:'RETRY',run_status:'SCORING_QUESTIONS' }] };
    if(sql.includes('SELECT *,TRUE replayed')) return { rows:[] };
    if(sql.includes('INSERT INTO ai_scoring_job_operator_commands')) return { rows:[{ id:'55555555-5555-4555-8555-555555555555',job_id:JOB_ID,source_run_id:RUN_ID,result_run_id:RUN_ID,action:'CANCEL' }] };
    return { rows:[] };
  } };
  const repository=new JobOperationRepository({ transaction:work=>work(executor) });
  const result=await repository.cancel({ jobId:JOB_ID,reason:'Dừng theo yêu cầu vận hành',idempotencyKey:'cancel-key-123',requestId:'req-2' });
  assert.equal(result.action,'CANCEL');
  assert.ok(queries.some(query=>query.sql.includes("SET status='CANCELLED'")));
  assert.ok(queries.some(query=>query.sql.includes("status='DEAD_LETTER'")));
  const questionUpdate=queries.find(query=>query.sql.includes('UPDATE iig_ai_question_runs'));
  assert.match(questionUpdate.sql,/status IN \('QUEUED','TRANSCRIBING','EXTRACTING_FEATURES','LLM_SCORING'\)/);
  assert.doesNotMatch(questionUpdate.sql,/SCORED/);
  assert.ok(queries.some(query=>query.sql.includes("'SCORING_JOB_CANCEL'")));
});

test('same cancel idempotency key returns existing command without mutating run', async () => {
  const queries=[];
  const executor={ query:async sql=>{
    queries.push(sql);
    if(sql.includes('SELECT j.id')&&sql.includes('FOR UPDATE')) return { rows:[{ id:JOB_ID,run_id:RUN_ID,run_status:'SCORING_QUESTIONS' }] };
    if(sql.includes('SELECT *,TRUE replayed')) return { rows:[{ id:'55555555-5555-4555-8555-555555555555',job_id:JOB_ID,source_run_id:RUN_ID,result_run_id:RUN_ID,action:'CANCEL',replayed:true }] };
    return { rows:[] };
  } };
  const repository=new JobOperationRepository({ transaction:work=>work(executor) });
  const result=await repository.cancel({ jobId:JOB_ID,reason:'Dừng theo yêu cầu vận hành',idempotencyKey:'cancel-key-123',requestId:'req-2' });
  assert.equal(result.replayed,true);
  assert.equal(queries.some(sql=>sql.includes("SET status='CANCELLED'")),false);
});

test('available actions exposes rescore for terminal run and blocks active run', async () => {
  const terminalService=new JobOperationService({ state:async()=>({ id:JOB_ID,run_id:RUN_ID,run_status:'COMPLETED' }) });
  const terminal=await terminalService.availableActions(JOB_ID,['ai_scoring.operations.rescore']);
  assert.equal(terminal.actions.find(action=>action.key==='rescore').available,true);
  const activeService=new JobOperationService({ state:async()=>({ id:JOB_ID,run_id:RUN_ID,run_status:'SCORING_QUESTIONS' }) });
  const active=await activeService.availableActions(JOB_ID,['ai_scoring.operations.rescore']);
  assert.equal(active.actions.find(action=>action.key==='rescore').available,false);
});

test('repository rescore creates a new immutable run with lineage and leaves source result untouched', async () => {
  const queries=[];
  const executor={ query:async(sql,params)=>{
    queries.push({sql,params});
    if(sql.includes('SELECT j.id')&&sql.includes('FOR UPDATE'))return{rows:[{id:JOB_ID,submission_id:'44444444-4444-4444-8444-444444444444',run_id:RUN_ID,run_number:3,run_type:'PRODUCTION',run_status:'COMPLETED',scoring_policy_version:'policy-v1',input_schema_version:1,input_fingerprint:'a'.repeat(64),total_questions:2}]};
    if(sql.includes('SELECT *,TRUE replayed'))return{rows:[]};
    if(sql.includes('INSERT INTO iig_ai_scoring_runs'))return{rows:[{id:NEW_RUN_ID,status:'QUEUED',run_type:'RESCORE'}]};
    if(sql.includes('INSERT INTO ai_scoring_job_operator_commands'))return{rows:[{id:'55555555-5555-4555-8555-555555555555',job_id:JOB_ID,source_run_id:RUN_ID,result_run_id:NEW_RUN_ID,action:'RESCORE'}]};
    return{rows:[]};
  }};
  const repository=new JobOperationRepository({transaction:work=>work(executor)});
  const result=await repository.rescore({jobId:JOB_ID,reason:'Chấm lại theo yêu cầu QA',idempotencyKey:'rescore-key-123',requestId:'req-3'});
  assert.equal(result.resultRunId,NEW_RUN_ID);
  const insertRun=queries.find(query=>query.sql.includes('INSERT INTO iig_ai_scoring_runs'));
  assert.match(insertRun.sql,/rescore_of_run_id/);
  assert.match(insertRun.sql,/'RESCORE'/);
  assert.equal(queries.some(query=>query.sql.includes('UPDATE iig_ai_scoring_runs')),false);
  assert.ok(queries.some(query=>query.sql.includes('INSERT INTO iig_ai_scoring_outbox')));
  assert.ok(queries.some(query=>query.sql.includes("'SCORING_JOB_RESCORE'")));
});

test('same rescore idempotency key does not create a second run', async () => {
  const queries=[];
  const executor={query:async sql=>{
    queries.push(sql);
    if(sql.includes('SELECT j.id')&&sql.includes('FOR UPDATE'))return{rows:[{id:JOB_ID,run_id:RUN_ID,run_status:'COMPLETED'}]};
    if(sql.includes('SELECT *,TRUE replayed'))return{rows:[{id:'55555555-5555-4555-8555-555555555555',job_id:JOB_ID,source_run_id:RUN_ID,result_run_id:NEW_RUN_ID,action:'RESCORE',replayed:true}]};
    return{rows:[]};
  }};
  const repository=new JobOperationRepository({transaction:work=>work(executor)});
  const result=await repository.rescore({jobId:JOB_ID,reason:'Chấm lại theo yêu cầu QA',idempotencyKey:'rescore-key-123',requestId:'req-3'});
  assert.equal(result.replayed,true);
  assert.equal(queries.some(sql=>sql.includes('INSERT INTO iig_ai_scoring_runs')),false);
});

test('available actions exposes reconcile only when stored work is no longer active', async () => {
  const readyService=new JobOperationService({state:async()=>({id:JOB_ID,run_id:RUN_ID,run_status:'COMPLETED',active_items:0})});
  const ready=await readyService.availableActions(JOB_ID,['ai_scoring.operations.reconcile']);
  assert.equal(ready.actions.find(action=>action.key==='reconcile').available,true);
  const activeService=new JobOperationService({state:async()=>({id:JOB_ID,run_id:RUN_ID,run_status:'SCORING_QUESTIONS',active_items:1})});
  const active=await activeService.availableActions(JOB_ID,['ai_scoring.operations.reconcile']);
  assert.equal(active.actions.find(action=>action.key==='reconcile').available,false);
  assert.match(active.actions.find(action=>action.key==='reconcile').reason,/đang xử lý/);
});

test('repository reconcile repairs counters and status without model calls or outbox work', async () => {
  const queries=[];
  const executor={query:async(sql,params)=>{
    queries.push({sql,params});
    if(sql.includes('SELECT j.id')&&sql.includes('FOR UPDATE'))return{rows:[{id:JOB_ID,run_id:RUN_ID,run_number:1,run_type:'PRODUCTION',run_status:'SCORING_QUESTIONS',total_questions:2,completed_questions:1,failed_questions:0,review_questions:0}]};
    if(sql.includes('SELECT *,TRUE replayed'))return{rows:[]};
    if(sql.includes('FROM iig_ai_question_runs WHERE'))return{rows:[{total:2,completed:2,failed:0,review:0,active:0}]};
    if(sql.includes('FROM iig_ai_group_results WHERE'))return{rows:[{active:0,failed:0,review:0}]};
    if(sql.includes('INSERT INTO ai_scoring_job_operator_commands'))return{rows:[{id:'55555555-5555-4555-8555-555555555555',job_id:JOB_ID,source_run_id:RUN_ID,result_run_id:RUN_ID,action:'RECONCILE'}]};
    return{rows:[]};
  }};
  const repository=new JobOperationRepository({transaction:work=>work(executor)});
  const result=await repository.reconcile({jobId:JOB_ID,reason:'Đồng bộ lại trạng thái tổng hợp',idempotencyKey:'reconcile-key-123',requestId:'req-4'});
  assert.equal(result.action,'RECONCILE');
  assert.ok(queries.some(query=>query.sql.includes("SET status='SCORED'")));
  assert.ok(queries.some(query=>query.sql.includes('SET status=$2,total_questions=$3')));
  assert.ok(queries.some(query=>query.sql.includes("'SCORING_JOB_RECONCILE'")));
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO iig_ai_scoring_outbox')),false);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO iig_ai_model_executions')),false);
});

test('same reconcile idempotency key does not update stored scoring state twice', async () => {
  const queries=[];
  const executor={query:async sql=>{
    queries.push(sql);
    if(sql.includes('SELECT j.id')&&sql.includes('FOR UPDATE'))return{rows:[{id:JOB_ID,run_id:RUN_ID,run_status:'COMPLETED'}]};
    if(sql.includes('SELECT *,TRUE replayed'))return{rows:[{id:'55555555-5555-4555-8555-555555555555',job_id:JOB_ID,source_run_id:RUN_ID,result_run_id:RUN_ID,action:'RECONCILE',replayed:true}]};
    return{rows:[]};
  }};
  const repository=new JobOperationRepository({transaction:work=>work(executor)});
  const result=await repository.reconcile({jobId:JOB_ID,reason:'Đồng bộ lại trạng thái tổng hợp',idempotencyKey:'reconcile-key-123',requestId:'req-4'});
  assert.equal(result.replayed,true);
  assert.equal(queries.some(sql=>sql.includes('UPDATE iig_ai_question_runs')),false);
});

test('reconcile rejects runs that still have active question or group work', async () => {
  const service=new JobOperationService({reconcile:async()=>({activeItems:2})});
  await assert.rejects(
    ()=>service.reconcile(JOB_ID,{reason:'Đồng bộ lại trạng thái tổng hợp',idempotencyKey:'reconcile-key-123'}),
    error=>error.code==='RECONCILE_ACTIVE_ITEMS'&&error.details.activeItems===2,
  );
});

test('step retry validates identifiers and operator input before mutation', async () => {
  const service = new JobPipelineService({ retryStep: async () => assert.fail('must not mutate') });
  await assert.rejects(
    () => service.retryStep(JOB_ID, 'ingestion:not-a-step', { reason: 'Retry provider timeout', idempotencyKey: 'step-retry-123' }),
    error => error.code === 'INVALID_STEP_ID',
  );
  await assert.rejects(
    () => service.retryStep(JOB_ID, `scoring:${RUN_ID}`, { reason: 'x', idempotencyKey: 'step-retry-123' }),
    error => error.code === 'INVALID_REASON',
  );
});

test('repository retries only the failed step and writes command, event and audit atomically', async () => {
  const queries = [];
  const executor = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('FROM iig_ai_scoring_outbox o') && sql.includes('FOR UPDATE OF o')) return { rows: [{
      id: RUN_ID, event_type: 'QUESTION_SCORING_REQUESTED', status: 'DEAD_LETTER', publish_attempts: 4,
      payload: { questionRunId: NEW_RUN_ID }, run_id: CHILD_ID, run_number: 2, run_status: 'SCORING_QUESTIONS', job_id: JOB_ID,
    }] };
    if (sql.includes('SELECT *,TRUE replayed')) return { rows: [] };
    if (sql.includes('INSERT INTO ai_scoring_job_operator_commands')) return { rows: [{
      id: '55555555-5555-4555-8555-555555555555', job_id: JOB_ID, source_run_id: CHILD_ID,
      result_run_id: CHILD_ID, action: 'STEP_RETRY', created_at: new Date().toISOString(),
    }] };
    return { rows: [] };
  } };
  const repository = new JobPipelineRepository({ transaction: work => work(executor) });
  const result = await repository.retryStep({ jobId: JOB_ID, stepId: RUN_ID, reason: 'Retry provider timeout', idempotencyKey: 'step-retry-123', requestId: 'req-step' });
  assert.equal(result.action, 'STEP_RETRY');
  assert.ok(queries.some(query => query.sql.includes("SET status='LLM_SCORING'")));
  assert.ok(queries.some(query => query.sql.includes("SET status='PENDING',publish_attempts=0")));
  assert.ok(queries.some(query => query.sql.includes("'OPERATOR_STEP_RETRY_REQUESTED'")));
  assert.ok(queries.some(query => query.sql.includes("'SCORING_STEP_RETRY'")));
  assert.equal(queries.some(query => query.sql.includes('INSERT INTO iig_ai_model_executions')), false);
});

test('same step retry idempotency key does not reset the durable work item twice', async () => {
  const queries = [];
  const executor = { query: async sql => {
    queries.push(sql);
    if (sql.includes('FROM iig_ai_scoring_outbox o') && sql.includes('FOR UPDATE OF o')) return { rows: [{
      id: RUN_ID, event_type: 'QUESTION_SCORING_REQUESTED', status: 'DEAD_LETTER', publish_attempts: 4,
      payload: { questionRunId: NEW_RUN_ID }, run_id: CHILD_ID, run_status: 'SCORING_QUESTIONS',
    }] };
    if (sql.includes('SELECT *,TRUE replayed')) return { rows: [{
      id: '55555555-5555-4555-8555-555555555555', job_id: JOB_ID, source_run_id: CHILD_ID,
      result_run_id: CHILD_ID, action: 'STEP_RETRY', replayed: true,
    }] };
    return { rows: [] };
  } };
  const repository = new JobPipelineRepository({ transaction: work => work(executor) });
  const result = await repository.retryStep({ jobId: JOB_ID, stepId: RUN_ID, reason: 'Retry provider timeout', idempotencyKey: 'step-retry-123', requestId: 'req-step' });
  assert.equal(result.replayed, true);
  assert.equal(queries.some(sql => sql.includes('UPDATE iig_ai_scoring_outbox')), false);
});

test('step retry rejects a failed work item belonging to a terminal run', async () => {
  const service = new JobPipelineService({ retryStep: async () => ({ invalidRunState: 'FAILED' }) });
  await assert.rejects(
    () => service.retryStep(JOB_ID, `scoring:${RUN_ID}`, { reason: 'Retry provider timeout', idempotencyKey: 'step-retry-123' }),
    error => error.code === 'STEP_RETRY_RUN_TERMINAL',
  );
});
