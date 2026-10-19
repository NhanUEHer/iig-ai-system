CREATE TABLE IF NOT EXISTS exam_event_school_assignments (
  exam_event_id UUID NOT NULL REFERENCES exam_events(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES exam_event_schools(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exam_event_id, school_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_event_school_assignments_school
  ON exam_event_school_assignments(school_id, exam_event_id);

INSERT INTO exam_event_school_assignments(exam_event_id, school_id)
SELECT ee.id, school.id
FROM exam_events ee
JOIN exam_event_schools school
  ON LOWER(BTRIM(school.name)) = LOWER(BTRIM(ee.school_name))
WHERE ee.school_name IS NOT NULL AND BTRIM(ee.school_name) <> ''
ON CONFLICT DO NOTHING;
