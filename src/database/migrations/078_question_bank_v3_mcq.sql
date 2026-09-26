-- Question Bank V3: Dạng 3 MCQ foundation. Recreates the cleared local domain.
CREATE TABLE IF NOT EXISTS question_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(80) UNIQUE NOT NULL,
  title VARCHAR(240) NOT NULL, description TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS question_bank_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), question_name VARCHAR(240) NOT NULL,
  group_id UUID NOT NULL REFERENCES question_groups(id) ON DELETE RESTRICT,
  question_type VARCHAR(40) NOT NULL DEFAULT 'MCQ_SINGLE', note TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT', created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_qb_v3_type CHECK (question_type = 'MCQ_SINGLE'),
  CONSTRAINT chk_qb_v3_status CHECK (status IN ('DRAFT','ACTIVE','INACTIVE'))
);
CREATE TABLE IF NOT EXISTS question_bank_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL, content_html TEXT, script_html TEXT, translation_html TEXT,
  display_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS question_bank_sub_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE CASCADE,
  content_id UUID REFERENCES question_bank_contents(id) ON DELETE SET NULL, prompt_html TEXT NOT NULL,
  hint TEXT, explanation TEXT, note TEXT, display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS question_bank_sub_question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sub_question_id UUID NOT NULL REFERENCES question_bank_sub_questions(id) ON DELETE CASCADE,
  option_key VARCHAR(4) NOT NULL, option_text TEXT NOT NULL, is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sub_question_id, option_key)
);
CREATE TABLE IF NOT EXISTS question_bank_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS question_bank_sub_question_tags (
  sub_question_id UUID NOT NULL REFERENCES question_bank_sub_questions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES question_bank_tags(id) ON DELETE CASCADE, PRIMARY KEY (sub_question_id, tag_id)
);
CREATE TABLE IF NOT EXISTS question_bank_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE CASCADE,
  content_id UUID REFERENCES question_bank_contents(id) ON DELETE CASCADE, sub_question_id UUID REFERENCES question_bank_sub_questions(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL, original_name VARCHAR(255) NOT NULL, storage_key VARCHAR(500) UNIQUE NOT NULL,
  mime_type VARCHAR(100), file_size BIGINT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_qb_v3_media_type CHECK (media_type IN ('IMAGE','AUDIO','VIDEO')),
  CONSTRAINT chk_qb_v3_media_target CHECK ((content_id IS NOT NULL AND sub_question_id IS NULL) OR (content_id IS NULL AND sub_question_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_qb_v3_questions_list ON question_bank_questions(group_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qb_v3_contents_order ON question_bank_contents(question_id,display_order);
CREATE INDEX IF NOT EXISTS idx_qb_v3_sub_questions_order ON question_bank_sub_questions(question_id,display_order);
CREATE INDEX IF NOT EXISTS idx_qb_v3_media_content ON question_bank_media(content_id);
CREATE INDEX IF NOT EXISTS idx_qb_v3_media_sub_question ON question_bank_media(sub_question_id);
UPDATE roles SET permissions = permissions || '["question_bank.view","question_bank.manage","question_bank.media_manage","question_bank.taxonomy_manage"]'::jsonb WHERE slug IN ('admin','manager');
