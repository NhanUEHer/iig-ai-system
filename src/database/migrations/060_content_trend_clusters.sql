CREATE TABLE IF NOT EXISTS content_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key VARCHAR(64) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  skill VARCHAR(24) NOT NULL,
  question_group VARCHAR(40) NOT NULL,
  task_type VARCHAR(120),
  topic TEXT,
  trend_type VARCHAR(32) NOT NULL,
  verification_status VARCHAR(32) NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  average_similarity NUMERIC(5,4) NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  first_seen_at DATE,
  last_seen_at DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT content_trend_type CHECK (trend_type IN ('REPEATED_PROMPT','RECURRING_TASK_TOPIC','SINGLE_SIGNAL')),
  CONSTRAINT content_trend_verification CHECK (verification_status IN ('UNVERIFIED','CONFIRMED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS content_trends_owner_key ON content_trends(created_by,cluster_key);

CREATE TABLE IF NOT EXISTS content_trend_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id UUID NOT NULL REFERENCES content_trends(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES content_source_analyses(id) ON DELETE CASCADE,
  item_hash VARCHAR(64) NOT NULL,
  recalled_item JSONB NOT NULL,
  evidence TEXT NOT NULL,
  exam_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trend_id,analysis_id,item_hash)
);

CREATE INDEX IF NOT EXISTS content_trends_active_idx ON content_trends(is_active,verification_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS content_trend_members_trend_idx ON content_trend_members(trend_id);
