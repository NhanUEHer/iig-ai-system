-- Reusable question-audio transcriptions for canonical IIG exam versions.
-- A question transcript belongs to exam content, so it is generated once and
-- reused by every candidate whose submission references the same exam version.

ALTER TABLE iig_scoring_jobs DROP CONSTRAINT IF EXISTS chk_iig_scoring_jobs_status;
ALTER TABLE iig_scoring_jobs ADD CONSTRAINT chk_iig_scoring_jobs_status CHECK (status IN (
  'ACCEPTED', 'FETCHING_SOURCE', 'SYNCING_EXAM', 'PREPARING_MEDIA',
  'VALIDATING', 'TRANSCRIBING', 'READY_FOR_AI', 'INVALID_REQUEST',
  'SOURCE_FETCH_FAILED', 'MEDIA_FAILED', 'INVALID_INPUT', 'FAILED'
));

ALTER TABLE iig_submissions DROP CONSTRAINT IF EXISTS chk_iig_submissions_status;
ALTER TABLE iig_submissions ADD CONSTRAINT chk_iig_submissions_status CHECK (status IN (
  'SYNCING', 'PREPARING_MEDIA', 'VALIDATING', 'TRANSCRIBING', 'READY_FOR_AI',
  'COMPLETED_WITH_ISSUES', 'FAILED'
));

ALTER TABLE iig_question_attempts DROP CONSTRAINT IF EXISTS chk_iig_question_attempts_status;
ALTER TABLE iig_question_attempts ADD CONSTRAINT chk_iig_question_attempts_status CHECK (readiness_status IN (
  'PENDING_SOURCE', 'PENDING_MEDIA', 'VALIDATING', 'PENDING_TRANSCRIPTION',
  'READY_FOR_AI', 'PENDING_RETRY', 'INVALID_AUDIO', 'INVALID_INPUT', 'REVIEW'
));

CREATE TABLE IF NOT EXISTS iig_exam_question_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_question_id UUID NOT NULL REFERENCES iig_exam_questions(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES iig_media_assets(id) ON DELETE RESTRICT,
  target_type VARCHAR(40) NOT NULL DEFAULT 'QUESTION',
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  transcript TEXT,
  agent_id INTEGER REFERENCES ai_agents(id) ON DELETE SET NULL,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code VARCHAR(80),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_exam_question_transcription_target UNIQUE (exam_question_id, target_type),
  CONSTRAINT uq_iig_exam_question_transcription_asset_target UNIQUE (media_asset_id, target_type),
  CONSTRAINT chk_iig_exam_question_transcription_target CHECK (target_type IN ('QUESTION')),
  CONSTRAINT chk_iig_exam_question_transcription_status CHECK (
    status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVIEW')
  ),
  CONSTRAINT chk_iig_exam_question_transcription_attempts CHECK (attempt_count >= 0),
  CONSTRAINT chk_iig_exam_question_transcription_text CHECK (
    status <> 'COMPLETED' OR NULLIF(BTRIM(transcript), '') IS NOT NULL
  ),
  CONSTRAINT chk_iig_exam_question_transcription_metadata CHECK (
    jsonb_typeof(provider_metadata) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_iig_question_transcriptions_status
  ON iig_exam_question_transcriptions(status, updated_at);
