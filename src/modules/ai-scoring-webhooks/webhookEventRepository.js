const { randomUUID } = require('node:crypto');
const { buildPayload } = require('./webhookPayloadProjector');

class WebhookEventRepository {
  async enqueueTerminalForSubmission(executor, { submissionId, status }) {
    if (!['COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED'].includes(status)) return [];
    const eventType = status === 'FAILED' ? 'scoring.failed' : 'scoring.completed';
    if (eventType === 'scoring.failed') return this.enqueueFailed(executor, submissionId, status);

    const result = await this.loadCompletedResult(executor, submissionId);
    if (!result) return [];
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    const payload = buildPayload({ eventId, occurredAt, ...result });
    const inserted = await executor.query(
      `INSERT INTO integration_webhook_deliveries
         (endpoint_id,tenant_id,job_id,event_id,event_type,payload)
       SELECT endpoint.id,$1,$2,$3,'scoring.completed',$4::jsonb
       FROM integration_webhook_endpoints endpoint
       WHERE endpoint.tenant_id=$1 AND endpoint.status='ACTIVE'
         AND endpoint.event_types ? 'scoring.completed'
       ON CONFLICT DO NOTHING RETURNING id`,
      [result.tenantId, result.job.id, eventId, JSON.stringify(payload)]
    );
    return (inserted.rows || []).map(row => row.id);
  }

  async loadCompletedResult(executor, submissionId) {
    const base = await executor.query(
      `SELECT job.id,job.source_scoring_id,job.keycode,credential.tenant_id,tenant.code AS tenant_code
       FROM iig_submissions submission
       JOIN iig_scoring_jobs job ON job.id=submission.scoring_job_id
       JOIN integration_api_credentials credential ON credential.id=job.credential_id
       JOIN integration_tenants tenant ON tenant.id=credential.tenant_id
       WHERE submission.id=$1`,
      [submissionId]
    );
    const source = base.rows[0];
    if (!source) return null;
    const [groups, questions] = await Promise.all([
      executor.query(
        `WITH latest_runs AS (
           SELECT DISTINCT ON (scoring_policy_version) id
           FROM iig_ai_scoring_runs WHERE submission_id=$1
           ORDER BY scoring_policy_version,run_number DESC
         )
         SELECT score_group.source_group_id,group_result.final_score,
                ARRAY_AGG(question.source_question_id ORDER BY question.sort_order)
                  FILTER (WHERE question.source_question_id IS NOT NULL) AS source_question_ids
         FROM iig_ai_group_results group_result
         JOIN latest_runs latest ON latest.id=group_result.scoring_run_id
         JOIN iig_exam_score_groups score_group ON score_group.id=group_result.score_group_id
         LEFT JOIN iig_exam_question_score_groups mapping ON mapping.score_group_id=score_group.id
         LEFT JOIN iig_exam_questions question ON question.id=mapping.question_id
         WHERE score_group.source_group_id IS NOT NULL
         GROUP BY score_group.source_group_id,score_group.sort_order,group_result.final_score
         ORDER BY score_group.sort_order`,
        [submissionId]
      ),
      executor.query(
        `WITH latest_question_runs AS (
           SELECT DISTINCT ON (attempt.exam_question_id)
                  question_run.id,question_run.question_attempt_id,question_run.criteria_scores
           FROM iig_ai_question_runs question_run
           JOIN iig_ai_scoring_runs run ON run.id=question_run.scoring_run_id
           JOIN iig_question_attempts attempt ON attempt.id=question_run.question_attempt_id
           WHERE run.submission_id=$1
           ORDER BY attempt.exam_question_id,run.run_number DESC,question_run.updated_at DESC
         )
         SELECT question.source_question_id,question.sort_order,
                COALESCE(transcription.transcript,attempt.answer_text) AS source_text,
                transcription.transcript,
                COALESCE(execution.parsed_output,latest.criteria_scores) AS parsed_output
         FROM latest_question_runs latest
         JOIN iig_question_attempts attempt ON attempt.id=latest.question_attempt_id
         JOIN iig_exam_questions question ON question.id=attempt.exam_question_id
         LEFT JOIN LATERAL (
           SELECT transcript FROM iig_ai_answer_transcriptions
           WHERE question_attempt_id=attempt.id AND status='COMPLETED'
           ORDER BY completed_at DESC NULLS LAST,created_at DESC LIMIT 1
         ) transcription ON TRUE
         LEFT JOIN LATERAL (
           SELECT parsed_output FROM iig_ai_model_executions
           WHERE question_run_id=latest.id AND status='COMPLETED' AND parsed_output IS NOT NULL
           ORDER BY CASE stage WHEN 'QUESTION_COMMENT' THEN 1 WHEN 'QUESTION_ERRORS' THEN 2 ELSE 3 END,
                    completed_at DESC NULLS LAST,created_at DESC LIMIT 1
         ) execution ON TRUE
         WHERE question.source_question_id IS NOT NULL
         ORDER BY question.sort_order`,
        [submissionId]
      ),
    ]);
    return {
      tenantId: source.tenant_id,
      tenantCode: source.tenant_code,
      job: { id: source.id, scoringId: source.source_scoring_id, keycode: source.keycode },
      groups: groups.rows.map(row => ({
        sourceGroupId: row.source_group_id,
        sourceQuestionIds: row.source_question_ids || [],
        score: row.final_score,
      })),
      questions: questions.rows.map(row => ({
        sourceQuestionId: row.source_question_id,
        sourceText: row.source_text,
        transcript: row.transcript,
        output: row.parsed_output,
      })),
    };
  }

  async enqueueFailed(executor, submissionId, status) {
    const result = await executor.query(
      `WITH source AS (
         SELECT submission.id AS submission_id,submission.scoring_job_id AS job_id,
                job.keycode,credential.tenant_id
         FROM iig_submissions submission
         JOIN iig_scoring_jobs job ON job.id=submission.scoring_job_id
         JOIN integration_api_credentials credential ON credential.id=job.credential_id
         WHERE submission.id=$1
       ), event AS (SELECT gen_random_uuid() AS event_id)
       INSERT INTO integration_webhook_deliveries
         (endpoint_id,tenant_id,job_id,event_id,event_type,payload)
       SELECT endpoint.id,source.tenant_id,source.job_id,event.event_id,$2::varchar,
              jsonb_build_object(
                'id',event.event_id,'type',$2::text,'createdAt',CURRENT_TIMESTAMP,
                'data',jsonb_build_object('jobId',source.job_id,'submissionId',source.submission_id,
                  'keycode',source.keycode,'status',$3::text)
              )
       FROM source CROSS JOIN event
       JOIN integration_webhook_endpoints endpoint ON endpoint.tenant_id=source.tenant_id
         AND endpoint.status='ACTIVE' AND endpoint.event_types ? $2::text
       ON CONFLICT DO NOTHING RETURNING id`,
      [submissionId, eventType, status]
    );
    return (result?.rows || []).map(row => row.id);
  }
}

const repository = new WebhookEventRepository();
repository.WebhookEventRepository = WebhookEventRepository;
module.exports = repository;
