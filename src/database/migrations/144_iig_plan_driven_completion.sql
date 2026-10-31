-- Persist the exact scoring scope before asynchronous run creation starts.
-- Completion is derived from this sealed plan, never from a fixed section count.

CREATE TABLE IF NOT EXISTS iig_ai_scoring_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_job_id UUID NOT NULL REFERENCES iig_scoring_jobs(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES iig_submissions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'BUILDING',
  requested_groups TEXT[] NOT NULL,
  expected_run_count INTEGER NOT NULL,
  expected_question_count INTEGER NOT NULL DEFAULT 0,
  expected_group_count INTEGER NOT NULL DEFAULT 0,
  sealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_ai_scoring_plans_job UNIQUE (scoring_job_id),
  CONSTRAINT uq_iig_ai_scoring_plans_submission UNIQUE (submission_id),
  CONSTRAINT chk_iig_ai_scoring_plans_status CHECK (status IN ('BUILDING', 'SEALED')),
  CONSTRAINT chk_iig_ai_scoring_plans_groups CHECK (
    expected_run_count > 0
    AND cardinality(requested_groups) = expected_run_count
  ),
  CONSTRAINT chk_iig_ai_scoring_plans_scope_counts CHECK (
    expected_question_count >= 0 AND expected_group_count >= 0
  ),
  CONSTRAINT chk_iig_ai_scoring_plans_sealed CHECK (
    (status = 'BUILDING' AND sealed_at IS NULL)
    OR (status = 'SEALED' AND sealed_at IS NOT NULL
        AND expected_question_count > 0 AND expected_group_count > 0)
  )
);

ALTER TABLE iig_ai_scoring_runs
  ADD COLUMN IF NOT EXISTS scoring_plan_id UUID
    REFERENCES iig_ai_scoring_plans(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_iig_ai_scoring_runs_plan
  ON iig_ai_scoring_runs(scoring_plan_id, status);

-- Existing immutable submissions already have all requested runs materialized.
-- Backfill one sealed plan per submission so reconciliation can repair them.
WITH selected_runs AS (
  SELECT run.*
  FROM (
    SELECT run.*,
           ROW_NUMBER() OVER (
             PARTITION BY run.submission_id, run.scoring_policy_version
             ORDER BY run.run_number DESC, run.created_at DESC, run.id DESC
           ) AS policy_rank
    FROM iig_ai_scoring_runs run
    WHERE run.run_type = 'PRODUCTION'
  ) run
  WHERE run.policy_rank = 1
), run_groups AS (
  SELECT submission.id AS submission_id,
         submission.scoring_job_id,
         ARRAY_AGG(DISTINCT CASE run.scoring_policy_version
           WHEN 'rta-q1-q2-dify-policy-v1' THEN 'READ_TEXT_ALOUD'
           WHEN 'describe-picture-q3-q4-dify-policy-v1' THEN 'DESCRIBE_PICTURE'
           WHEN 'respond-q5-q10-dify-policy-v1' THEN 'RESPOND_Q5_Q10'
           WHEN 'express-opinion-q11-dify-policy-v1' THEN 'EXPRESS_OPINION'
           WHEN 'write-sentence-q1-q5-dify-policy-v1' THEN 'WRITE_SENTENCE_Q1_Q5'
           WHEN 'written-request-q6-q7-dify-policy-v1' THEN 'WRITTEN_REQUEST_Q6_Q7'
           WHEN 'opinion-essay-q8-dify-policy-v1' THEN 'OPINION_ESSAY_Q8'
         END) FILTER (WHERE run.scoring_policy_version IN (
           'rta-q1-q2-dify-policy-v1', 'describe-picture-q3-q4-dify-policy-v1',
           'respond-q5-q10-dify-policy-v1', 'express-opinion-q11-dify-policy-v1',
           'write-sentence-q1-q5-dify-policy-v1', 'written-request-q6-q7-dify-policy-v1',
           'opinion-essay-q8-dify-policy-v1'
         )) AS requested_groups
  FROM iig_submissions submission
  JOIN selected_runs run ON run.submission_id = submission.id
  GROUP BY submission.id, submission.scoring_job_id
)
INSERT INTO iig_ai_scoring_plans
  (scoring_job_id, submission_id, status, requested_groups,
   expected_run_count, expected_question_count, expected_group_count, sealed_at)
SELECT scoring_job_id, submission_id, 'SEALED', requested_groups,
       cardinality(requested_groups),
       (SELECT COUNT(*)
        FROM iig_ai_question_runs question_run
        JOIN selected_runs scoped_run ON scoped_run.id = question_run.scoring_run_id
        WHERE scoped_run.submission_id = run_groups.submission_id),
       (SELECT COUNT(*)
        FROM iig_ai_group_results group_result
        JOIN selected_runs scoped_run ON scoped_run.id = group_result.scoring_run_id
        WHERE scoped_run.submission_id = run_groups.submission_id),
       CURRENT_TIMESTAMP
FROM run_groups
WHERE cardinality(requested_groups) > 0
  AND EXISTS (
    SELECT 1 FROM iig_ai_question_runs question_run
    JOIN selected_runs scoped_run ON scoped_run.id = question_run.scoring_run_id
    WHERE scoped_run.submission_id = run_groups.submission_id
  )
  AND EXISTS (
    SELECT 1 FROM iig_ai_group_results group_result
    JOIN selected_runs scoped_run ON scoped_run.id = group_result.scoring_run_id
    WHERE scoped_run.submission_id = run_groups.submission_id
  )
ON CONFLICT (submission_id) DO NOTHING;

WITH selected_runs AS (
  SELECT run.id, run.submission_id
  FROM (
    SELECT run.*,
           ROW_NUMBER() OVER (
             PARTITION BY run.submission_id, run.scoring_policy_version
             ORDER BY run.run_number DESC, run.created_at DESC, run.id DESC
           ) AS policy_rank
    FROM iig_ai_scoring_runs run
    WHERE run.run_type = 'PRODUCTION'
  ) run
  WHERE run.policy_rank = 1
)
UPDATE iig_ai_scoring_runs run
SET scoring_plan_id = plan.id
FROM iig_ai_scoring_plans plan
JOIN selected_runs selected ON selected.submission_id = plan.submission_id
WHERE run.id = selected.id
  AND run.scoring_plan_id IS NULL;
