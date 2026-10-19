-- Public-facing exam information shown before a candidate starts an exam.
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS introduction TEXT;
