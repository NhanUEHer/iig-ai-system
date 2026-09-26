ALTER TABLE generated_learning_materials
  ADD COLUMN IF NOT EXISTS template_code VARCHAR(160),
  ADD COLUMN IF NOT EXISTS validation_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pipeline_metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS generated_material_template_idx
  ON generated_learning_materials(template_code, created_at DESC);
