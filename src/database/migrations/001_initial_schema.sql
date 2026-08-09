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
  student_name VARCHAR(255),
  test_name VARCHAR(255),
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
  overall_score VARCHAR(100),
  scored_date TIMESTAMP,
  submitted_date TIMESTAMP NOT NULL,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submission_answers (
  id VARCHAR(100) PRIMARY KEY,
  submission_id VARCHAR(36) NOT NULL REFERENCES mocktest_submissions(id) ON DELETE CASCADE,
  section VARCHAR(10) NOT NULL,
  question_no INT NOT NULL,
  choose_id VARCHAR(36) NOT NULL,
  questionnaire_type SMALLINT,
  question_title VARCHAR(255),
  question_name TEXT,
  prompt_text TEXT NOT NULL,
  image_url TEXT,
  keywords VARCHAR(255),
  context_audio_file_id VARCHAR(100),
  context_text TEXT,
  question_audio_file_id VARCHAR(100),
  prep_time VARCHAR(10),
  recording_time VARCHAR(10),
  max_writing_length SMALLINT,
  student_writing TEXT,
  student_audio_file_id VARCHAR(100),
  student_audio_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT idx_submission_q UNIQUE (submission_id, section, question_no)
);

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
  api_type VARCHAR(50) NOT NULL,
  stt_target VARCHAR(50) NOT NULL DEFAULT 'student_answer',
  target_questions JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_evaluation_results (
  id SERIAL PRIMARY KEY,
  answer_id VARCHAR(100) NOT NULL REFERENCES submission_answers(id) ON DELETE CASCADE,
  request_sent_at TIMESTAMP,
  response_received_at TIMESTAMP,
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
  cleaned_audio_url TEXT,
  teacher_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_answer_ai_eval UNIQUE (answer_id)
);

