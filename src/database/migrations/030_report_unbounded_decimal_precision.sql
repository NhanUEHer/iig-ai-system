-- Report entry values must retain the exact decimal scale supplied by users or
-- XLSX imports. Removing the NUMERIC typmod prevents PostgreSQL from rounding
-- values to a fixed number of fractional digits.
DO $$
DECLARE
  report_numeric_column RECORD;
BEGIN
  FOR report_numeric_column IN
    SELECT table_name,column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name LIKE 'report\_%' ESCAPE '\'
      AND data_type='numeric'
      AND numeric_scale IS NOT NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC',
      report_numeric_column.table_name,
      report_numeric_column.column_name
    );
  END LOOP;
END $$;
