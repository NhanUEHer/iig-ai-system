-- Migration 075: Question Bank Restructuring and Tagging System
-- Expands Question Bank schema for hierarchical question groups, multi-content passages,
-- sub-questions, sub-question options, tags, and scoped media targeted to content or sub-question.

-- 1. Question Groups (one-level hierarchy)
CREATE TABLE IF NOT EXISTS question_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(240) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_question_groups_code ON question_groups(code);

-- 2. Expand question_bank_questions
-- NOTE: group_id is nullable for backward compatibility with existing rows.
-- NEW BE REQUIREMENT: Application logic (Backend API) MUST enforce group_id NOT NULL on new question creation.
ALTER TABLE question_bank_questions
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES question_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note TEXT;

CREATE INDEX IF NOT EXISTS idx_question_bank_questions_group_id ON question_bank_questions(group_id);

-- 3. Question Bank Contents (passages, reading texts, listening audio scripts/transcripts)
CREATE TABLE IF NOT EXISTS question_bank_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE CASCADE,
  content_type VARCHAR(40) NOT NULL DEFAULT 'TEXT',
  title VARCHAR(240),
  body_text TEXT,
  script_html TEXT,
  content_html TEXT,
  translation_html TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_question_bank_contents_question_order 
  ON question_bank_contents(question_id, display_order);

-- 4. Question Bank Sub-questions
CREATE TABLE IF NOT EXISTS question_bank_sub_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE CASCADE,
  content_id UUID REFERENCES question_bank_contents(id) ON DELETE SET NULL,
  sub_question_number INTEGER NOT NULL,
  question_type VARCHAR(40) NOT NULL DEFAULT 'MCQ_SINGLE',
  title VARCHAR(240),
  prompt_text TEXT NOT NULL,
  hint_html TEXT,
  explanation_html TEXT,
  note TEXT,
  points INTEGER NOT NULL DEFAULT 10,
  preparation_seconds INTEGER,
  response_seconds INTEGER,
  max_writing_length INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_question_bank_sub_questions_number UNIQUE (question_id, sub_question_number),
  CONSTRAINT chk_sub_question_type CHECK (
    question_type IN (
      'MCQ_SINGLE', 'MCQ_MULTIPLE',
      'RECORD_AUDIO', 'RECORD_VIDEO',
      'WRITING_SHORT', 'WRITING_ESSAY'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_question_bank_sub_questions_question_order 
  ON question_bank_sub_questions(question_id, display_order);

CREATE INDEX IF NOT EXISTS idx_question_bank_sub_questions_content_id 
  ON question_bank_sub_questions(content_id);

-- 5. Question Bank Sub-question Options
CREATE TABLE IF NOT EXISTS question_bank_sub_question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_question_id UUID NOT NULL REFERENCES question_bank_sub_questions(id) ON DELETE CASCADE,
  option_key VARCHAR(20) NOT NULL,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_question_bank_sub_options_key UNIQUE (sub_question_id, option_key)
);

CREATE INDEX IF NOT EXISTS idx_question_bank_sub_options_sub_q_order 
  ON question_bank_sub_question_options(sub_question_id, display_order);

-- 6. Question Bank Tags (Master tags catalog)
CREATE TABLE IF NOT EXISTS question_bank_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_question_bank_tags_name ON question_bank_tags(name);
CREATE INDEX IF NOT EXISTS idx_question_bank_tags_category ON question_bank_tags(category);

-- 7. Sub-question Tags (Junction table linking sub-questions and tags)
CREATE TABLE IF NOT EXISTS sub_question_tags (
  sub_question_id UUID NOT NULL REFERENCES question_bank_sub_questions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES question_bank_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sub_question_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_question_tags_tag_id ON sub_question_tags(tag_id);

-- 8. Expand question_bank_media for scoped targeting (QUESTION_LEGACY, CONTENT, or SUB_QUESTION)
-- NOTE: scope defaults to 'QUESTION_LEGACY' for backward compatibility so existing media rows in question_bank_media remain valid without breaking target consistency check.
ALTER TABLE question_bank_media
  ADD COLUMN IF NOT EXISTS scope VARCHAR(30) NOT NULL DEFAULT 'QUESTION_LEGACY',
  ADD COLUMN IF NOT EXISTS content_id UUID REFERENCES question_bank_contents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sub_question_id UUID REFERENCES question_bank_sub_questions(id) ON DELETE CASCADE;

ALTER TABLE question_bank_media
  DROP CONSTRAINT IF EXISTS chk_question_bank_media_scope;

ALTER TABLE question_bank_media
  ADD CONSTRAINT chk_question_bank_media_scope 
    CHECK (scope IN ('QUESTION_LEGACY', 'CONTENT', 'SUB_QUESTION'));

-- Validate scope consistency:
-- - QUESTION_LEGACY: preserves existing legacy rows where media belongs directly to question_id (content_id and sub_question_id are null).
-- - CONTENT: media is bound to a specific content item (content_id IS NOT NULL).
-- - SUB_QUESTION: media is bound to a specific sub-question item (sub_question_id IS NOT NULL).
ALTER TABLE question_bank_media
  DROP CONSTRAINT IF EXISTS chk_question_bank_media_target_consistency;

ALTER TABLE question_bank_media
  ADD CONSTRAINT chk_question_bank_media_target_consistency CHECK (
    (scope = 'QUESTION_LEGACY' AND content_id IS NULL AND sub_question_id IS NULL) OR
    (scope = 'CONTENT' AND content_id IS NOT NULL) OR
    (scope = 'SUB_QUESTION' AND sub_question_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_question_bank_media_content_id 
  ON question_bank_media(content_id);

CREATE INDEX IF NOT EXISTS idx_question_bank_media_sub_question_id 
  ON question_bank_media(sub_question_id);

CREATE INDEX IF NOT EXISTS idx_question_bank_media_scope 
  ON question_bank_media(scope);
