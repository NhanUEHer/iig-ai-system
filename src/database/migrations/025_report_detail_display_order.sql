-- Preserve row order across autosave, reload and dashboard rendering.

ALTER TABLE report_revenue_details ADD COLUMN IF NOT EXISTS display_order INTEGER;
ALTER TABLE report_ads_channel_details ADD COLUMN IF NOT EXISTS display_order INTEGER;
ALTER TABLE report_ads_product_details ADD COLUMN IF NOT EXISTS display_order INTEGER;
ALTER TABLE report_social_details ADD COLUMN IF NOT EXISTS display_order INTEGER;
ALTER TABLE report_trade_details ADD COLUMN IF NOT EXISTS display_order INTEGER;
ALTER TABLE report_training_details ADD COLUMN IF NOT EXISTS display_order INTEGER;
ALTER TABLE report_product_details ADD COLUMN IF NOT EXISTS display_order INTEGER;

WITH ranked AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY version_id ORDER BY id) position FROM report_revenue_details)
UPDATE report_revenue_details target SET display_order=ranked.position FROM ranked WHERE target.id=ranked.id AND target.display_order IS NULL;
WITH ranked AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY version_id ORDER BY id) position FROM report_ads_channel_details)
UPDATE report_ads_channel_details target SET display_order=ranked.position FROM ranked WHERE target.id=ranked.id AND target.display_order IS NULL;
WITH ranked AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY version_id ORDER BY id) position FROM report_ads_product_details)
UPDATE report_ads_product_details target SET display_order=ranked.position FROM ranked WHERE target.id=ranked.id AND target.display_order IS NULL;
WITH ranked AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY version_id ORDER BY id) position FROM report_social_details)
UPDATE report_social_details target SET display_order=ranked.position FROM ranked WHERE target.id=ranked.id AND target.display_order IS NULL;
WITH ranked AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY version_id ORDER BY id) position FROM report_trade_details)
UPDATE report_trade_details target SET display_order=ranked.position FROM ranked WHERE target.id=ranked.id AND target.display_order IS NULL;
WITH ranked AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY version_id ORDER BY id) position FROM report_training_details)
UPDATE report_training_details target SET display_order=ranked.position FROM ranked WHERE target.id=ranked.id AND target.display_order IS NULL;
WITH ranked AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY version_id ORDER BY id) position FROM report_product_details)
UPDATE report_product_details target SET display_order=ranked.position FROM ranked WHERE target.id=ranked.id AND target.display_order IS NULL;

ALTER TABLE report_revenue_details ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE report_ads_channel_details ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE report_ads_product_details ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE report_social_details ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE report_trade_details ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE report_training_details ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE report_product_details ALTER COLUMN display_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS report_revenue_details_order_idx ON report_revenue_details(version_id,display_order);
CREATE INDEX IF NOT EXISTS report_ads_channel_details_order_idx ON report_ads_channel_details(version_id,display_order);
CREATE INDEX IF NOT EXISTS report_ads_product_details_order_idx ON report_ads_product_details(version_id,display_order);
CREATE INDEX IF NOT EXISTS report_social_details_order_idx ON report_social_details(version_id,display_order);
CREATE INDEX IF NOT EXISTS report_trade_details_order_idx ON report_trade_details(version_id,display_order);
CREATE INDEX IF NOT EXISTS report_training_details_order_idx ON report_training_details(version_id,display_order);
CREATE INDEX IF NOT EXISTS report_product_details_order_idx ON report_product_details(version_id,display_order);
