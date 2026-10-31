const db = require('../../config/db');

const mapCommand = row => ({
  id: row.id,
  action: row.action,
  jobId: row.job_id,
  sourceRunId: row.source_run_id,
  resultRunId: row.result_run_id,
  replayed: Boolean(row.replayed),
  createdAt: row.created_at,
});

class JobOperationRepository {
  constructor(database = db) { this.db = database; }

  async state(jobId) {
    const result = await this.db.query(`SELECT j.id,j.status job_status,j.retry_count,s.id submission_id,
      r.id run_id,r.run_number,r.run_type,r.status run_status,r.scoring_policy_version,r.input_schema_version,r.input_fingerprint,
      CASE WHEN r.id IS NULL THEN 0 ELSE
        (SELECT COUNT(*) FROM iig_ai_question_runs qr WHERE qr.scoring_run_id=r.id AND qr.status IN ('QUEUED','TRANSCRIBING','EXTRACTING_FEATURES','LLM_SCORING') AND qr.llm_score IS NULL) +
        (SELECT COUNT(*) FROM iig_ai_group_results gr WHERE gr.scoring_run_id=r.id AND gr.status IN ('WAITING','AGGREGATING','CALIBRATING') AND gr.final_score IS NULL)
      END active_items
      FROM iig_scoring_jobs j
      LEFT JOIN iig_submissions s ON s.scoring_job_id=j.id
      LEFT JOIN LATERAL (SELECT * FROM iig_ai_scoring_runs WHERE submission_id=s.id ORDER BY run_number DESC LIMIT 1) r ON true
      WHERE j.id=$1`, [jobId]);
    return result.rows[0] || null;
  }

  async retry({ jobId, reason, idempotencyKey, actorId, requestId }) {
    return this.db.transaction(async executor => {
      const stateResult = await executor.query(`SELECT j.id,j.status job_status,j.retry_count,s.id submission_id,
        r.id run_id,r.run_number,r.run_type,r.status run_status,r.scoring_policy_version,r.input_schema_version,r.input_fingerprint,r.total_questions
        FROM iig_scoring_jobs j
        JOIN iig_submissions s ON s.scoring_job_id=j.id
        JOIN iig_ai_scoring_runs r ON r.submission_id=s.id AND r.id=(SELECT latest.id FROM iig_ai_scoring_runs latest WHERE latest.submission_id=s.id ORDER BY latest.run_number DESC LIMIT 1)
        WHERE j.id=$1 FOR UPDATE OF j,s,r`, [jobId]);
      const state = stateResult.rows[0];
      if (!state) return { missing: true };

      const existing = await executor.query(`SELECT *,TRUE replayed FROM ai_scoring_job_operator_commands
        WHERE job_id=$1 AND action='RETRY' AND idempotency_key=$2`, [jobId, idempotencyKey]);
      if (existing.rows[0]) return mapCommand(existing.rows[0]);
      if (state.run_status !== 'FAILED') return { invalidState: state.run_status || state.job_status };

      const nextNumber = Number(state.run_number) + 1;
      const requestKey = `operator-retry:${jobId}:${idempotencyKey}`;
      const runResult = await executor.query(`INSERT INTO iig_ai_scoring_runs
        (submission_id,run_number,run_type,request_key,status,scoring_policy_version,input_schema_version,input_fingerprint,total_questions,retry_of_run_id)
        VALUES($1,$2,'RETRY',$3,'QUEUED',$4,$5,$6,$7,$8) RETURNING *`,
        [state.submission_id,nextNumber,requestKey,state.scoring_policy_version,state.input_schema_version,state.input_fingerprint,state.total_questions,state.run_id]);
      const run = runResult.rows[0];

      await executor.query(`INSERT INTO iig_ai_question_runs
        (scoring_run_id,question_attempt_id,status,input_schema_version,input_fingerprint)
        SELECT $1,question_attempt_id,'QUEUED',input_schema_version,input_fingerprint
        FROM iig_ai_question_runs WHERE scoring_run_id=$2`, [run.id,state.run_id]);
      await executor.query(`INSERT INTO iig_ai_group_results
        (scoring_run_id,score_group_id,status,aggregation_version)
        SELECT $1,score_group_id,'WAITING',aggregation_version
        FROM iig_ai_group_results WHERE scoring_run_id=$2`, [run.id,state.run_id]);
      await executor.query(`INSERT INTO iig_ai_scoring_outbox
        (scoring_run_id,event_type,deduplication_key,payload)
        VALUES($1,'AI_SCORING_REQUESTED',$2,$3::jsonb)`, [run.id,`iig-ai-scoring-run:${run.id}:start:v1`,JSON.stringify({ scoringRunId:run.id,submissionId:state.submission_id,inputFingerprint:state.input_fingerprint,operatorRetry:true,sourceRunId:state.run_id })]);
      await executor.query(`INSERT INTO iig_ai_scoring_events
        (scoring_run_id,event_type,from_status,to_status,details)
        VALUES($1,'OPERATOR_RETRY_CREATED',$2,'QUEUED',$3::jsonb)`, [run.id,state.run_status,JSON.stringify({ sourceRunId:state.run_id,reason,actorId,requestId })]);
      await executor.query(`UPDATE iig_scoring_jobs SET retry_count=retry_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [jobId]);

      const before = { runId:state.run_id,runNumber:Number(state.run_number),status:state.run_status };
      const after = { runId:run.id,runNumber:nextNumber,status:run.status,runType:run.run_type };
      const command = await executor.query(`INSERT INTO ai_scoring_job_operator_commands
        (job_id,source_run_id,result_run_id,action,idempotency_key,actor_id,reason,request_id,before_state,after_state)
        VALUES($1,$2,$3,'RETRY',$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING *`,
        [jobId,state.run_id,run.id,idempotencyKey,actorId||null,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      await executor.query(`INSERT INTO ai_scoring_admin_audit_events
        (actor_id,action,resource_type,resource_id,reason,request_id,before_state,after_state)
        VALUES($1,'SCORING_JOB_RETRY','SCORING_JOB',$2,$3,$4,$5::jsonb,$6::jsonb)`,
        [actorId||null,jobId,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      return mapCommand(command.rows[0]);
    });
  }

  async cancel({ jobId, reason, idempotencyKey, actorId, requestId }) {
    return this.db.transaction(async executor => {
      const stateResult = await executor.query(`SELECT j.id,j.status job_status,s.id submission_id,
        r.id run_id,r.run_number,r.run_type,r.status run_status
        FROM iig_scoring_jobs j
        JOIN iig_submissions s ON s.scoring_job_id=j.id
        JOIN iig_ai_scoring_runs r ON r.submission_id=s.id AND r.id=(SELECT latest.id FROM iig_ai_scoring_runs latest WHERE latest.submission_id=s.id ORDER BY latest.run_number DESC LIMIT 1)
        WHERE j.id=$1 FOR UPDATE OF j,s,r`, [jobId]);
      const state = stateResult.rows[0];
      if (!state) return { missing:true };
      const existing = await executor.query(`SELECT *,TRUE replayed FROM ai_scoring_job_operator_commands
        WHERE job_id=$1 AND action='CANCEL' AND idempotency_key=$2`, [jobId,idempotencyKey]);
      if (existing.rows[0]) return mapCommand(existing.rows[0]);
      const active = ['QUEUED','TRANSCRIBING','EXTRACTING_FEATURES','SCORING_QUESTIONS','AGGREGATING_GROUPS','CALIBRATING'];
      if (!active.includes(state.run_status)) return { invalidState:state.run_status||state.job_status };

      await executor.query(`UPDATE iig_ai_scoring_runs SET status='CANCELLED',completed_at=CURRENT_TIMESTAMP,
        error_code='OPERATOR_CANCELLED',error_message=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [state.run_id,reason]);
      await executor.query(`UPDATE iig_ai_question_runs SET status='SKIPPED',error_code='OPERATOR_CANCELLED',error_message=$2,
        completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
        WHERE scoring_run_id=$1 AND status IN ('QUEUED','TRANSCRIBING','EXTRACTING_FEATURES','LLM_SCORING')`, [state.run_id,reason]);
      await executor.query(`UPDATE iig_ai_group_results SET status='SKIPPED',error_code='OPERATOR_CANCELLED',error_message=$2,
        completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
        WHERE scoring_run_id=$1 AND status IN ('WAITING','AGGREGATING','CALIBRATING')`, [state.run_id,reason]);
      await executor.query(`UPDATE iig_ai_model_executions SET status='CANCELLED',error_code='OPERATOR_CANCELLED',error_message=$2,
        completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP) WHERE scoring_run_id=$1 AND status='PROCESSING'`, [state.run_id,reason]);
      await executor.query(`UPDATE iig_ai_scoring_outbox SET status='DEAD_LETTER',last_error='OPERATOR_CANCELLED',
        locked_at=NULL,locked_by=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE scoring_run_id=$1 AND status IN ('PENDING','PROCESSING','FAILED')`, [state.run_id]);
      await executor.query(`INSERT INTO iig_ai_scoring_events(scoring_run_id,event_type,from_status,to_status,details)
        VALUES($1,'OPERATOR_CANCELLED',$2,'CANCELLED',$3::jsonb)`, [state.run_id,state.run_status,JSON.stringify({ reason,actorId,requestId })]);

      const before={ runId:state.run_id,runNumber:Number(state.run_number),status:state.run_status };
      const after={ ...before,status:'CANCELLED' };
      const command=await executor.query(`INSERT INTO ai_scoring_job_operator_commands
        (job_id,source_run_id,result_run_id,action,idempotency_key,actor_id,reason,request_id,before_state,after_state)
        VALUES($1,$2,$2,'CANCEL',$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING *`,
        [jobId,state.run_id,idempotencyKey,actorId||null,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      await executor.query(`INSERT INTO ai_scoring_admin_audit_events
        (actor_id,action,resource_type,resource_id,reason,request_id,before_state,after_state)
        VALUES($1,'SCORING_JOB_CANCEL','SCORING_JOB',$2,$3,$4,$5::jsonb,$6::jsonb)`,
        [actorId||null,jobId,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      return mapCommand(command.rows[0]);
    });
  }

  async rescore({ jobId, reason, idempotencyKey, actorId, requestId }) {
    return this.db.transaction(async executor => {
      const stateResult=await executor.query(`SELECT j.id,j.status job_status,s.id submission_id,
        r.id run_id,r.run_number,r.run_type,r.status run_status,r.scoring_policy_version,r.input_schema_version,r.input_fingerprint,r.total_questions
        FROM iig_scoring_jobs j
        JOIN iig_submissions s ON s.scoring_job_id=j.id
        JOIN iig_ai_scoring_runs r ON r.submission_id=s.id AND r.id=(SELECT latest.id FROM iig_ai_scoring_runs latest WHERE latest.submission_id=s.id ORDER BY latest.run_number DESC LIMIT 1)
        WHERE j.id=$1 FOR UPDATE OF j,s,r`,[jobId]);
      const state=stateResult.rows[0];
      if(!state)return{missing:true};
      const existing=await executor.query(`SELECT *,TRUE replayed FROM ai_scoring_job_operator_commands
        WHERE job_id=$1 AND action='RESCORE' AND idempotency_key=$2`,[jobId,idempotencyKey]);
      if(existing.rows[0])return mapCommand(existing.rows[0]);
      const terminal=['COMPLETED','COMPLETED_WITH_ISSUES','REVIEW_REQUIRED','FAILED','CANCELLED'];
      if(!terminal.includes(state.run_status))return{invalidState:state.run_status||state.job_status};

      const nextNumber=Number(state.run_number)+1;
      const runResult=await executor.query(`INSERT INTO iig_ai_scoring_runs
        (submission_id,run_number,run_type,request_key,status,scoring_policy_version,input_schema_version,input_fingerprint,total_questions,rescore_of_run_id)
        VALUES($1,$2,'RESCORE',$3,'QUEUED',$4,$5,$6,$7,$8) RETURNING *`,
        [state.submission_id,nextNumber,`operator-rescore:${jobId}:${idempotencyKey}`,state.scoring_policy_version,state.input_schema_version,state.input_fingerprint,state.total_questions,state.run_id]);
      const run=runResult.rows[0];
      await executor.query(`INSERT INTO iig_ai_question_runs(scoring_run_id,question_attempt_id,status,input_schema_version,input_fingerprint)
        SELECT $1,question_attempt_id,'QUEUED',input_schema_version,input_fingerprint FROM iig_ai_question_runs WHERE scoring_run_id=$2`,[run.id,state.run_id]);
      await executor.query(`INSERT INTO iig_ai_group_results(scoring_run_id,score_group_id,status,aggregation_version)
        SELECT $1,score_group_id,'WAITING',aggregation_version FROM iig_ai_group_results WHERE scoring_run_id=$2`,[run.id,state.run_id]);
      await executor.query(`INSERT INTO iig_ai_scoring_outbox(scoring_run_id,event_type,deduplication_key,payload)
        VALUES($1,'AI_SCORING_REQUESTED',$2,$3::jsonb)`,[run.id,`iig-ai-scoring-run:${run.id}:start:v1`,JSON.stringify({ scoringRunId:run.id,submissionId:state.submission_id,inputFingerprint:state.input_fingerprint,operatorRescore:true,sourceRunId:state.run_id })]);
      await executor.query(`INSERT INTO iig_ai_scoring_events(scoring_run_id,event_type,from_status,to_status,details)
        VALUES($1,'OPERATOR_RESCORE_CREATED',$2,'QUEUED',$3::jsonb)`,[run.id,state.run_status,JSON.stringify({ sourceRunId:state.run_id,reason,actorId,requestId })]);

      const before={ runId:state.run_id,runNumber:Number(state.run_number),status:state.run_status };
      const after={ runId:run.id,runNumber:nextNumber,status:run.status,runType:run.run_type };
      const command=await executor.query(`INSERT INTO ai_scoring_job_operator_commands
        (job_id,source_run_id,result_run_id,action,idempotency_key,actor_id,reason,request_id,before_state,after_state)
        VALUES($1,$2,$3,'RESCORE',$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING *`,
        [jobId,state.run_id,run.id,idempotencyKey,actorId||null,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      await executor.query(`INSERT INTO ai_scoring_admin_audit_events
        (actor_id,action,resource_type,resource_id,reason,request_id,before_state,after_state)
        VALUES($1,'SCORING_JOB_RESCORE','SCORING_JOB',$2,$3,$4,$5::jsonb,$6::jsonb)`,
        [actorId||null,jobId,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      return mapCommand(command.rows[0]);
    });
  }

  async reconcile({ jobId, reason, idempotencyKey, actorId, requestId }) {
    return this.db.transaction(async executor => {
      const stateResult=await executor.query(`SELECT j.id,j.status job_status,s.id submission_id,
        r.id run_id,r.run_number,r.run_type,r.status run_status,r.total_questions,r.completed_questions,r.failed_questions,r.review_questions
        FROM iig_scoring_jobs j
        JOIN iig_submissions s ON s.scoring_job_id=j.id
        JOIN iig_ai_scoring_runs r ON r.submission_id=s.id AND r.id=(SELECT latest.id FROM iig_ai_scoring_runs latest WHERE latest.submission_id=s.id ORDER BY latest.run_number DESC LIMIT 1)
        WHERE j.id=$1 FOR UPDATE OF j,s,r`,[jobId]);
      const state=stateResult.rows[0];
      if(!state)return{missing:true};
      const existing=await executor.query(`SELECT *,TRUE replayed FROM ai_scoring_job_operator_commands
        WHERE job_id=$1 AND action='RECONCILE' AND idempotency_key=$2`,[jobId,idempotencyKey]);
      if(existing.rows[0])return mapCommand(existing.rows[0]);
      if(state.run_status==='CANCELLED')return{invalidState:state.run_status};

      await executor.query(`UPDATE iig_ai_question_runs SET status='SCORED',completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
        WHERE scoring_run_id=$1 AND llm_score IS NOT NULL AND status IN ('QUEUED','TRANSCRIBING','EXTRACTING_FEATURES','LLM_SCORING')`,[state.run_id]);
      await executor.query(`UPDATE iig_ai_group_results SET status='COMPLETED',completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
        WHERE scoring_run_id=$1 AND final_score IS NOT NULL AND status IN ('WAITING','AGGREGATING','CALIBRATING')`,[state.run_id]);
      const summaryResult=await executor.query(`SELECT
        COUNT(*)::int total,
        COUNT(*) FILTER(WHERE status='SCORED')::int completed,
        COUNT(*) FILTER(WHERE status IN ('FAILED','INVALID_INPUT','INVALID_AUDIO','SKIPPED'))::int failed,
        COUNT(*) FILTER(WHERE status='REVIEW_REQUIRED')::int review,
        COUNT(*) FILTER(WHERE status IN ('QUEUED','TRANSCRIBING','EXTRACTING_FEATURES','LLM_SCORING'))::int active
        FROM iig_ai_question_runs WHERE scoring_run_id=$1`,[state.run_id]);
      const groupResult=await executor.query(`SELECT
        COUNT(*) FILTER(WHERE status IN ('WAITING','AGGREGATING','CALIBRATING'))::int active,
        COUNT(*) FILTER(WHERE status IN ('FAILED','SKIPPED'))::int failed,
        COUNT(*) FILTER(WHERE status='REVIEW_REQUIRED')::int review
        FROM iig_ai_group_results WHERE scoring_run_id=$1`,[state.run_id]);
      const summary=summaryResult.rows[0]; const groups=groupResult.rows[0];
      if(Number(summary.active)+Number(groups.active)>0)return{activeItems:Number(summary.active)+Number(groups.active)};
      const total=Number(summary.total); const completed=Number(summary.completed); const failed=Number(summary.failed); const review=Number(summary.review);
      let status='COMPLETED';
      if(total===0||(failed===total&&total>0))status='FAILED';
      else if(failed>0||Number(groups.failed)>0)status='COMPLETED_WITH_ISSUES';
      else if(review>0||Number(groups.review)>0)status='REVIEW_REQUIRED';
      await executor.query(`UPDATE iig_ai_scoring_runs SET status=$2,total_questions=$3,completed_questions=$4,failed_questions=$5,review_questions=$6,
        completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[state.run_id,status,total,completed,failed,review]);
      const before={runId:state.run_id,runNumber:Number(state.run_number),status:state.run_status,total:Number(state.total_questions),completed:Number(state.completed_questions),failed:Number(state.failed_questions),review:Number(state.review_questions)};
      const after={runId:state.run_id,runNumber:Number(state.run_number),status,total,completed,failed,review};
      await executor.query(`INSERT INTO iig_ai_scoring_events(scoring_run_id,event_type,from_status,to_status,details)
        VALUES($1,'OPERATOR_RECONCILED',$2,$3,$4::jsonb)`,[state.run_id,state.run_status,status,JSON.stringify({reason,actorId,requestId,before,after})]);
      const command=await executor.query(`INSERT INTO ai_scoring_job_operator_commands
        (job_id,source_run_id,result_run_id,action,idempotency_key,actor_id,reason,request_id,before_state,after_state)
        VALUES($1,$2,$2,'RECONCILE',$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING *`,[jobId,state.run_id,idempotencyKey,actorId||null,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      await executor.query(`INSERT INTO ai_scoring_admin_audit_events
        (actor_id,action,resource_type,resource_id,reason,request_id,before_state,after_state)
        VALUES($1,'SCORING_JOB_RECONCILE','SCORING_JOB',$2,$3,$4,$5::jsonb,$6::jsonb)`,[actorId||null,jobId,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      return mapCommand(command.rows[0]);
    });
  }
}

module.exports = new JobOperationRepository();
module.exports.JobOperationRepository = JobOperationRepository;
