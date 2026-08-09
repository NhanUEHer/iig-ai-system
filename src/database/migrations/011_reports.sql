CREATE TABLE IF NOT EXISTS report_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft','open','submitted','approved','locked','reopened')),
  submission_deadline TIMESTAMPTZ,
  current_version_id UUID,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (year, month)
);

CREATE TABLE IF NOT EXISTS report_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES report_periods(id),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  sha256 CHAR(64) NOT NULL,
  template_version VARCHAR(30),
  file_year SMALLINT,
  file_month SMALLINT CHECK (file_month BETWEEN 1 AND 12),
  status VARCHAR(30) NOT NULL CHECK (status IN ('ready','committing','committed','failed','cancelled')),
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  parsed_payload JSONB,
  inspected_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_data_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES report_periods(id),
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('excel_import','manual_entry','migration')),
  import_id UUID REFERENCES report_imports(id),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded','rejected')),
  created_by UUID NOT NULL REFERENCES users(id),
  published_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ,
  UNIQUE (period_id, version_no),
  UNIQUE (period_id, id)
);

ALTER TABLE report_periods
  ADD CONSTRAINT report_periods_current_version_fk
  FOREIGN KEY (id, current_version_id) REFERENCES report_data_versions(period_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS report_data_versions_one_published_uq
  ON report_data_versions(period_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS report_imports_period_created_idx
  ON report_imports(period_id, created_at DESC);

CREATE TABLE IF NOT EXISTS report_kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES report_teams(id),
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  evaluation_direction VARCHAR(20) NOT NULL CHECK (evaluation_direction IN ('increase_good','decrease_good','monitor')),
  aggregation_method VARCHAR(30) NOT NULL CHECK (aggregation_method IN ('sum','last_value','average','weighted_average','ratio_of_sums','ytd_last_value','non_aggregatable')),
  aggregation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_sheet VARCHAR(100),
  display_order SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_kpi_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  kpi_definition_id UUID NOT NULL REFERENCES report_kpi_definitions(id),
  target_value NUMERIC(24,6), actual_value NUMERIC(24,6),
  previous_value NUMERIC(24,6), prior_year_value NUMERIC(24,6),
  evaluation VARCHAR(30), note TEXT,
  source_type VARCHAR(30) NOT NULL DEFAULT 'excel_import',
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (version_id, kpi_definition_id)
);

CREATE TABLE IF NOT EXISTS report_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES report_teams(id),
  executive_summary TEXT, highlights TEXT, issues TEXT, risks TEXT, proposals TEXT, next_month_plan TEXT,
  approval_status VARCHAR(30), approved_by UUID REFERENCES users(id), approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (version_id, team_id)
);

CREATE TABLE IF NOT EXISTS report_import_table_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES report_imports(id) ON DELETE CASCADE,
  source_sheet VARCHAR(100), target_table VARCHAR(100) NOT NULL,
  rows_read INTEGER NOT NULL DEFAULT 0, rows_inserted INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL, error_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_revenue_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  row_key VARCHAR(120) NOT NULL, product_group VARCHAR(120), product_code VARCHAR(120), product_name VARCHAR(255) NOT NULL,
  order_count NUMERIC(18,2), revenue NUMERIC(24,6), monthly_target NUMERIC(24,6), previous_revenue NUMERIC(24,6), prior_year_revenue NUMERIC(24,6), note TEXT,
  UNIQUE (version_id, row_key)
);
CREATE TABLE IF NOT EXISTS report_ads_channel_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  row_key VARCHAR(120) NOT NULL, channel_code VARCHAR(120), traffic_source VARCHAR(255) NOT NULL,
  budget_target NUMERIC(24,6), budget_actual NUMERIC(24,6), lead_count NUMERIC(18,2), order_count NUMERIC(18,2), revenue NUMERIC(24,6), previous_revenue NUMERIC(24,6), note TEXT,
  UNIQUE (version_id, row_key)
);
CREATE TABLE IF NOT EXISTS report_ads_product_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  row_key VARCHAR(120) NOT NULL, product_group VARCHAR(120), product_code VARCHAR(120), product_name VARCHAR(255) NOT NULL,
  ad_cost NUMERIC(24,6), revenue NUMERIC(24,6), lead_count NUMERIC(18,2), qualified_lead_count NUMERIC(18,2), order_count NUMERIC(18,2), note TEXT,
  UNIQUE (version_id, row_key)
);
CREATE TABLE IF NOT EXISTS report_social_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  row_key VARCHAR(120) NOT NULL, channel_code VARCHAR(120), channel_name VARCHAR(255) NOT NULL,
  followers_current NUMERIC(24,6), followers_previous NUMERIC(24,6), reach_current NUMERIC(24,6), reach_previous NUMERIC(24,6), organic_reach NUMERIC(24,6),
  video_views NUMERIC(24,6), engagement_count NUMERIC(24,6), lead_count NUMERIC(18,2), order_count NUMERIC(18,2), revenue NUMERIC(24,6), budget NUMERIC(24,6), note TEXT,
  UNIQUE (version_id, row_key)
);
CREATE TABLE IF NOT EXISTS report_trade_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  row_key VARCHAR(160) NOT NULL, organization_code VARCHAR(160), organization_name VARCHAR(255) NOT NULL, organization_type VARCHAR(100), region VARCHAR(100), activity_type VARCHAR(120),
  activity_date_text VARCHAR(255), activity_days NUMERIC(12,2), workshop_count NUMERIC(18,2), social_post_count NUMERIC(18,2), reach NUMERIC(24,6), lead_count NUMERIC(18,2), order_count NUMERIC(18,2), budget NUMERIC(24,6), revenue NUMERIC(24,6), is_new_contract BOOLEAN, note TEXT,
  UNIQUE (version_id, row_key)
);
CREATE TABLE IF NOT EXISTS report_training_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  row_key VARCHAR(120) NOT NULL, course_code VARCHAR(120), course_name VARCHAR(255) NOT NULL,
  class_count NUMERIC(18,2), active_student_count NUMERIC(18,2), student_target NUMERIC(18,2), new_student_count NUMERIC(18,2), completed_student_count NUMERIC(18,2), qualified_student_count NUMERIC(18,2), teacher_count NUMERIC(18,2), started_class_count NUMERIC(18,2), completed_class_count NUMERIC(18,2), upsell_revenue NUMERIC(24,6), upsell_revenue_target NUMERIC(24,6), status VARCHAR(100), note TEXT,
  UNIQUE (version_id, row_key)
);
CREATE TABLE IF NOT EXISTS report_product_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  row_key VARCHAR(160) NOT NULL, product_group VARCHAR(120), activity_code VARCHAR(160), activity_name VARCHAR(255) NOT NULL, activity_type VARCHAR(120), owner_unit VARCHAR(255), cooperating_unit VARCHAR(255),
  planned_start_date DATE, planned_end_date DATE, actual_start_date DATE, actual_end_date DATE, target_quantity NUMERIC(18,2), actual_quantity NUMERIC(18,2), progress_status VARCHAR(100), output_url TEXT, implementation_result TEXT, evaluation_result TEXT, next_action TEXT, note TEXT,
  UNIQUE (version_id, row_key)
);

INSERT INTO report_teams (code,name,display_order) VALUES
('REV','Doanh thu',1),('ADS','Marketing Ads',2),('COM','Truyền thông',3),
('TRADE','Trade',4),('TRAIN','Đào tạo',5),('PROD','Sản phẩm',6)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,display_order=EXCLUDED.display_order;

WITH catalog(team_code,code,name,unit,direction,aggregation,source_sheet,display_order) AS (VALUES
('REV','DT_01','Doanh thu thực hiện tháng','Tỷ đồng','increase_good','sum','02_Doanh_thu',1),
('REV','DT_02','Doanh thu lũy kế năm','Tỷ đồng','increase_good','ytd_last_value','02_Doanh_thu',2),
('REV','DT_03','Số đơn hàng','Đơn','increase_good','sum','02_Doanh_thu',3),
('REV','DT_04','Doanh thu trung bình/đơn hàng','Triệu đồng','increase_good','ratio_of_sums','02_Doanh_thu',4),
('REV','DT_05','Doanh thu trung bình/Sales','Triệu đồng','increase_good','ratio_of_sums','02_Doanh_thu',5),
('REV','DT_06','Số lượng Sales','Người','monitor','last_value','02_Doanh_thu',6),
('ADS','ADS_01','Doanh thu từ Ads','Tỷ đồng','increase_good','sum','03_MKT_Ads',1),
('ADS','ADS_02','Số lượng data mang về','Lượt','increase_good','sum','03_MKT_Ads',2),
('ADS','ADS_03','Số đơn hàng từ Ads','Đơn','increase_good','sum','03_MKT_Ads',3),
('ADS','ADS_04','Tỷ lệ chốt (đơn/data)','%','increase_good','ratio_of_sums','03_MKT_Ads',4),
('ADS','ADS_05','Ngân sách đã sử dụng','Tỷ đồng','monitor','sum','03_MKT_Ads',5),
('ADS','ADS_06','Chi phí/Doanh thu (CPR)','%','decrease_good','ratio_of_sums','03_MKT_Ads',6),
('ADS','ADS_07','Doanh thu trung bình/đơn Ads','Triệu đồng','increase_good','ratio_of_sums','03_MKT_Ads',7),
('COM','TT_01','Tổng Followers','Lượt','increase_good','last_value','04_Truyen_thong',1),
('COM','TT_02','Tăng trưởng Followers','%','increase_good','ratio_of_sums','04_Truyen_thong',2),
('COM','TT_03','Tổng Reach','Lượt','increase_good','sum','04_Truyen_thong',3),
('COM','TT_04','Tỷ lệ tiếp cận Organic','%','increase_good','ratio_of_sums','04_Truyen_thong',4),
('COM','TT_05','Engagement Rate','%','increase_good','ratio_of_sums','04_Truyen_thong',5),
('COM','TT_06','Lượt xem Video','Lượt','increase_good','sum','04_Truyen_thong',6),
('COM','TT_07','Số lượng Data từ Content','Lượt','increase_good','sum','04_Truyen_thong',7),
('COM','TT_08','Ngân sách Content','Triệu đồng','monitor','sum','04_Truyen_thong',8),
('COM','TT_09','Doanh thu từ Content','Tỷ đồng','increase_good','sum','04_Truyen_thong',9),
('TRADE','TRADE_01','Tổng số trường đã triển khai','Trường','increase_good','last_value','05_Trade',1),
('TRADE','TRADE_02','Trường ký kết triển khai mới','Trường','increase_good','sum','05_Trade',2),
('TRADE','TRADE_03','Trường tổ chức hoạt động trong tháng','Trường','increase_good','sum','05_Trade',3),
('TRADE','TRADE_04','Số ngày Activation','Lượt','increase_good','sum','05_Trade',4),
('TRADE','TRADE_05','Số Workshop đã tổ chức','Lượt','increase_good','sum','05_Trade',5),
('TRADE','TRADE_06','Bài Social trên kênh trường/cộng đồng','Lượt','increase_good','sum','05_Trade',6),
('TRADE','TRADE_07','Reach từ hoạt động Trade','Lượt','increase_good','sum','05_Trade',7),
('TRADE','TRADE_08','Data thu về','Lượt','increase_good','sum','05_Trade',8),
('TRADE','TRADE_09','Ngân sách Trade','Tỷ đồng','monitor','sum','05_Trade',9),
('TRADE','TRADE_10','Doanh thu từ Trade','Tỷ đồng','increase_good','sum','05_Trade',10),
('TRADE','TRADE_11','Chi phí/Doanh thu','%','decrease_good','ratio_of_sums','05_Trade',11),
('TRAIN','DAO_01','Tổng học viên đang đào tạo','Người','increase_good','last_value','06_Dao_tao',1),
('TRAIN','DAO_02','Học viên mới','Người','increase_good','sum','06_Dao_tao',2),
('TRAIN','DAO_03','Học viên kết thúc khóa','Người','monitor','sum','06_Dao_tao',3),
('TRAIN','DAO_04','Tỷ lệ học viên đạt đầu ra','%','increase_good','ratio_of_sums','06_Dao_tao',4),
('TRAIN','DAO_05','Lớp học khai giảng','Lớp','increase_good','sum','06_Dao_tao',5),
('TRAIN','DAO_06','Lớp học đang đào tạo','Lớp','monitor','last_value','06_Dao_tao',6),
('TRAIN','DAO_07','Lớp học bế giảng','Lớp','monitor','sum','06_Dao_tao',7),
('TRAIN','DAO_08','Giáo viên Active','Người','monitor','last_value','06_Dao_tao',8),
('TRAIN','DAO_09','Doanh thu học lên','Tỷ đồng','increase_good','sum','06_Dao_tao',9),
('PROD','SP_01','Số lượng đề thi thử được sản xuất','Hoạt động','increase_good','sum','07_San_pham',1),
('PROD','SP_02','Khóa tự học TOEIC ra mắt/điều chỉnh','Hoạt động','increase_good','sum','07_San_pham',2),
('PROD','SP_03','Khóa tự học TOEFL ra mắt/điều chỉnh','Hoạt động','increase_good','sum','07_San_pham',3),
('PROD','SP_04','Khóa trực tuyến ra mắt/điều chỉnh','Hoạt động','increase_good','sum','07_San_pham',4),
('PROD','SP_05','Hoạt động nghiên cứu/đánh giá khác','Hoạt động','monitor','sum','07_San_pham',5)
)
INSERT INTO report_kpi_definitions(team_id,code,name,unit,evaluation_direction,aggregation_method,source_sheet,display_order)
SELECT t.id,c.code,c.name,c.unit,c.direction,c.aggregation,c.source_sheet,c.display_order
FROM catalog c JOIN report_teams t ON t.code=c.team_code
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,unit=EXCLUDED.unit,evaluation_direction=EXCLUDED.evaluation_direction,
aggregation_method=EXCLUDED.aggregation_method,source_sheet=EXCLUDED.source_sheet,display_order=EXCLUDED.display_order;

