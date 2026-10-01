-- Normalize installations where the V1 question bank table already existed
-- before the V3 schema was introduced. Migration 078 uses CREATE TABLE IF NOT
-- EXISTS, so legacy NOT NULL constraints can otherwise remain in place and
-- reject V3 creates, which intentionally store presentation data in the
-- question_bank_contents and question_bank_sub_questions tables.

DROP INDEX IF EXISTS idx_question_bank_questions_skill_status;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'question_bank_questions'
      AND column_name = 'skill'
  ) THEN
    ALTER TABLE question_bank_questions ALTER COLUMN skill DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'question_bank_questions'
      AND column_name = 'title'
  ) THEN
    ALTER TABLE question_bank_questions ALTER COLUMN title DROP NOT NULL;
  END IF;
END $$;
