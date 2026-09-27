-- Admin candidate management: stable candidate number and list/filter indexes.
ALTER TABLE exam_candidates ADD COLUMN IF NOT EXISTS candidate_number VARCHAR(40);

UPDATE exam_candidates
SET candidate_number = 'TS-' || EXTRACT(YEAR FROM created_at)::int || '-' || UPPER(RIGHT(REPLACE(id::text, '-', ''), 8))
WHERE candidate_number IS NULL OR BTRIM(candidate_number) = '';

ALTER TABLE exam_candidates ALTER COLUMN candidate_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_candidates_event_number
  ON exam_candidates(exam_event_id, candidate_number);
CREATE INDEX IF NOT EXISTS idx_exam_candidates_event_toeic
  ON exam_candidates(exam_event_id, toeic_experience);
CREATE INDEX IF NOT EXISTS idx_exam_candidates_school_name
  ON exam_candidates(school_name);
CREATE INDEX IF NOT EXISTS idx_exam_candidates_created_at
  ON exam_candidates(created_at DESC);

-- Existing event managers inherit candidate list and export capabilities.
UPDATE roles SET permissions = permissions || '["exam_candidates.view"]'::jsonb
WHERE permissions ? 'exam_events.view' AND NOT (permissions ? 'exam_candidates.view');
UPDATE roles SET permissions = permissions || '["exam_candidates.export"]'::jsonb
WHERE permissions ? 'exam_events.view' AND NOT (permissions ? 'exam_candidates.export');
