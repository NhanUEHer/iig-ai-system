-- Add model-lineage stages for the provider-backed evidence workers.
-- Existing scoring tables and legacy grading flows remain unchanged.

ALTER TABLE iig_ai_model_executions
  DROP CONSTRAINT IF EXISTS chk_iig_ai_model_executions_stage;

ALTER TABLE iig_ai_model_executions
  ADD CONSTRAINT chk_iig_ai_model_executions_stage CHECK (
    stage IN (
      'ANSWER_STT',
      'SPEECH_EVIDENCE',
      'TASK_EVIDENCE',
      'QUESTION_SCORING',
      'GROUP_CALIBRATION'
    )
  );
