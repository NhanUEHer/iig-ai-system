-- ACTIVATION is the established master value; avoid exposing a duplicate
-- SCHOOL_ACTIVATION option introduced by the report architecture migration.
UPDATE report_lookup_values
SET is_active=FALSE,updated_at=CURRENT_TIMESTAMP
WHERE category='trade_activity' AND code='SCHOOL_ACTIVATION'
  AND EXISTS (
    SELECT 1 FROM report_lookup_values existing
    WHERE existing.category='trade_activity' AND existing.code='ACTIVATION' AND existing.is_active=TRUE
  );
