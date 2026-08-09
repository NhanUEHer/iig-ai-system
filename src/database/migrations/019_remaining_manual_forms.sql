ALTER TABLE report_social_details
  ADD COLUMN IF NOT EXISTS engagement_rate NUMERIC(12,6);

ALTER TABLE report_training_details
  ADD COLUMN IF NOT EXISTS output_rate NUMERIC(12,6);

WITH values_to_seed(category,code,label,display_order) AS (VALUES
  ('training_status','NOT_STARTED','Chưa bắt đầu',1),
  ('training_status','IN_PROGRESS','Đang đào tạo',2),
  ('training_status','COMPLETED','Hoàn thành',3),
  ('training_status','PAUSED','Tạm dừng',4),
  ('training_status','OTHER','Khác',5)
)
INSERT INTO report_lookup_values(category,code,label,display_order)
SELECT category,code,label,display_order FROM values_to_seed
ON CONFLICT(category,code) DO UPDATE SET
  label=EXCLUDED.label,display_order=EXCLUDED.display_order,is_active=TRUE,updated_at=CURRENT_TIMESTAMP;
