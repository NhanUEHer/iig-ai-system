-- IIG AI scoring foundation.
--
-- This schema starts after the ingestion pipeline reaches READY_FOR_AI. It is
-- intentionally isolated from the legacy grading_jobs/ai_evaluation_results
-- flow and never overwrites a previous scoring run.

CREATE TABLE IF NOT EXISTS iig_ai_scoring_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES iig_submissions(id) ON DELETE RESTRICT,
  run_number INTEGER NOT NULL,
  run_type VARCHAR(24) NOT NULL DEFAULT 'PRODUCTION',
  request_key VARCHAR(240) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
  scoring_policy_version VARCHAR(80) NOT NULL,
  input_schema_version INTEGER NOT NULL DEFAULT 1,
  input_fingerprint CHAR(64) NOT NULL,
  total_questions INTEGER NOT NULL DEFAULT 0,
  completed_questions INTEGER NOT NULL DEFAULT 0,
  failed_questions INTEGER NOT NULL DEFAULT 0,
  review_questions INTEGER NOT NULL DEFAULT 0,
  error_code VARCHAR(80),
  error_message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_ai_scoring_runs_number UNIQUE (submission_id, run_number),
  CONSTRAINT uq_iig_ai_scoring_runs_request_key UNIQUE (request_key),
  CONSTRAINT chk_iig_ai_scoring_runs_type CHECK (
    run_type IN ('PRODUCTION', 'RETRY', 'RESCORE', 'SHADOW', 'BACKFILL')
  ),
  CONSTRAINT chk_iig_ai_scoring_runs_status CHECK (status IN (
    'QUEUED', 'TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS',
    'AGGREGATING_GROUPS', 'CALIBRATING', 'COMPLETED',
    'COMPLETED_WITH_ISSUES', 'REVIEW_REQUIRED', 'FAILED', 'CANCELLED'
  )),
  CONSTRAINT chk_iig_ai_scoring_runs_schema CHECK (input_schema_version > 0),
  CONSTRAINT chk_iig_ai_scoring_runs_fingerprint CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_iig_ai_scoring_runs_progress CHECK (
    run_number > 0 AND total_questions >= 0 AND completed_questions >= 0
    AND failed_questions >= 0 AND review_questions >= 0
    AND completed_questions + failed_questions + review_questions <= total_questions
  )
);

CREATE INDEX IF NOT EXISTS idx_iig_ai_scoring_runs_submission_created
  ON iig_ai_scoring_runs(submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_iig_ai_scoring_runs_status_requested
  ON iig_ai_scoring_runs(status, requested_at)
  WHERE status IN (
    'QUEUED', 'TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS',
    'AGGREGATING_GROUPS', 'CALIBRATING'
  );

CREATE TABLE IF NOT EXISTS iig_ai_answer_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_attempt_id UUID NOT NULL REFERENCES iig_question_attempts(id) ON DELETE RESTRICT,
  media_asset_id UUID NOT NULL REFERENCES iig_media_assets(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  transcript TEXT,
  language_code VARCHAR(20),
  provider VARCHAR(40) NOT NULL,
  model_name VARCHAR(120) NOT NULL,
  model_version VARCHAR(120) NOT NULL,
  prompt_version VARCHAR(80) NOT NULL,
  audio_checksum_sha256 CHAR(64) NOT NULL,
  confidence NUMERIC(8, 6),
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code VARCHAR(80),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_ai_answer_transcriptions_input UNIQUE (
    question_attempt_id, media_asset_id, provider, model_name, model_version,
    prompt_version, audio_checksum_sha256
  ),
  CONSTRAINT chk_iig_ai_answer_transcriptions_status CHECK (
    status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVIEW')
  ),
  CONSTRAINT chk_iig_ai_answer_transcriptions_checksum CHECK (
    audio_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT chk_iig_ai_answer_transcriptions_confidence CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  ),
  CONSTRAINT chk_iig_ai_answer_transcriptions_attempts CHECK (attempt_count >= 0),
  CONSTRAINT chk_iig_ai_answer_transcriptions_metadata CHECK (
    jsonb_typeof(provider_metadata) = 'object'
  ),
  CONSTRAINT chk_iig_ai_answer_transcriptions_text CHECK (
    status <> 'COMPLETED' OR NULLIF(BTRIM(transcript), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_iig_ai_answer_transcriptions_attempt
  ON iig_ai_answer_transcriptions(question_attempt_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_iig_ai_answer_transcriptions_status
  ON iig_ai_answer_transcriptions(status, updated_at)
  WHERE status IN ('PENDING', 'PROCESSING', 'FAILED');

CREATE TABLE IF NOT EXISTS iig_ai_feature_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_attempt_id UUID NOT NULL REFERENCES iig_question_attempts(id) ON DELETE RESTRICT,
  transcription_id UUID REFERENCES iig_ai_answer_transcriptions(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'READY',
  feature_version VARCHAR(80) NOT NULL,
  input_fingerprint CHAR(64) NOT NULL,
  features JSONB NOT NULL,
  error_code VARCHAR(80),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_ai_feature_sets_input UNIQUE (
    question_attempt_id, feature_version, input_fingerprint
  ),
  CONSTRAINT chk_iig_ai_feature_sets_status CHECK (
    status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'REVIEW')
  ),
  CONSTRAINT chk_iig_ai_feature_sets_fingerprint CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_iig_ai_feature_sets_payload CHECK (jsonb_typeof(features) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_iig_ai_feature_sets_attempt
  ON iig_ai_feature_sets(question_attempt_id, feature_version, created_at DESC);

CREATE TABLE IF NOT EXISTS iig_ai_question_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_run_id UUID NOT NULL REFERENCES iig_ai_scoring_runs(id) ON DELETE CASCADE,
  question_attempt_id UUID NOT NULL REFERENCES iig_question_attempts(id) ON DELETE RESTRICT,
  status VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
  input_schema_version INTEGER NOT NULL DEFAULT 1,
  input_fingerprint CHAR(64) NOT NULL,
  transcription_id UUID REFERENCES iig_ai_answer_transcriptions(id) ON DELETE RESTRICT,
  feature_set_id UUID REFERENCES iig_ai_feature_sets(id) ON DELETE RESTRICT,
  llm_score NUMERIC(5, 2),
  llm_confidence NUMERIC(8, 6),
  criteria_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_code VARCHAR(80),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_ai_question_runs_attempt UNIQUE (scoring_run_id, question_attempt_id),
  CONSTRAINT chk_iig_ai_question_runs_status CHECK (status IN (
    'QUEUED', 'TRANSCRIBING', 'EXTRACTING_FEATURES', 'LLM_SCORING', 'SCORED',
    'INVALID_INPUT', 'INVALID_AUDIO', 'REVIEW_REQUIRED', 'FAILED', 'SKIPPED'
  )),
  CONSTRAINT chk_iig_ai_question_runs_schema CHECK (input_schema_version > 0),
  CONSTRAINT chk_iig_ai_question_runs_fingerprint CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_iig_ai_question_runs_score CHECK (llm_score IS NULL OR llm_score >= 0),
  CONSTRAINT chk_iig_ai_question_runs_confidence CHECK (
    llm_confidence IS NULL OR (llm_confidence >= 0 AND llm_confidence <= 1)
  ),
  CONSTRAINT chk_iig_ai_question_runs_criteria CHECK (jsonb_typeof(criteria_scores) = 'object'),
  CONSTRAINT chk_iig_ai_question_runs_flags CHECK (jsonb_typeof(flags) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_iig_ai_question_runs_dispatch
  ON iig_ai_question_runs(status, created_at)
  WHERE status IN ('QUEUED', 'TRANSCRIBING', 'EXTRACTING_FEATURES', 'LLM_SCORING');

CREATE INDEX IF NOT EXISTS idx_iig_ai_question_runs_run
  ON iig_ai_question_runs(scoring_run_id, created_at);

CREATE TABLE IF NOT EXISTS iig_ai_group_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_run_id UUID NOT NULL REFERENCES iig_ai_scoring_runs(id) ON DELETE CASCADE,
  score_group_id UUID NOT NULL REFERENCES iig_exam_score_groups(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'WAITING',
  aggregation_version VARCHAR(80) NOT NULL,
  question_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_group_score NUMERIC(5, 2),
  ml_model_version VARCHAR(120),
  ml_suggested_score NUMERIC(5, 2),
  ml_probabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  ml_confidence NUMERIC(8, 6),
  final_score NUMERIC(5, 2),
  decision_code VARCHAR(60),
  decision_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code VARCHAR(80),
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_ai_group_results_group UNIQUE (scoring_run_id, score_group_id),
  CONSTRAINT chk_iig_ai_group_results_status CHECK (status IN (
    'WAITING', 'AGGREGATING', 'CALIBRATING', 'COMPLETED',
    'REVIEW_REQUIRED', 'FAILED', 'SKIPPED'
  )),
  CONSTRAINT chk_iig_ai_group_results_scores CHECK (
    (llm_group_score IS NULL OR llm_group_score >= 0)
    AND (ml_suggested_score IS NULL OR ml_suggested_score >= 0)
    AND (final_score IS NULL OR final_score >= 0)
  ),
  CONSTRAINT chk_iig_ai_group_results_confidence CHECK (
    ml_confidence IS NULL OR (ml_confidence >= 0 AND ml_confidence <= 1)
  ),
  CONSTRAINT chk_iig_ai_group_results_question_scores CHECK (
    jsonb_typeof(question_scores) = 'object'
  ),
  CONSTRAINT chk_iig_ai_group_results_probabilities CHECK (
    jsonb_typeof(ml_probabilities) = 'object'
  ),
  CONSTRAINT chk_iig_ai_group_results_decision CHECK (
    jsonb_typeof(decision_metadata) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_iig_ai_group_results_run
  ON iig_ai_group_results(scoring_run_id, created_at);

CREATE TABLE IF NOT EXISTS iig_ai_model_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_run_id UUID NOT NULL REFERENCES iig_ai_scoring_runs(id) ON DELETE CASCADE,
  question_run_id UUID REFERENCES iig_ai_question_runs(id) ON DELETE CASCADE,
  group_result_id UUID REFERENCES iig_ai_group_results(id) ON DELETE CASCADE,
  stage VARCHAR(40) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  model_name VARCHAR(120) NOT NULL,
  model_version VARCHAR(120),
  prompt_version VARCHAR(80),
  request_hash CHAR(64) NOT NULL,
  response_hash CHAR(64),
  status VARCHAR(24) NOT NULL DEFAULT 'PROCESSING',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  estimated_cost_usd NUMERIC(14, 8),
  provider_request_id VARCHAR(200),
  raw_output JSONB,
  parsed_output JSONB,
  error_code VARCHAR(80),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_iig_ai_model_executions_owner CHECK (
    num_nonnulls(question_run_id, group_result_id) <= 1
  ),
  CONSTRAINT chk_iig_ai_model_executions_stage CHECK (
    stage IN ('ANSWER_STT', 'QUESTION_SCORING', 'GROUP_CALIBRATION')
  ),
  CONSTRAINT chk_iig_ai_model_executions_status CHECK (
    status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')
  ),
  CONSTRAINT chk_iig_ai_model_executions_request_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_iig_ai_model_executions_response_hash CHECK (
    response_hash IS NULL OR response_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT chk_iig_ai_model_executions_usage CHECK (
    input_tokens >= 0 AND output_tokens >= 0 AND cached_tokens >= 0
    AND (latency_ms IS NULL OR latency_ms >= 0)
    AND (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0)
  ),
  CONSTRAINT chk_iig_ai_model_executions_raw CHECK (
    raw_output IS NULL OR jsonb_typeof(raw_output) = 'object'
  ),
  CONSTRAINT chk_iig_ai_model_executions_parsed CHECK (
    parsed_output IS NULL OR jsonb_typeof(parsed_output) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_iig_ai_model_executions_run_stage
  ON iig_ai_model_executions(scoring_run_id, stage, created_at);

CREATE INDEX IF NOT EXISTS idx_iig_ai_model_executions_question
  ON iig_ai_model_executions(question_run_id, created_at)
  WHERE question_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS iig_ai_scoring_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scoring_run_id UUID NOT NULL REFERENCES iig_ai_scoring_runs(id) ON DELETE CASCADE,
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
  CONSTRAINT uq_iig_ai_scoring_outbox_dedup UNIQUE (deduplication_key),
  CONSTRAINT chk_iig_ai_scoring_outbox_status CHECK (
    status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')
  ),
  CONSTRAINT chk_iig_ai_scoring_outbox_attempts CHECK (publish_attempts >= 0),
  CONSTRAINT chk_iig_ai_scoring_outbox_payload CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_iig_ai_scoring_outbox_dispatch
  ON iig_ai_scoring_outbox(status, available_at, created_at)
  WHERE status IN ('PENDING', 'FAILED');

CREATE TABLE IF NOT EXISTS iig_ai_scoring_events (
  id BIGSERIAL PRIMARY KEY,
  scoring_run_id UUID NOT NULL REFERENCES iig_ai_scoring_runs(id) ON DELETE CASCADE,
  question_run_id UUID REFERENCES iig_ai_question_runs(id) ON DELETE SET NULL,
  group_result_id UUID REFERENCES iig_ai_group_results(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  from_status VARCHAR(40),
  to_status VARCHAR(40),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_iig_ai_scoring_events_details CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_iig_ai_scoring_events_run_created
  ON iig_ai_scoring_events(scoring_run_id, created_at, id);
