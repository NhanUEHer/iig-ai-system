-- Keep the denormalized sub-question type aligned with the parent question
-- types accepted by the current Question Bank API. Migration 121 introduced
-- COMPLETE_WORDS on parent questions, but the legacy constraint created by
-- migration 075 still rejected it when the repository copied the parent type
-- into question_bank_sub_questions.
--
-- Preserve every legacy value for backward compatibility with existing rows
-- and snapshots, while allowing all current parent question types.
ALTER TABLE question_bank_sub_questions
  DROP CONSTRAINT IF EXISTS chk_sub_question_type;

ALTER TABLE question_bank_sub_questions
  ADD CONSTRAINT chk_sub_question_type CHECK (
    question_type IN (
      'MCQ_SINGLE', 'MCQ_MULTIPLE',
      'RECORD_AUDIO', 'RECORD_VIDEO',
      'WRITING_SHORT', 'WRITING_ESSAY',
      'RECORD', 'WRITING', 'COMPLETE_WORDS'
    )
  ) NOT VALID;

ALTER TABLE question_bank_sub_questions
  VALIDATE CONSTRAINT chk_sub_question_type;
