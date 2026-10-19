-- Question group management: lifecycle status and automatic public codes.
ALTER TABLE question_groups
  ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'DRAFT';

UPDATE question_groups SET status = 'DRAFT' WHERE status IS NULL;

ALTER TABLE question_groups DROP CONSTRAINT IF EXISTS chk_question_groups_status;
ALTER TABLE question_groups
  ADD CONSTRAINT chk_question_groups_status CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE'));

CREATE SEQUENCE IF NOT EXISTS question_group_code_seq START 1;
WITH latest AS (
  SELECT COALESCE(MAX(((regexp_match(code, '^GRP-([0-9]+)$'))[1])::int), 0) AS value
  FROM question_groups
)
SELECT setval('question_group_code_seq', GREATEST(value, 1), value > 0)
FROM latest;

CREATE INDEX IF NOT EXISTS idx_question_groups_status_updated_at
  ON question_groups(status, updated_at DESC);
