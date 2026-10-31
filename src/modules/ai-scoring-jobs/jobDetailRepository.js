const db = require('../../config/db');

class JobDetailRepository {
  constructor(database = db) { this.db = database; }

  async overview(jobId) {
    const result = await this.db.query(`SELECT j.id,j.source_scoring_id,j.keycode,j.partner,j.status job_status,j.total_questions,j.ready_questions,j.invalid_questions,j.retry_count,j.error_code,j.error_message,j.accepted_at,j.started_at,j.completed_at,j.updated_at,
      s.id submission_id,s.status submission_status,s.source_status,s.exam_version_id,s.submitted_at,
      t.id tenant_id,t.code tenant_code,t.name tenant_name,c.id credential_id,c.name credential_name,
      r.id run_id,r.run_number,r.run_type,r.status run_status,r.scoring_policy_version,r.total_questions run_total,r.completed_questions,r.failed_questions,r.review_questions,r.requested_at,r.started_at run_started_at,r.completed_at run_completed_at
      FROM iig_scoring_jobs j
      LEFT JOIN integration_api_credentials c ON c.id=j.credential_id
      LEFT JOIN integration_tenants t ON t.id=c.tenant_id
      LEFT JOIN iig_submissions s ON s.scoring_job_id=j.id
      LEFT JOIN LATERAL (SELECT * FROM iig_ai_scoring_runs WHERE submission_id=s.id ORDER BY run_number DESC LIMIT 1) r ON true
      WHERE j.id=$1`, [jobId]);
    return result.rows[0] || null;
  }

  async attempts(jobId) {
    const result = await this.db.query(`SELECT r.id,r.run_number,r.run_type,r.status,r.scoring_policy_version,r.input_schema_version,r.total_questions,r.completed_questions,r.failed_questions,r.review_questions,r.error_code,r.error_message,r.requested_at,r.started_at,r.completed_at
      FROM iig_ai_scoring_runs r JOIN iig_submissions s ON s.id=r.submission_id
      WHERE s.scoring_job_id=$1 ORDER BY r.run_number DESC`, [jobId]);
    return result.rows;
  }

  async plan(jobId, runId) {
    const values = [jobId]; const runClause = runId ? (values.push(runId), `AND r.id=$${values.length}`) : '';
    const run = await this.db.query(`SELECT r.* FROM iig_ai_scoring_runs r JOIN iig_submissions s ON s.id=r.submission_id WHERE s.scoring_job_id=$1 ${runClause} ORDER BY r.run_number DESC LIMIT 1`, values);
    if (!run.rows[0]) return { run: null, groups: [] };
    const groups = await this.db.query(`SELECT gr.id,gr.scoring_run_id,gr.status,gr.aggregation_version,gr.final_score,gr.decision_code,gr.error_code,gr.completed_at,g.source_group_id,g.group_key,g.name,g.min_score,g.max_score,g.sort_order,
        COALESCE(jsonb_agg(DISTINCT q.source_question_id) FILTER (WHERE q.id IS NOT NULL),'[]'::jsonb) applied_question_ids
        FROM iig_ai_group_results gr
        JOIN iig_exam_score_groups g ON g.id=gr.score_group_id
        LEFT JOIN iig_exam_question_score_groups qg ON qg.score_group_id=g.id LEFT JOIN iig_exam_questions q ON q.id=qg.question_id
        WHERE gr.scoring_run_id=$1 GROUP BY gr.id,g.id ORDER BY g.sort_order`, [run.rows[0].id]);
    return { run: run.rows[0] || null, groups: groups.rows };
  }

  async questions(jobId, runId) {
    const values = [jobId];
    const runClause = runId
      ? (values.push(runId), `AND r.id=$${values.length}`)
      : `AND r.id=(SELECT latest.id FROM iig_ai_scoring_runs latest WHERE latest.submission_id=s.id ORDER BY latest.run_number DESC LIMIT 1)`;
    const result = await this.db.query(`SELECT qr.id,qr.scoring_run_id,qr.status,qr.llm_score,qr.llm_confidence,qr.criteria_scores,qr.flags,qr.error_code,qr.error_message,qr.started_at,qr.completed_at,
      qa.id question_attempt_id,qa.source_choose_id,qa.readiness_status,qa.retry_count,q.id question_id,q.source_question_id,q.question_key,q.question_number,q.scorer_type,q.title,sec.name section_name,sec.section_type,
      tr.transcript,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(g.source_group_id,g.group_key)) FILTER (WHERE g.id IS NOT NULL),NULL) group_ids
      FROM iig_ai_question_runs qr JOIN iig_ai_scoring_runs r ON r.id=qr.scoring_run_id JOIN iig_submissions s ON s.id=r.submission_id
      JOIN iig_question_attempts qa ON qa.id=qr.question_attempt_id JOIN iig_exam_questions q ON q.id=qa.exam_question_id JOIN iig_exam_sections sec ON sec.id=q.section_id
      LEFT JOIN iig_ai_answer_transcriptions tr ON tr.id=qr.transcription_id
      LEFT JOIN iig_exam_question_score_groups qg ON qg.question_id=q.id LEFT JOIN iig_exam_score_groups g ON g.id=qg.score_group_id
      WHERE s.scoring_job_id=$1 ${runClause} GROUP BY qr.id,qa.id,q.id,sec.id,tr.id ORDER BY sec.sort_order,q.sort_order`, values);
    return result.rows;
  }

  async question(jobId, questionId) {
    const result = await this.db.query(`SELECT qr.id,qr.status,qr.llm_score,qr.llm_confidence,qr.criteria_scores,qr.flags,qr.error_code,qr.error_message,qr.started_at,qr.completed_at,
      q.id question_id,q.source_question_id,q.question_key,q.question_number,q.scorer_type,q.title,q.prompt_text,q.context_text,sec.name section_name,
      tr.status transcription_status,tr.transcript,tr.language_code,tr.provider transcription_provider,tr.model_name transcription_model,tr.confidence transcription_confidence
      FROM iig_ai_question_runs qr JOIN iig_ai_scoring_runs r ON r.id=qr.scoring_run_id JOIN iig_submissions s ON s.id=r.submission_id
      JOIN iig_question_attempts qa ON qa.id=qr.question_attempt_id JOIN iig_exam_questions q ON q.id=qa.exam_question_id JOIN iig_exam_sections sec ON sec.id=q.section_id
      LEFT JOIN iig_ai_answer_transcriptions tr ON tr.id=qr.transcription_id
      WHERE s.scoring_job_id=$1 AND (qr.id=$2 OR q.id=$2) ORDER BY r.run_number DESC LIMIT 1`, [jobId, questionId]);
    return result.rows[0] || null;
  }

  async group(jobId, groupId) {
    const result = await this.db.query(`SELECT gr.id,gr.status,gr.aggregation_version,gr.question_scores,gr.llm_group_score,gr.ml_model_version,gr.ml_suggested_score,gr.ml_confidence,gr.final_score,gr.decision_code,gr.decision_metadata,gr.error_code,gr.error_message,gr.completed_at,
      g.source_group_id,g.group_key,g.name,g.min_score,g.max_score,
      COALESCE(jsonb_agg(jsonb_build_object('questionId',q.source_question_id,'questionKey',q.question_key,'number',q.question_number) ORDER BY q.sort_order) FILTER (WHERE q.id IS NOT NULL),'[]'::jsonb) questions
      FROM iig_ai_group_results gr JOIN iig_ai_scoring_runs r ON r.id=gr.scoring_run_id JOIN iig_submissions s ON s.id=r.submission_id
      JOIN iig_exam_score_groups g ON g.id=gr.score_group_id LEFT JOIN iig_exam_question_score_groups qg ON qg.score_group_id=g.id LEFT JOIN iig_exam_questions q ON q.id=qg.question_id
      WHERE s.scoring_job_id=$1 AND (gr.id=$2 OR g.id=$2) GROUP BY gr.id,g.id ORDER BY r.run_number DESC LIMIT 1`, [jobId, groupId]);
    return result.rows[0] || null;
  }

  async timeline(jobId) {
    const result = await this.db.query(`SELECT id::text,event_type,from_status,to_status,details,created_at,'INGESTION' source FROM iig_processing_events WHERE scoring_job_id=$1
      UNION ALL
      SELECT e.id::text,e.event_type,e.from_status,e.to_status,e.details,e.created_at,'SCORING' source FROM iig_ai_scoring_events e JOIN iig_ai_scoring_runs r ON r.id=e.scoring_run_id JOIN iig_submissions s ON s.id=r.submission_id WHERE s.scoring_job_id=$1
      ORDER BY created_at,id`, [jobId]);
    return result.rows;
  }

  async modelExecutions(jobId) {
    const result = await this.db.query(`SELECT e.id,e.scoring_run_id,e.question_run_id,e.group_result_id,e.stage,e.provider,e.model_name,e.model_version,e.prompt_version,e.status,e.latency_ms,e.error_code,e.started_at,e.completed_at
      FROM iig_ai_model_executions e JOIN iig_ai_scoring_runs r ON r.id=e.scoring_run_id JOIN iig_submissions s ON s.id=r.submission_id
      WHERE s.scoring_job_id=$1 ORDER BY e.created_at,e.id`, [jobId]);
    return result.rows;
  }
}

module.exports = new JobDetailRepository();
module.exports.JobDetailRepository = JobDetailRepository;
