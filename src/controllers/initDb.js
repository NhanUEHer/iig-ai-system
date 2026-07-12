const db = require('./db');

const createTablesQuery = `
CREATE TABLE IF NOT EXISTS tokens (
  id SERIAL PRIMARY KEY,
  access_token TEXT NOT NULL,
  expired_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keycode_mappings (
  keycode VARCHAR(20) PRIMARY KEY,
  course_scoring_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mocktest_submissions (
  id VARCHAR(36) PRIMARY KEY,
  keycode VARCHAR(20) NOT NULL,
  test_name VARCHAR(255) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  student_email VARCHAR(100),
  student_phone VARCHAR(20),
  status SMALLINT NOT NULL DEFAULT 1,
  submitted_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submission_answers (
  id VARCHAR(100) PRIMARY KEY,
  submission_id VARCHAR(36) NOT NULL REFERENCES mocktest_submissions(id) ON DELETE CASCADE,
  section VARCHAR(10) NOT NULL,
  question_no INT NOT NULL,
  choose_id VARCHAR(36) NOT NULL,
  prompt_text TEXT NOT NULL,
  image_url TEXT,
  keywords VARCHAR(255),
  student_writing TEXT,
  student_audio_file_id VARCHAR(100),
  student_audio_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT idx_submission_q UNIQUE (submission_id, section, question_no)
);

DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  api_endpoint TEXT NOT NULL,
  api_key VARCHAR(255) NOT NULL,
  api_type VARCHAR(50) NOT NULL, -- STT or Grading
  stt_target VARCHAR(50) NOT NULL DEFAULT 'student_answer', -- student_answer, question, context
  target_questions JSONB NOT NULL, -- list of question groups e.g. ["sp_read_aloud", "sp_describe_pic"]
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_evaluation_results (
  id SERIAL PRIMARY KEY,
  answer_id VARCHAR(100) NOT NULL REFERENCES submission_answers(id) ON DELETE CASCADE,
  
  -- Thời gian request và response AI
  request_sent_at TIMESTAMP,
  response_received_at TIMESTAMP,
  
  -- Các trường kết quả trả về từ AI
  transcribe TEXT,
  final_score DECIMAL(5,2),
  pronunciation_score VARCHAR(50),
  pronunciation_rationale TEXT,
  intonation_score VARCHAR(50),
  intonation_rationale TEXT,
  cohesion_score VARCHAR(50),
  cohesion_rationale TEXT,
  grammar_score VARCHAR(50),
  grammar_rationale TEXT,
  vocabulary_score VARCHAR(50),
  vocabulary_rationale TEXT,
  completeness_score VARCHAR(50),
  completeness_rationale TEXT,
  relevance_score VARCHAR(50),
  relevance_rationale TEXT,
  errors JSONB DEFAULT '[]',
  overall_1 TEXT,
  overall_2 TEXT,
  key_errors TEXT,
  strength TEXT,
  weakness TEXT,
  improvement TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_answer_ai_eval UNIQUE (answer_id)
);

`;

// Migration: add new columns if they don't exist yet
const migrateTablesQuery = `
  ALTER TABLE keycode_mappings
    ADD COLUMN IF NOT EXISTS student_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS test_name    VARCHAR(255);

  ALTER TABLE mocktest_submissions
    ADD COLUMN IF NOT EXISTS overall_score VARCHAR(100),
    ADD COLUMN IF NOT EXISTS scored_date   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMP;

  -- ai_agents: add stt_target column
  ALTER TABLE ai_agents
    ADD COLUMN IF NOT EXISTS stt_target VARCHAR(50) NOT NULL DEFAULT 'student_answer';

  -- submission_answers: add all new detail columns
  ALTER TABLE submission_answers
    ADD COLUMN IF NOT EXISTS questionnaire_type     SMALLINT,
    ADD COLUMN IF NOT EXISTS question_title         VARCHAR(255),
    ADD COLUMN IF NOT EXISTS question_name          TEXT,
    ADD COLUMN IF NOT EXISTS context_audio_file_id  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS context_text           TEXT,
    ADD COLUMN IF NOT EXISTS question_audio_file_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS prep_time              VARCHAR(10),
    ADD COLUMN IF NOT EXISTS recording_time         VARCHAR(10),
    ADD COLUMN IF NOT EXISTS max_writing_length     SMALLINT;

  -- ai_evaluation_results: add cleaned_audio_url and new DTP metrics
  ALTER TABLE ai_evaluation_results
    ADD COLUMN IF NOT EXISTS cleaned_audio_url TEXT,
    ADD COLUMN IF NOT EXISTS cohesion_score VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cohesion_rationale TEXT,
    ADD COLUMN IF NOT EXISTS grammar_score VARCHAR(50),
    ADD COLUMN IF NOT EXISTS grammar_rationale TEXT,
    ADD COLUMN IF NOT EXISTS vocabulary_score VARCHAR(50),
    ADD COLUMN IF NOT EXISTS vocabulary_rationale TEXT,
    ADD COLUMN IF NOT EXISTS completeness_score VARCHAR(50),
    ADD COLUMN IF NOT EXISTS completeness_rationale TEXT,
    ADD COLUMN IF NOT EXISTS relevance_score VARCHAR(50),
    ADD COLUMN IF NOT EXISTS relevance_rationale TEXT,
    ADD COLUMN IF NOT EXISTS teacher_note TEXT;
`;

async function initDb() {
  try {
    console.log('🔄 Initializing database tables...');
    await db.query(createTablesQuery);
    await db.query(migrateTablesQuery);
    console.log('✅ Schema migrations applied.');
    
    // Seed default users if empty
    const usersCount = await db.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersCount.rows[0].count, 10) === 0) {
      console.log('🌱 Seeding default users (admin/admin123, user/user123, NhanND/IIG@2025)...');
      await db.query(
        `INSERT INTO users (username, password, role) VALUES 
         ('admin', 'admin123', 'admin'),
         ('user', 'user123', 'user'),
         ('NhanND', 'IIG@2025', 'admin')`
      );
    }
    
    console.log('✅ Database tables initialized successfully.');
  } catch (error) {
    console.error('❌ Error initializing database tables:', error);
    throw error;
  }
}

module.exports = initDb;
