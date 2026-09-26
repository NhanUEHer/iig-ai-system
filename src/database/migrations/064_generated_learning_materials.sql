CREATE TABLE IF NOT EXISTS generated_learning_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES material_blueprints(id) ON DELETE CASCADE,
  blueprint_item_id UUID NOT NULL REFERENCES material_blueprint_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'NEEDS_REVIEW',
  title VARCHAR(240) NOT NULL,
  content JSONB NOT NULL,
  model VARCHAR(120) NOT NULL,
  prompt_version VARCHAR(32) NOT NULL DEFAULT 'material-v1',
  usage_metadata JSONB NOT NULL DEFAULT '{}',
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blueprint_item_id, version),
  CONSTRAINT generated_material_status CHECK (status IN ('NEEDS_REVIEW','APPROVED','REJECTED'))
);

CREATE INDEX IF NOT EXISTS generated_material_blueprint_idx
  ON generated_learning_materials(blueprint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generated_material_item_idx
  ON generated_learning_materials(blueprint_item_id, version DESC);
