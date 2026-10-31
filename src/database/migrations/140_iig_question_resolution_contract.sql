ALTER TABLE iig_question_attempts
  ADD COLUMN IF NOT EXISTS scoring_disposition VARCHAR(40) NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS zero_reason VARCHAR(80),
  ADD COLUMN IF NOT EXISTS zero_origin VARCHAR(30),
  ADD COLUMN IF NOT EXISTS resolution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE iig_question_attempts
  DROP CONSTRAINT IF EXISTS chk_iig_question_attempts_scoring_disposition;
ALTER TABLE iig_question_attempts
  ADD CONSTRAINT chk_iig_question_attempts_scoring_disposition CHECK (scoring_disposition IN (
    'NORMAL', 'ZERO_CANDIDATE', 'ZERO_RESPONSE_QUALITY', 'ZERO_SOURCE_DATA',
    'INVALID_PROMPT_SOURCE', 'REVIEW_REQUIRED'
  ));

ALTER TABLE iig_question_attempts
  DROP CONSTRAINT IF EXISTS chk_iig_question_attempts_zero_origin;
ALTER TABLE iig_question_attempts
  ADD CONSTRAINT chk_iig_question_attempts_zero_origin CHECK (
    zero_origin IS NULL OR zero_origin IN ('CANDIDATE', 'RESPONSE_QUALITY', 'SOURCE_DATA', 'SYSTEM')
  );

ALTER TABLE iig_question_attempts
  DROP CONSTRAINT IF EXISTS chk_iig_question_attempts_resolution_metadata;
ALTER TABLE iig_question_attempts
  ADD CONSTRAINT chk_iig_question_attempts_resolution_metadata CHECK (
    jsonb_typeof(resolution_metadata) = 'object'
  );

CREATE INDEX IF NOT EXISTS idx_iig_question_attempts_resolution
  ON iig_question_attempts(scoring_disposition, zero_origin, updated_at DESC);

ALTER TABLE iig_media_assets
  ADD COLUMN IF NOT EXISTS failure_origin VARCHAR(30),
  ADD COLUMN IF NOT EXISTS failure_class VARCHAR(40),
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_exhausted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

ALTER TABLE iig_media_assets
  DROP CONSTRAINT IF EXISTS chk_iig_media_assets_failure_origin;
ALTER TABLE iig_media_assets
  ADD CONSTRAINT chk_iig_media_assets_failure_origin CHECK (
    failure_origin IS NULL OR failure_origin IN ('SOURCE_DATA', 'SYSTEM')
  );

ALTER TABLE iig_media_assets
  DROP CONSTRAINT IF EXISTS chk_iig_media_assets_failure_class;
ALTER TABLE iig_media_assets
  ADD CONSTRAINT chk_iig_media_assets_failure_class CHECK (
    failure_class IS NULL OR failure_class IN (
      'TRANSIENT', 'PERMANENT_NOT_FOUND', 'PERMANENT_ACCESS_DENIED',
      'INVALID_CONTENT', 'RETRY_EXHAUSTED', 'SYSTEM_FAILURE'
    )
  );

ALTER TABLE iig_media_assets
  DROP CONSTRAINT IF EXISTS chk_iig_media_assets_attempt_count;
ALTER TABLE iig_media_assets
  ADD CONSTRAINT chk_iig_media_assets_attempt_count CHECK (attempt_count >= 0);

ALTER TABLE iig_ai_question_runs
  ADD COLUMN IF NOT EXISTS scoring_disposition VARCHAR(40) NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS zero_reason VARCHAR(80),
  ADD COLUMN IF NOT EXISTS zero_origin VARCHAR(30),
  ADD COLUMN IF NOT EXISTS resolution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE iig_ai_question_runs
  DROP CONSTRAINT IF EXISTS chk_iig_ai_question_runs_scoring_disposition;
ALTER TABLE iig_ai_question_runs
  ADD CONSTRAINT chk_iig_ai_question_runs_scoring_disposition CHECK (scoring_disposition IN (
    'NORMAL', 'ZERO_CANDIDATE', 'ZERO_RESPONSE_QUALITY', 'ZERO_SOURCE_DATA',
    'INVALID_PROMPT_SOURCE', 'REVIEW_REQUIRED'
  ));

ALTER TABLE iig_ai_question_runs
  DROP CONSTRAINT IF EXISTS chk_iig_ai_question_runs_zero_origin;
ALTER TABLE iig_ai_question_runs
  ADD CONSTRAINT chk_iig_ai_question_runs_zero_origin CHECK (
    zero_origin IS NULL OR zero_origin IN ('CANDIDATE', 'RESPONSE_QUALITY', 'SOURCE_DATA', 'SYSTEM')
  );

ALTER TABLE iig_ai_question_runs
  DROP CONSTRAINT IF EXISTS chk_iig_ai_question_runs_resolution_metadata;
ALTER TABLE iig_ai_question_runs
  ADD CONSTRAINT chk_iig_ai_question_runs_resolution_metadata CHECK (
    jsonb_typeof(resolution_metadata) = 'object'
  );
