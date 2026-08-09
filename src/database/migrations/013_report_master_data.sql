CREATE TABLE IF NOT EXISTS report_lookup_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(60) NOT NULL,
  code VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (category, code)
);

CREATE INDEX IF NOT EXISTS report_lookup_values_category_idx
  ON report_lookup_values(category, display_order) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(60) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(30) NOT NULL,
  required_sheets JSONB NOT NULL DEFAULT '[]'::jsonb,
  extraction_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_file_size_bytes BIGINT NOT NULL DEFAULT 10485760,
  allowed_extensions JSONB NOT NULL DEFAULT '["xlsx","xlsm","xls"]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (code, version)
);

INSERT INTO report_templates(code,name,version,required_sheets,extraction_config)
VALUES ('DVS_MONTHLY','Báo cáo tháng Phòng Dịch vụ số','2026.1',
  '["01_Tong_hop","98_DATA_EXPORT","02_Doanh_thu","03_MKT_Ads","04_Truyen_thong","05_Trade","06_Dao_tao","07_San_pham"]'::jsonb,
  '{"kpi":{"sheet":"98_DATA_EXPORT","headerRow":4,"dataStartRow":5},"details":{"revenue":"02_Doanh_thu!A17:L28","adsChannel":"03_MKT_Ads!A18:L27","adsProduct":"03_MKT_Ads!A32:F51","social":"04_Truyen_thong!A20:L29","trade":"05_Trade!A22:L41","training":"06_Dao_tao!A20:L25","product":"07_San_pham!A16:L40"}}'::jsonb)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,version=EXCLUDED.version,required_sheets=EXCLUDED.required_sheets,extraction_config=EXCLUDED.extraction_config,updated_at=CURRENT_TIMESTAMP;

WITH values_to_seed(category,code,label,display_order) AS (VALUES
('record_status','NOT_UPDATED','Chưa cập nhật',1),('record_status','UPDATING','Đang cập nhật',2),('record_status','PENDING_APPROVAL','Chờ duyệt',3),('record_status','COMPLETED','Đã hoàn thành',4),('record_status','LOCKED','Đã khóa',5),('record_status','ERROR','Lỗi',6),
('unit','BILLION_VND','Tỷ đồng',1),('unit','MILLION_VND','Triệu đồng',2),('unit','VND','Đồng',3),('unit','ORDER','Đơn',4),('unit','PERSON','Người',5),('unit','CLASS','Lớp',6),('unit','SCHOOL','Trường',7),('unit','COUNT','Lượt',8),('unit','PERCENT','%',9),('unit','ACTIVITY','Hoạt động',10),('unit','PRODUCT','Sản phẩm',11),
('evaluation_direction','INCREASE_GOOD','Tăng tốt',1),('evaluation_direction','DECREASE_GOOD','Giảm tốt',2),('evaluation_direction','MONITOR','Theo dõi',3),
('product_activity','NEW_LAUNCH','Ra mắt mới',1),('product_activity','NEW_PRODUCTION','Sản xuất mới',2),('product_activity','ADJUSTMENT','Điều chỉnh',3),('product_activity','RESEARCH','Nghiên cứu',4),('product_activity','REVIEW','Kiểm duyệt',5),('product_activity','EVALUATION','Đánh giá',6),('product_activity','EFFECTIVENESS_REVIEW','Đánh giá hiệu quả',7),('product_activity','LAUNCH','Ra mắt',8),('product_activity','OTHER','Khác',9),
('product_progress','NOT_STARTED','Chưa bắt đầu',1),('product_progress','IN_PROGRESS','Đang thực hiện',2),('product_progress','PENDING_APPROVAL','Chờ duyệt',3),('product_progress','COMPLETED','Hoàn thành',4),('product_progress','PAUSED','Tạm dừng',5),
('product_group','TOEIC_LR','TOEIC LR',1),('product_group','TOEIC_SW','TOEIC SW',2),('product_group','TOEIC','TOEIC',3),('product_group','TOEFL','TOEFL',4),('product_group','COMMUNICATION_ENGLISH','Tiếng Anh giao tiếp',5),('product_group','BUSINESS_ENGLISH','Business English',6),('product_group','IT','Tin học',7),('product_group','IN_HOUSE','Tự sản xuất',8),('product_group','PARTNER','Sản phẩm đối tác',9),('product_group','PARTNER_SHORT','Đối tác',10),('product_group','OTHER','Khác',11),
('ads_source','FACEBOOK','Facebook',1),('ads_source','GOOGLE','Google',2),('ads_source','TIKTOK','TikTok',3),('ads_source','COC_COC','Cốc Cốc',4),('ads_source','WEBSITE','Website',5),('ads_source','EMAIL_MARKETING','Email MKT',6),('ads_source','THREADS','Threads',7),('ads_source','FLYERS','Flyers',8),('ads_source','ZALO','Zalo',9),('ads_source','OTHER','Khác',10),
('social_channel','TOEIC_VIETNAM','Fanpage TOEIC Vietnam',1),('social_channel','IIG_VIETNAM','Fanpage IIG Vietnam',2),('social_channel','TOEFL_VIETNAM','Fanpage TOEFL Vietnam',3),('social_channel','TOEIC_CLASS','Fanpage Lớp học TOEIC',4),('social_channel','COMMUNITY_GROUP','Group cộng đồng',5),('social_channel','YOUTUBE','YouTube',6),('social_channel','TIKTOK','TikTok',7),('social_channel','WEBSITE','Website',8),('social_channel','ZALO','Zalo',9),('social_channel','OTHER','Khác',10),
('school_type','HIGH_SCHOOL','THPT',1),('school_type','UNIVERSITY','Đại học',2),('school_type','COLLEGE','Cao đẳng',3),('school_type','BUSINESS','Doanh nghiệp',4),('school_type','PARTNER','Đối tác',5),('school_type','OTHER','Khác',6),
('region','NORTH','Miền Bắc',1),('region','CENTRAL','Miền Trung',2),('region','SOUTH','Miền Nam',3),('region','NATIONWIDE','Toàn quốc',4),('region','ONLINE','Online',5),
('trade_activity','ACTIVATION','Activation',1),('trade_activity','WORKSHOP','Workshop',2),('trade_activity','SIGNING','Ký kết',3),('trade_activity','SEMINAR','Hội thảo',4),('trade_activity','CONSULTING','Tư vấn',5),('trade_activity','SCHOOL_MEDIA','Truyền thông tại trường',6),('trade_activity','OTHER','Khác',7),
('data_scope','ALL','ALL',1),('data_scope','TEAM_ONLY','TEAM_ONLY',2),('data_scope','ASSIGNED_ONLY','ASSIGNED_ONLY',3),
('boolean_option','YES','Có',1),('boolean_option','NO','Không',2)
)
INSERT INTO report_lookup_values(category,code,label,display_order)
SELECT category,code,label,display_order FROM values_to_seed
ON CONFLICT (category,code) DO UPDATE SET label=EXCLUDED.label,display_order=EXCLUDED.display_order,is_active=TRUE,updated_at=CURRENT_TIMESTAMP;
