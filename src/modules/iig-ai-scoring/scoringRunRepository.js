const db = require('../../config/db');
const { buildScoringPlan } = require('./scoringPlan');
const speakingCompletionRepository = require('./speakingCompletionRepository');
const writingCompletionRepository = require('./writingCompletionRepository');

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    submissionId: row.submission_id,
    planId: row.scoring_plan_id || null,
    runNumber: Number(row.run_number),
    runType: row.run_type,
    requestKey: row.request_key,
    status: row.status,
    scoringPolicyVersion: row.scoring_policy_version,
    inputSchemaVersion: Number(row.input_schema_version),
    inputFingerprint: row.input_fingerprint,
    progress: {
      totalQuestions: Number(row.total_questions || 0),
      completedQuestions: Number(row.completed_questions || 0),
      failedQuestions: Number(row.failed_questions || 0),
      reviewQuestions: Number(row.review_questions || 0),
    },
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

class AiScoringRunError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AiScoringRunError';
    this.code = code;
  }
}

class ScoringRunRepository {
  constructor(database = db) {
    this.db = database;
  }

  async createOrReuseInitialRun({
    submissionId,
    policyVersion,
    inputSchemaVersion = 1,
    aggregationVersion = 'score-group-average-half-up-v1',
    scorerTypes = null,
    questionNumbers = null,
    planId = null,
  }) {
    return this.db.transaction(async executor => {
      const submissionResult = await executor.query(
        `SELECT submission.id, submission.status, submission.scoring_job_id,
                job.status AS ingestion_job_status
         FROM iig_submissions submission
         JOIN iig_scoring_jobs job ON job.id = submission.scoring_job_id
         WHERE submission.id = $1
         FOR UPDATE OF submission, job`,
        [submissionId]
      );
      const submission = submissionResult.rows[0];
      if (!submission) {
        throw new AiScoringRunError('IIG_AI_SUBMISSION_NOT_FOUND', 'The IIG submission does not exist.');
      }
      if (submission.ingestion_job_status !== 'READY_FOR_AI') {
        throw new AiScoringRunError(
          'IIG_AI_SUBMISSION_NOT_READY',
          `The ingestion job is ${submission.ingestion_job_status}, not READY_FOR_AI.`
        );
      }

      const attemptsResult = await executor.query(
        `SELECT attempt.id AS question_attempt_id, attempt.submission_id,
                attempt.ai_input, attempt.processing_version,
                attempt.scoring_disposition, attempt.zero_reason,
                attempt.zero_origin, attempt.resolution_metadata,
                question.content_hash AS question_content_hash,
                question.sort_order,
                COALESCE(
                  array_agg(mapping.score_group_id ORDER BY score_group.sort_order)
                    FILTER (WHERE mapping.score_group_id IS NOT NULL),
                  ARRAY[]::uuid[]
                ) AS score_group_ids
         FROM iig_question_attempts attempt
         JOIN iig_exam_questions question ON question.id = attempt.exam_question_id
         LEFT JOIN iig_exam_question_score_groups mapping
           ON mapping.question_id = question.id
          AND mapping.exam_version_id = attempt.exam_version_id
         LEFT JOIN iig_exam_score_groups score_group ON score_group.id = mapping.score_group_id
         WHERE attempt.submission_id = $1
           AND attempt.readiness_status = 'READY_FOR_AI'
           AND ($2::text[] IS NULL OR question.scorer_type = ANY($2::text[]))
           AND ($3::integer[] IS NULL OR question.question_number = ANY($3::integer[]))
         GROUP BY attempt.id, question.content_hash, question.sort_order
         ORDER BY question.sort_order, attempt.id`,
        [submissionId, scorerTypes, questionNumbers]
      );
      let plan;
      try {
        plan = buildScoringPlan(attemptsResult.rows, { policyVersion, inputSchemaVersion });
      } catch (error) {
        if (error instanceof AiScoringRunError) throw error;
        throw new AiScoringRunError(error.code || 'IIG_AI_PLAN_INVALID', error.message);
      }

      const existingResult = await executor.query(
        `SELECT * FROM iig_ai_scoring_runs WHERE request_key = $1 FOR UPDATE`,
        [plan.requestKey]
      );
      if (existingResult.rows[0]) {
        const existing = existingResult.rows[0];
        if (planId && existing.scoring_plan_id && existing.scoring_plan_id !== planId) {
          throw new AiScoringRunError(
            'IIG_AI_SCORING_PLAN_CONFLICT',
            'The existing scoring run belongs to a different scoring plan.'
          );
        }
        if (planId && !existing.scoring_plan_id) {
          const linked = await executor.query(
            `UPDATE iig_ai_scoring_runs SET scoring_plan_id = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND scoring_plan_id IS NULL RETURNING *`,
            [existing.id, planId]
          );
          return { run: mapRun(linked.rows[0]), replayed: true };
        }
        return { run: mapRun(existing), replayed: true };
      }

      const numberResult = await executor.query(
        `SELECT COALESCE(MAX(run_number), 0) + 1 AS next_run_number
         FROM iig_ai_scoring_runs WHERE submission_id = $1`,
        [submissionId]
      );
      const runNumber = Number(numberResult.rows[0]?.next_run_number || 1);
      const runResult = await executor.query(
        `INSERT INTO iig_ai_scoring_runs
           (submission_id, scoring_plan_id, run_number, run_type, request_key, status,
            scoring_policy_version, input_schema_version, input_fingerprint,
            total_questions)
         VALUES ($1, $2, $3, 'PRODUCTION', $4, 'QUEUED', $5, $6, $7, $8)
         RETURNING *`,
        [
          submissionId, planId, runNumber, plan.requestKey, plan.policyVersion,
          plan.inputSchemaVersion, plan.inputFingerprint, plan.questions.length,
        ]
      );
      const run = runResult.rows[0];

      for (const question of plan.questions) {
        const attempt = attemptsResult.rows.find(
          row => row.question_attempt_id === question.questionAttemptId
        );
        await executor.query(
          `INSERT INTO iig_ai_question_runs
             (scoring_run_id, question_attempt_id, status,
              input_schema_version, input_fingerprint, scoring_disposition,
              zero_reason, zero_origin, resolution_metadata)
           VALUES ($1, $2, 'QUEUED', $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            run.id, question.questionAttemptId, plan.inputSchemaVersion,
            question.inputFingerprint, attempt?.scoring_disposition || 'NORMAL',
            attempt?.zero_reason || null, attempt?.zero_origin || null,
            JSON.stringify(attempt?.resolution_metadata || {}),
          ]
        );
      }
      for (const scoreGroupId of plan.scoreGroupIds) {
        await executor.query(
          `INSERT INTO iig_ai_group_results
             (scoring_run_id, score_group_id, status, aggregation_version)
           VALUES ($1, $2, 'WAITING', $3)`,
          [run.id, scoreGroupId, aggregationVersion]
        );
      }

      const outboxKey = `iig-ai-scoring-run:${run.id}:start:v1`;
      await executor.query(
        `INSERT INTO iig_ai_scoring_outbox
           (scoring_run_id, event_type, deduplication_key, payload)
         VALUES ($1, 'AI_SCORING_REQUESTED', $2, $3::jsonb)`,
        [run.id, outboxKey, JSON.stringify({
          scoringRunId: run.id,
          submissionId,
          inputFingerprint: plan.inputFingerprint,
        })]
      );
      await executor.query(
        `INSERT INTO iig_ai_scoring_events
           (scoring_run_id, event_type, from_status, to_status, details)
         VALUES ($1, 'AI_SCORING_RUN_CREATED', NULL, 'QUEUED', $2::jsonb)`,
        [run.id, JSON.stringify({
          totalQuestions: plan.questions.length,
          totalGroups: plan.scoreGroupIds.length,
          policyVersion: plan.policyVersion,
          inputFingerprint: plan.inputFingerprint,
        })]
      );
      const includesSpeaking = plan.questions.some(question => {
        const aiInput = attemptsResult.rows.find(
          row => row.question_attempt_id === question.questionAttemptId
        )?.ai_input;
        return String(aiInput?.exam?.section || '').trim().toUpperCase() === 'SPEAKING';
      });
      if (includesSpeaking) {
        await speakingCompletionRepository.markStarted(executor, submissionId);
      }
      const includesWriting = plan.questions.some(question => {
        const aiInput = attemptsResult.rows.find(
          row => row.question_attempt_id === question.questionAttemptId
        )?.ai_input;
        return String(aiInput?.exam?.section || '').trim().toUpperCase() === 'WRITING';
      });
      if (includesWriting) {
        await writingCompletionRepository.markStarted(executor, submissionId);
      }
      return { run: mapRun(run), replayed: false };
    });
  }

  async findById(runId) {
    const result = await this.db.query(
      `SELECT * FROM iig_ai_scoring_runs WHERE id = $1`,
      [runId]
    );
    return mapRun(result.rows[0]);
  }
}

const repository = new ScoringRunRepository();
repository.ScoringRunRepository = ScoringRunRepository;
repository.AiScoringRunError = AiScoringRunError;
repository.mapRun = mapRun;

module.exports = repository;
