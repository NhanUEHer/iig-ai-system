CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(60) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (slug, name, description, permissions, is_system) VALUES
('admin', 'Quản trị viên', 'Toàn quyền cấu hình và vận hành hệ thống.', '["submissions.view","submissions.sync","submissions.delete","submissions.export","scoring.grade","scoring.transcribe","scoring.clean_audio","mappings.view","mappings.manage","agents.view","agents.manage","audio.view","audio.manage","users.view","users.manage","roles.view","roles.manage","logs.view"]', TRUE),
('manager', 'Quản lý', 'Quản lý nghiệp vụ chấm bài và báo cáo.', '["submissions.view","submissions.sync","submissions.export","scoring.grade","scoring.transcribe","scoring.clean_audio","mappings.view","agents.view","audio.view","logs.view"]', TRUE),
('user', 'Nhân viên', 'Thực hiện các nghiệp vụ chấm bài được giao.', '["submissions.view","scoring.grade","scoring.transcribe","scoring.clean_audio","audio.view"]', TRUE)
ON CONFLICT (slug) DO NOTHING;

