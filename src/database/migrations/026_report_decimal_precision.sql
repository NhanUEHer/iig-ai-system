-- Preserve high-precision manually entered report values.
-- Existing values are widened without rounding or rewriting report records.
DO $$
DECLARE
  column_to_expand RECORD;
BEGIN
  FOR column_to_expand IN
    SELECT table_name,column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name LIKE 'report\_%' ESCAPE '\'
      AND data_type='numeric'
      AND numeric_scale=6
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC(30,9)',
      column_to_expand.table_name,
      column_to_expand.column_name
    );
  END LOOP;
END $$;
