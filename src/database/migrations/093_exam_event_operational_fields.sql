ALTER TABLE exam_events ADD COLUMN IF NOT EXISTS exam_access_status VARCHAR(24) NOT NULL DEFAULT 'READY';
ALTER TABLE exam_events ADD COLUMN IF NOT EXISTS internal_note VARCHAR(1000);

DO $$ BEGIN
  ALTER TABLE exam_events ADD CONSTRAINT chk_exam_event_access_status
    CHECK (exam_access_status IN ('READY','LIVE','PAUSED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
