-- Content Studio: new, self-contained learning-content workspace.
-- Owns only cs_* tables; does not touch the legacy key-vocab/dictionary schema.

CREATE TABLE IF NOT EXISTS cs_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES cs_folders(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cs_folders_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS cs_folders_parent_idx ON cs_folders(parent_id, sort_order);

CREATE TABLE IF NOT EXISTS cs_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES cs_folders(id) ON DELETE SET NULL,
  title VARCHAR(240) NOT NULL,
  source_kind VARCHAR(16) NOT NULL DEFAULT 'paste' CHECK (source_kind IN ('paste','docx')),
  source_file_name VARCHAR(255),
  source_text TEXT NOT NULL,
  detection JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generating','needs_review','ready','failed')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cs_items_folder_idx ON cs_items(folder_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cs_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES cs_items(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('passage','question_set')),
  position INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (item_id, position)
);

CREATE TABLE IF NOT EXISTS cs_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES cs_segments(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  stem TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  answer_key CHAR(1) CHECK (answer_key IN ('A','B','C','D')),
  UNIQUE (segment_id, number)
);

WITH required_permissions(permission) AS (
  VALUES ('content_studio.view'),('content_studio.generate'),('content_studio.edit'),
         ('content_studio.manage_folders'),('content_studio.export')
)
UPDATE roles AS role
SET permissions = (
      SELECT jsonb_agg(permission ORDER BY permission)
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(role.permissions, '[]'::jsonb)) AS permission
        UNION SELECT permission FROM required_permissions
      ) AS merged
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE role.slug = 'admin';
