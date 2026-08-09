CREATE TABLE IF NOT EXISTS mapping_sync_schedule (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  run_time TIME NOT NULL DEFAULT '01:00',
  page_size INTEGER NOT NULL DEFAULT 1000 CHECK (page_size BETWEEN 1 AND 5000),
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  last_run_date DATE,
  last_run_at TIMESTAMPTZ,
  last_status VARCHAR(20) NOT NULL DEFAULT 'idle',
  last_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO mapping_sync_schedule (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

UPDATE roles SET permissions = permissions || '["mappings.schedule"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'mappings.schedule';
