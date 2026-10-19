-- Migration 076: Exam Sub-questions Support
-- Adds sub_question_id column to exam_part_questions for selecting sub-questions into exam parts.

ALTER TABLE exam_part_questions
  ADD COLUMN IF NOT EXISTS sub_question_id UUID REFERENCES question_bank_sub_questions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_exam_part_questions_sub_question_id
  ON exam_part_questions(sub_question_id);
