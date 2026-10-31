-- IIG scoring ingestion foundation.
--
-- This schema is deliberately separate from:
--   * exams/exam_attempts, which power exams authored and delivered here; and
--   * mocktest_submissions/submission_answers, the legacy synchronous IIG sync.
--
-- PostgreSQL is the durable source of truth. Redis/BullMQ may dispatch work,
-- but every accepted request and every queue publication starts in this schema.

CREATE TABLE IF NOT EXISTS iig_scoring_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner VARCHAR(40) NOT NULL DEFAULT 'IIG_ELEARNING',
  keycode VARCHAR(20) NOT NULL,
  source_scoring_id UUID NOT NULL,
  source_key VARCHAR(220) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACCEPTED',
  total_questions INTEGER NOT NULL DEFAULT 0,
  ready_questions INTEGER NOT NULL DEFAULT 0,
  invalid_questions INTEGER NOT NULL DEFAULT 0,
  pending_questions INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  error_code VARCHAR(80),
  error_message TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_scoring_jobs_source_key UNIQUE (source_key),
  CONSTRAINT uq_iig_scoring_jobs_partner_scoring UNIQUE (partner, source_scoring_id),
  CONSTRAINT chk_iig_scoring_jobs_keycode CHECK (keycode ~ '^[A-Z0-9]{6,20}$'),
  CONSTRAINT chk_iig_scoring_jobs_request_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_iig_scoring_jobs_status CHECK (status IN (
    'ACCEPTED', 'FETCHING_SOURCE', 'SYNCING_EXAM', 'PREPARING_MEDIA',
    'VALIDATING', 'READY_FOR_AI', 'INVALID_REQUEST', 'SOURCE_FETCH_FAILED',
    'MEDIA_FAILED', 'INVALID_INPUT', 'FAILED'
  )),
  CONSTRAINT chk_iig_scoring_jobs_progress CHECK (
    total_questions >= 0 AND ready_questions >= 0 AND invalid_questions >= 0
    AND pending_questions >= 0 AND retry_count >= 0
    AND ready_questions + invalid_questions + pending_questions <= total_questions
  )
);

CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_status_retry
  ON iig_scoring_jobs(status, next_retry_at, accepted_at);

CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_keycode
  ON iig_scoring_jobs(keycode, accepted_at DESC);

CREATE TABLE IF NOT EXISTS iig_scoring_job_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner VARCHAR(40) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  scoring_job_id UUID NOT NULL REFERENCES iig_scoring_jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_job_idempotency_partner_key UNIQUE (partner, idempotency_key),
  CONSTRAINT chk_iig_job_idempotency_key_length CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  CONSTRAINT chk_iig_job_idempotency_hash CHECK (request_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_iig_job_idempotency_job
  ON iig_scoring_job_idempotency_keys(scoring_job_id);

CREATE TABLE IF NOT EXISTS iig_ingestion_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(60) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  deduplication_key VARCHAR(240) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  publish_attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(120),
  published_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_ingestion_outbox_dedup UNIQUE (deduplication_key),
  CONSTRAINT chk_iig_ingestion_outbox_status CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')),
  CONSTRAINT chk_iig_ingestion_outbox_attempts CHECK (publish_attempts >= 0),
  CONSTRAINT chk_iig_ingestion_outbox_payload CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_iig_ingestion_outbox_dispatch
  ON iig_ingestion_outbox(status, available_at, created_at)
  WHERE status IN ('PENDING', 'FAILED');

CREATE TABLE IF NOT EXISTS iig_exam_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner VARCHAR(40) NOT NULL DEFAULT 'IIG_ELEARNING',
  source_mock_test_id VARCHAR(120) NOT NULL,
  title VARCHAR(500),
  source_status VARCHAR(80),
  current_version_id UUID,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_exam_catalog_source UNIQUE (partner, source_mock_test_id)
);

CREATE TABLE IF NOT EXISTS iig_exam_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES iig_exam_catalog(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  structure_hash CHAR(64) NOT NULL,
  canonical_schema_version INTEGER NOT NULL DEFAULT 1,
  source_status VARCHAR(80),
  source_updated_at TIMESTAMPTZ,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_job_id UUID REFERENCES iig_scoring_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_exam_versions_number UNIQUE (exam_id, version_number),
  CONSTRAINT uq_iig_exam_versions_hash UNIQUE (exam_id, structure_hash),
  CONSTRAINT uq_iig_exam_versions_id_exam UNIQUE (id, exam_id),
  CONSTRAINT chk_iig_exam_versions_number CHECK (version_number > 0),
  CONSTRAINT chk_iig_exam_versions_hash CHECK (structure_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_iig_exam_versions_schema CHECK (canonical_schema_version > 0),
  CONSTRAINT chk_iig_exam_versions_metadata CHECK (jsonb_typeof(source_metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_iig_exam_versions_exam_created
  ON iig_exam_versions(exam_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_iig_exam_catalog_current_version'
  ) THEN
    ALTER TABLE iig_exam_catalog
      ADD CONSTRAINT fk_iig_exam_catalog_current_version
      FOREIGN KEY (current_version_id, id)
      REFERENCES iig_exam_versions(id, exam_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS iig_exam_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_version_id UUID NOT NULL REFERENCES iig_exam_versions(id) ON DELETE CASCADE,
  source_section_id VARCHAR(120),
  section_key VARCHAR(160) NOT NULL,
  name VARCHAR(240) NOT NULL,
  section_type VARCHAR(60),
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_exam_sections_key UNIQUE (exam_version_id, section_key),
  CONSTRAINT uq_iig_exam_sections_order UNIQUE (exam_version_id, sort_order),
  CONSTRAINT uq_iig_exam_sections_id_version UNIQUE (id, exam_version_id),
  CONSTRAINT chk_iig_exam_sections_order CHECK (sort_order >= 0),
  CONSTRAINT chk_iig_exam_sections_metadata CHECK (jsonb_typeof(source_metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS iig_exam_score_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_version_id UUID NOT NULL REFERENCES iig_exam_versions(id) ON DELETE CASCADE,
  source_group_id VARCHAR(120),
  group_key VARCHAR(160) NOT NULL,
  name VARCHAR(240) NOT NULL,
  min_score NUMERIC(10, 2),
  max_score NUMERIC(10, 2),
  scoring_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_exam_score_groups_key UNIQUE (exam_version_id, group_key),
  CONSTRAINT uq_iig_exam_score_groups_id_version UNIQUE (id, exam_version_id),
  CONSTRAINT chk_iig_exam_score_groups_range CHECK (
    (min_score IS NULL OR max_score IS NULL) OR min_score <= max_score
  ),
  CONSTRAINT chk_iig_exam_score_groups_order CHECK (sort_order >= 0),
  CONSTRAINT chk_iig_exam_score_groups_config CHECK (jsonb_typeof(scoring_config) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_iig_exam_score_groups_version_order
  ON iig_exam_score_groups(exam_version_id, sort_order);

CREATE TABLE IF NOT EXISTS iig_exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_version_id UUID NOT NULL REFERENCES iig_exam_versions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL,
  source_question_id VARCHAR(120),
  question_key VARCHAR(200) NOT NULL,
  question_number INTEGER,
  scorer_type VARCHAR(60) NOT NULL,
  questionnaire_type INTEGER,
  title VARCHAR(500),
  question_text TEXT,
  prompt_text TEXT,
  context_text TEXT,
  prompt_html TEXT,
  asset_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash CHAR(64) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_exam_questions_key UNIQUE (exam_version_id, question_key),
  CONSTRAINT uq_iig_exam_questions_section_order UNIQUE (section_id, sort_order),
  CONSTRAINT uq_iig_exam_questions_id_version UNIQUE (id, exam_version_id),
  CONSTRAINT fk_iig_exam_questions_section_version FOREIGN KEY (section_id, exam_version_id)
    REFERENCES iig_exam_sections(id, exam_version_id) ON DELETE CASCADE,
  CONSTRAINT chk_iig_exam_questions_number CHECK (question_number IS NULL OR question_number > 0),
  CONSTRAINT chk_iig_exam_questions_order CHECK (sort_order >= 0),
  CONSTRAINT chk_iig_exam_questions_hash CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_iig_exam_questions_assets CHECK (jsonb_typeof(asset_manifest) = 'array'),
  CONSTRAINT chk_iig_exam_questions_payload CHECK (jsonb_typeof(source_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_iig_exam_questions_version_section
  ON iig_exam_questions(exam_version_id, section_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_iig_exam_questions_scorer_type
  ON iig_exam_questions(scorer_type);

CREATE TABLE IF NOT EXISTS iig_exam_question_score_groups (
  exam_version_id UUID NOT NULL REFERENCES iig_exam_versions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL,
  score_group_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (question_id, score_group_id),
  CONSTRAINT fk_iig_question_score_groups_question_version
    FOREIGN KEY (question_id, exam_version_id)
    REFERENCES iig_exam_questions(id, exam_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_iig_question_score_groups_group_version
    FOREIGN KEY (score_group_id, exam_version_id)
    REFERENCES iig_exam_score_groups(id, exam_version_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_iig_question_score_groups_group
  ON iig_exam_question_score_groups(score_group_id, question_id);

CREATE TABLE IF NOT EXISTS iig_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_job_id UUID NOT NULL UNIQUE REFERENCES iig_scoring_jobs(id) ON DELETE CASCADE,
  partner VARCHAR(40) NOT NULL DEFAULT 'IIG_ELEARNING',
  source_scoring_id UUID NOT NULL,
  keycode VARCHAR(20) NOT NULL,
  exam_version_id UUID NOT NULL REFERENCES iig_exam_versions(id) ON DELETE RESTRICT,
  candidate_name VARCHAR(300),
  candidate_email VARCHAR(320),
  candidate_phone VARCHAR(80),
  source_status VARCHAR(80),
  status VARCHAR(40) NOT NULL DEFAULT 'SYNCING',
  submitted_at TIMESTAMPTZ,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_at TIMESTAMPTZ,
  CONSTRAINT uq_iig_submissions_source UNIQUE (partner, source_scoring_id),
  CONSTRAINT uq_iig_submissions_id_version UNIQUE (id, exam_version_id),
  CONSTRAINT chk_iig_submissions_keycode CHECK (keycode ~ '^[A-Z0-9]{6,20}$'),
  CONSTRAINT chk_iig_submissions_status CHECK (status IN (
    'SYNCING', 'PREPARING_MEDIA', 'VALIDATING', 'READY_FOR_AI',
    'COMPLETED_WITH_ISSUES', 'FAILED'
  )),
  CONSTRAINT chk_iig_submissions_metadata CHECK (jsonb_typeof(source_metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_iig_submissions_exam_version
  ON iig_submissions(exam_version_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_iig_submissions_keycode
  ON iig_submissions(keycode, created_at DESC);

CREATE TABLE IF NOT EXISTS iig_question_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL,
  exam_version_id UUID NOT NULL REFERENCES iig_exam_versions(id) ON DELETE RESTRICT,
  exam_question_id UUID NOT NULL,
  source_choose_id VARCHAR(120),
  answer_text TEXT,
  source_answer JSONB NOT NULL DEFAULT '{}'::jsonb,
  readiness_status VARCHAR(40) NOT NULL DEFAULT 'PENDING_SOURCE',
  required_asset_count INTEGER NOT NULL DEFAULT 0,
  ready_asset_count INTEGER NOT NULL DEFAULT 0,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_input JSONB,
  processing_version VARCHAR(80),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_question_attempts_submission_question UNIQUE (submission_id, exam_question_id),
  CONSTRAINT fk_iig_question_attempts_submission_version
    FOREIGN KEY (submission_id, exam_version_id)
    REFERENCES iig_submissions(id, exam_version_id) ON DELETE CASCADE,
  CONSTRAINT fk_iig_question_attempts_question_version
    FOREIGN KEY (exam_question_id, exam_version_id)
    REFERENCES iig_exam_questions(id, exam_version_id) ON DELETE RESTRICT,
  CONSTRAINT chk_iig_question_attempts_status CHECK (readiness_status IN (
    'PENDING_SOURCE', 'PENDING_MEDIA', 'VALIDATING', 'READY_FOR_AI',
    'PENDING_RETRY', 'INVALID_AUDIO', 'INVALID_INPUT', 'REVIEW'
  )),
  CONSTRAINT chk_iig_question_attempts_assets CHECK (
    required_asset_count >= 0 AND ready_asset_count >= 0
    AND ready_asset_count <= required_asset_count
  ),
  CONSTRAINT chk_iig_question_attempts_retry CHECK (retry_count >= 0),
  CONSTRAINT chk_iig_question_attempts_answer CHECK (jsonb_typeof(source_answer) = 'object'),
  CONSTRAINT chk_iig_question_attempts_errors CHECK (jsonb_typeof(validation_errors) = 'array'),
  CONSTRAINT chk_iig_question_attempts_ai_input CHECK (ai_input IS NULL OR jsonb_typeof(ai_input) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_iig_question_attempts_choose_id
  ON iig_question_attempts(submission_id, source_choose_id)
  WHERE source_choose_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_iig_question_attempts_readiness
  ON iig_question_attempts(readiness_status, next_retry_at, created_at);

CREATE TABLE IF NOT EXISTS iig_media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_question_id UUID REFERENCES iig_exam_questions(id) ON DELETE CASCADE,
  question_attempt_id UUID REFERENCES iig_question_attempts(id) ON DELETE CASCADE,
  asset_role VARCHAR(40) NOT NULL,
  asset_index INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  source_file_id VARCHAR(200),
  source_locator JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_format VARCHAR(40),
  source_mime_type VARCHAR(160),
  canonical_storage_provider VARCHAR(40),
  canonical_storage_bucket VARCHAR(200),
  canonical_storage_key TEXT,
  canonical_mime_type VARCHAR(160),
  checksum_sha256 CHAR(64),
  file_size_bytes BIGINT,
  duration_seconds NUMERIC(12, 3),
  status VARCHAR(40) NOT NULL DEFAULT 'DISCOVERED',
  quality_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_version VARCHAR(80),
  error_code VARCHAR(80),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_iig_media_assets_owner CHECK (
    (CASE WHEN exam_question_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN question_attempt_id IS NULL THEN 0 ELSE 1 END) = 1
  ),
  CONSTRAINT chk_iig_media_assets_role CHECK (asset_role IN (
    'QUESTION_IMAGE', 'QUESTION_AUDIO', 'CONTEXT_IMAGE', 'CONTEXT_AUDIO',
    'STUDENT_AUDIO', 'OTHER'
  )),
  CONSTRAINT chk_iig_media_assets_index CHECK (asset_index >= 0),
  CONSTRAINT chk_iig_media_assets_status CHECK (status IN (
    'DISCOVERED', 'RESOLVING', 'DOWNLOADING', 'CONVERTING', 'UPLOADING',
    'QUALITY_CHECK', 'READY', 'PENDING_RETRY', 'INVALID_AUDIO', 'FAILED'
  )),
  CONSTRAINT chk_iig_media_assets_checksum CHECK (
    checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT chk_iig_media_assets_size CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  CONSTRAINT chk_iig_media_assets_duration CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT chk_iig_media_assets_locator CHECK (jsonb_typeof(source_locator) = 'object'),
  CONSTRAINT chk_iig_media_assets_metrics CHECK (jsonb_typeof(quality_metrics) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_iig_media_assets_exam_role
  ON iig_media_assets(exam_question_id, asset_role, asset_index)
  WHERE exam_question_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_iig_media_assets_attempt_role
  ON iig_media_assets(question_attempt_id, asset_role, asset_index)
  WHERE question_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_iig_media_assets_storage_key
  ON iig_media_assets(canonical_storage_provider, canonical_storage_bucket, canonical_storage_key)
  WHERE canonical_storage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_iig_media_assets_processing
  ON iig_media_assets(status, updated_at)
  WHERE status NOT IN ('READY', 'INVALID_AUDIO', 'FAILED');

CREATE TABLE IF NOT EXISTS iig_source_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_job_id UUID NOT NULL REFERENCES iig_scoring_jobs(id) ON DELETE CASCADE,
  snapshot_type VARCHAR(60) NOT NULL,
  source_endpoint VARCHAR(500) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_iig_source_snapshots_hash CHECK (payload_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_iig_source_snapshots_job
  ON iig_source_snapshots(scoring_job_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_iig_source_snapshots_expiry
  ON iig_source_snapshots(expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_iig_source_snapshots_payload
  ON iig_source_snapshots(scoring_job_id, snapshot_type, payload_hash);

CREATE TABLE IF NOT EXISTS iig_processing_events (
  id BIGSERIAL PRIMARY KEY,
  scoring_job_id UUID NOT NULL REFERENCES iig_scoring_jobs(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES iig_submissions(id) ON DELETE SET NULL,
  question_attempt_id UUID REFERENCES iig_question_attempts(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  from_status VARCHAR(40),
  to_status VARCHAR(40),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_iig_processing_events_details CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_iig_processing_events_job_created
  ON iig_processing_events(scoring_job_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_iig_processing_events_attempt
  ON iig_processing_events(question_attempt_id, created_at)
  WHERE question_attempt_id IS NOT NULL;
