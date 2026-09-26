-- Complete the exam-event model required by the administration list.
ALTER TABLE exam_events ADD COLUMN IF NOT EXISTS event_code VARCHAR(40);

UPDATE exam_events
SET event_code = 'EV-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 10))
WHERE event_code IS NULL OR BTRIM(event_code) = '';

ALTER TABLE exam_events ALTER COLUMN event_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_events_event_code ON exam_events(UPPER(event_code));
CREATE INDEX IF NOT EXISTS idx_exam_events_school_name ON exam_events(school_name);
CREATE INDEX IF NOT EXISTS idx_exam_events_updated_at ON exam_events(updated_at DESC);
