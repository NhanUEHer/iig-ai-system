CREATE TABLE IF NOT EXISTS exam_event_schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(240) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_exam_event_schools_status CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_event_schools_name
  ON exam_event_schools(LOWER(BTRIM(name)));
CREATE INDEX IF NOT EXISTS idx_exam_event_schools_status_name
  ON exam_event_schools(status, name);

INSERT INTO exam_event_schools(name)
SELECT DISTINCT BTRIM(school_name)
FROM exam_events
WHERE school_name IS NOT NULL AND BTRIM(school_name) <> ''
ON CONFLICT (LOWER(BTRIM(name))) DO NOTHING;

ALTER TABLE exam_events DROP CONSTRAINT IF EXISTS chk_exam_event_access_status;
ALTER TABLE exam_events DROP COLUMN IF EXISTS exam_access_status;
