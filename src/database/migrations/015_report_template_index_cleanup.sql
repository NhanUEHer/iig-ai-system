-- The base schema already enforces UNIQUE(code, version) through
-- report_templates_code_version_key. Remove the redundant index introduced by
-- the hardening migration so template writes maintain a single equivalent index.
DROP INDEX IF EXISTS report_templates_code_version_uq;
