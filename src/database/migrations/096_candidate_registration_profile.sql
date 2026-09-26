-- Candidate profile captured before the candidate enters the exam introduction.
ALTER TABLE exam_candidates
  ADD COLUMN IF NOT EXISTS birth_year SMALLINT,
  ADD COLUMN IF NOT EXISTS toeic_experience VARCHAR(40),
  ADD COLUMN IF NOT EXISTS privacy_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_policy_version VARCHAR(40),
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_exam_candidates_birth_year'
  ) THEN
    ALTER TABLE exam_candidates
      ADD CONSTRAINT chk_exam_candidates_birth_year
      CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_exam_candidates_toeic_experience'
  ) THEN
    ALTER TABLE exam_candidates
      ADD CONSTRAINT chk_exam_candidates_toeic_experience
      CHECK (
        toeic_experience IS NULL OR toeic_experience IN (
          'NEVER_STUDIED',
          'STUDIED_NOT_TESTED',
          'TOOK_TOEIC',
          'OTHER_CERTIFICATE'
        )
      );
  END IF;
END $$;
