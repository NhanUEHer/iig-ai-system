-- Exam introduction is optional for both drafts and published exams.
-- DROP NOT NULL is idempotent and also repairs environments that may have
-- introduced the constraint outside the migration history.
ALTER TABLE exams
  ALTER COLUMN introduction DROP NOT NULL;
