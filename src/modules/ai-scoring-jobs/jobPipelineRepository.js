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

class JobPipelineRepository {
  constructor(database = db) { this.db = database; }

  async workItems(jobId, runId) {
    const ingestion = await this.db.query(`SELECT o.id,o.event_type,o.status,o.publish_attempts,o.available_at,o.published_at,
      o.last_error,o.payload,o.created_at,o.updated_at,j.status owner_status,j.error_code owner_error_code,j.error_message owner_error_message
      FROM iig_ingestion_outbox o
      JOIN iig_scoring_jobs j ON j.id=o.aggregate_id
      WHERE o.aggregate_type='IIG_SCORING_JOB' AND j.id=$1
      ORDER BY o.created_at,o.id`, [jobId]);
    const values = [jobId];
    const runClause = runId ? (values.push(runId), `AND r.id=$${values.length}`) : '';
    const scoring = await this.db.query(`SELECT o.id,o.event_type,o.status,o.publish_attempts,o.available_at,o.published_at,
      o.last_error,o.payload,o.created_at,o.updated_at,r.id run_id,r.run_number,r.status run_status,
      qr.status question_status,qr.llm_score,qr.error_code question_error_code,qr.error_message question_error_message,
      gr.status group_status,gr.final_score,gr.error_code group_error_code,gr.error_message group_error_message,
      me.provider,me.model_name,me.model_version,me.latency_ms,me.status model_status
      FROM iig_ai_scoring_outbox o
      JOIN iig_ai_scoring_runs r ON r.id=o.scoring_run_id
      JOIN iig_submissions s ON s.id=r.submission_id
      LEFT JOIN iig_ai_question_runs qr ON qr.id::text=o.payload->>'questionRunId'
      LEFT JOIN iig_ai_group_results gr ON gr.id::text=o.payload->>'groupResultId'
      LEFT JOIN LATERAL (
        SELECT provider,model_name,model_version,latency_ms,status
        FROM iig_ai_model_executions execution
        WHERE execution.scoring_run_id=r.id
          AND (execution.question_run_id=qr.id OR execution.group_result_id=gr.id)
        ORDER BY execution.created_at DESC LIMIT 1
      ) me ON true
      WHERE s.scoring_job_id=$1 ${runClause}
      ORDER BY r.run_number,o.created_at,o.id`, values);
    return { ingestion: ingestion.rows, scoring: scoring.rows };
  }

  async retryStep({ jobId, stepId, reason, idempotencyKey, actorId, requestId }) {
    return this.db.transaction(async executor => {
      const step = await executor.query(`SELECT o.*,r.id run_id,r.run_number,r.status run_status,s.scoring_job_id job_id
        FROM iig_ai_scoring_outbox o
        JOIN iig_ai_scoring_runs r ON r.id=o.scoring_run_id
        JOIN iig_submissions s ON s.id=r.submission_id
        WHERE o.id=$1 AND s.scoring_job_id=$2 FOR UPDATE OF o`, [stepId,jobId]);
      const state = step.rows[0];
      if (!state) return { missing:true };
      const existing = await executor.query(`SELECT *,TRUE replayed FROM ai_scoring_job_operator_commands
        WHERE job_id=$1 AND action='STEP_RETRY' AND idempotency_key=$2`, [jobId,idempotencyKey]);
      if (existing.rows[0]) return mapCommand(existing.rows[0]);
      if (!['FAILED','DEAD_LETTER'].includes(state.status)) return { invalidState:state.status };
      if (!['TRANSCRIBING','EXTRACTING_FEATURES','SCORING_QUESTIONS','AGGREGATING_GROUPS','CALIBRATING'].includes(state.run_status)) {
        return { invalidRunState:state.run_status };
      }

      const questionRunId = state.payload?.questionRunId || null;
      const groupResultId = state.payload?.groupResultId || null;
      const featureSetId = state.payload?.featureSetId || null;
      if (state.event_type === 'ANSWER_TRANSCRIPTION_REQUESTED') {
        await executor.query(`UPDATE iig_ai_answer_transcriptions SET status='PENDING',error_code=NULL,error_message=NULL,
          completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id::text=$1`, [state.payload?.transcriptionId || '']);
        await executor.query(`UPDATE iig_ai_question_runs SET status='TRANSCRIBING',error_code=NULL,error_message=NULL,
          completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id::text=$1 AND scoring_run_id=$2`, [questionRunId || '',state.run_id]);
      } else if (state.event_type === 'FEATURE_EXTRACTION_REQUESTED') {
        await executor.query(`UPDATE iig_ai_question_runs SET status='EXTRACTING_FEATURES',error_code=NULL,error_message=NULL,
          completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id::text=$1 AND scoring_run_id=$2`, [questionRunId || '',state.run_id]);
      } else if (['SPEECH_EVIDENCE_REQUESTED','TASK_EVIDENCE_REQUESTED'].includes(state.event_type)) {
        await executor.query(`UPDATE iig_ai_feature_sets SET status='PENDING',error_code=NULL,error_message=NULL,
          updated_at=CURRENT_TIMESTAMP WHERE id::text=$1`, [featureSetId || '']);
        await executor.query(`UPDATE iig_ai_question_runs SET status='EXTRACTING_FEATURES',error_code=NULL,error_message=NULL,
          completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id::text=$1 AND scoring_run_id=$2`, [questionRunId || '',state.run_id]);
      } else if (state.event_type === 'QUESTION_SCORING_REQUESTED') {
        await executor.query(`UPDATE iig_ai_question_runs SET status='LLM_SCORING',error_code=NULL,error_message=NULL,
          completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id::text=$1 AND scoring_run_id=$2`, [questionRunId || '',state.run_id]);
      } else if (state.event_type === 'GROUP_SCORING_REQUESTED') {
        await executor.query(`UPDATE iig_ai_group_results SET status='AGGREGATING',error_code=NULL,error_message=NULL,
          completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id::text=$1 AND scoring_run_id=$2`, [groupResultId || '',state.run_id]);
      } else {
        return { unsupported:state.event_type };
      }

      await executor.query(`UPDATE iig_ai_scoring_outbox SET status='PENDING',publish_attempts=0,available_at=CURRENT_TIMESTAMP,
        locked_at=NULL,locked_by=NULL,published_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [state.id]);
      const before={ stepId:state.id,eventType:state.event_type,status:state.status,attempts:Number(state.publish_attempts),runStatus:state.run_status };
      const after={ ...before,status:'PENDING',attempts:0 };
      await executor.query(`INSERT INTO iig_ai_scoring_events(scoring_run_id,question_run_id,group_result_id,event_type,from_status,to_status,details)
        VALUES($1,$2,$3,'OPERATOR_STEP_RETRY_REQUESTED',$4,'PENDING',$5::jsonb)`,
        [state.run_id,questionRunId,groupResultId,state.status,JSON.stringify({ stepId:state.id,workType:state.event_type,reason,actorId,requestId })]);
      const command = await executor.query(`INSERT INTO ai_scoring_job_operator_commands
        (job_id,source_run_id,result_run_id,action,idempotency_key,actor_id,reason,request_id,before_state,after_state)
        VALUES($1,$2,$2,'STEP_RETRY',$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING *`,
        [jobId,state.run_id,idempotencyKey,actorId||null,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      await executor.query(`INSERT INTO ai_scoring_admin_audit_events
        (actor_id,action,resource_type,resource_id,reason,request_id,before_state,after_state)
        VALUES($1,'SCORING_STEP_RETRY','SCORING_JOB',$2,$3,$4,$5::jsonb,$6::jsonb)`,
        [actorId||null,jobId,reason,requestId,JSON.stringify(before),JSON.stringify(after)]);
      return mapCommand(command.rows[0]);
    });
  }
}

module.exports = new JobPipelineRepository();
module.exports.JobPipelineRepository = JobPipelineRepository;
