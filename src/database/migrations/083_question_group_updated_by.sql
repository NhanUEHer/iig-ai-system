-- Older local installations may have created question_groups from the V3
-- foundation migration, which did not include this audit field.
ALTER TABLE question_groups
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
