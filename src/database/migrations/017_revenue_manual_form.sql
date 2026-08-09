-- Revenue KPI summary is manually entered; detail rows remain the reconciliation source.
UPDATE report_kpi_definitions
SET input_mode='manual',formula_code=NULL
WHERE code IN ('DT_01','DT_02','DT_03','DT_04','DT_05','DT_06');

-- Keep the requested business master data canonical and active.
WITH requested(category,code,label,display_order) AS (VALUES
  ('unit','BILLION_VND','Tỷ đồng',1),('unit','MILLION_VND','Triệu đồng',2),('unit','VND','Đồng',3),
  ('unit','ORDER','Đơn',4),('unit','PERSON','Người',5),('unit','CLASS','Lớp',6),('unit','SCHOOL','Trường',7),
  ('unit','COUNT','Lượt',8),('unit','PERCENT','%',9),('unit','ACTIVITY','Hoạt động',10),('unit','PRODUCT','Sản phẩm',11),
  ('evaluation_direction','INCREASE_GOOD','Tăng tốt',1),('evaluation_direction','DECREASE_GOOD','Giảm tốt',2),('evaluation_direction','MONITOR','Theo dõi',3),
  ('product_activity','NEW_LAUNCH','Ra mắt mới',1),('product_activity','ADJUSTMENT','Điều chỉnh',2),('product_activity','RESEARCH','Nghiên cứu',3),('product_activity','EVALUATION','Đánh giá',4),('product_activity','OTHER','Khác',5),
  ('product_progress','NOT_STARTED','Chưa bắt đầu',1),('product_progress','IN_PROGRESS','Đang thực hiện',2),('product_progress','PENDING_APPROVAL','Chờ duyệt',3),('product_progress','COMPLETED','Hoàn thành',4),('product_progress','PAUSED','Tạm dừng',5),
  ('product_group','TOEIC_LR','TOEIC LR',1),('product_group','TOEIC_SW','TOEIC SW',2),('product_group','TOEFL','TOEFL',3),('product_group','COMMUNICATION_ENGLISH','Tiếng Anh giao tiếp',4),('product_group','IT','Tin học',5),('product_group','PARTNER','Sản phẩm đối tác',6),('product_group','OTHER','Khác',7)
)
INSERT INTO report_lookup_values(category,code,label,display_order)
SELECT * FROM requested
ON CONFLICT(category,code) DO UPDATE SET label=EXCLUDED.label,display_order=EXCLUDED.display_order,is_active=TRUE,updated_at=CURRENT_TIMESTAMP;
