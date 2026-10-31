-- Allow a guarded retry of one failed scoring pipeline work item.

ALTER TABLE ai_scoring_job_operator_commands
  DROP CONSTRAINT IF EXISTS chk_ai_scoring_job_operator_action;

ALTER TABLE ai_scoring_job_operator_commands
  ADD CONSTRAINT chk_ai_scoring_job_operator_action CHECK (
    action IN ('RETRY', 'CANCEL', 'RESCORE', 'RECONCILE', 'STEP_RETRY')
  );
