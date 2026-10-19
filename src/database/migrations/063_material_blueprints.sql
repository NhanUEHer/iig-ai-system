CREATE TABLE IF NOT EXISTS material_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id),
  title VARCHAR(240) NOT NULL,
  summary TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  instruction_language VARCHAR(16) NOT NULL,
  target_scores JSONB NOT NULL DEFAULT '{}',
  difficulty_mix JSONB NOT NULL DEFAULT '{}',
  settings_snapshot JSONB NOT NULL DEFAULT '{}',
  trend_snapshot JSONB NOT NULL DEFAULT '[]',
  rejection_note TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT material_blueprint_status CHECK (status IN ('DRAFT','APPROVED','REJECTED')),
  CONSTRAINT material_blueprint_language CHECK (instruction_language IN ('VI','EN','BILINGUAL'))
);

CREATE TABLE IF NOT EXISTS material_blueprint_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES material_blueprints(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  material_type VARCHAR(40) NOT NULL,
  skill VARCHAR(24),
  question_group VARCHAR(80),
  title VARCHAR(240) NOT NULL,
  objective TEXT NOT NULL,
  rationale TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  difficulty_mix JSONB NOT NULL DEFAULT '{}',
  source_trend_ids JSONB NOT NULL DEFAULT '[]',
  generation_constraints JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blueprint_id, position),
  CONSTRAINT material_blueprint_item_quantity CHECK (quantity BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS material_blueprints_owner_idx
  ON material_blueprints(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS material_blueprint_items_parent_idx
  ON material_blueprint_items(blueprint_id, position);

