const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sql = fs.readFileSync(path.join(
  __dirname,
  '../src/database/migrations/123_iig_ai_scoring_foundation.sql'
), 'utf8');
const evidenceStagesSql = fs.readFileSync(path.join(
  __dirname,
  '../src/database/migrations/124_iig_ai_evidence_execution_stages.sql'
), 'utf8');
const speakingCompletionSql = fs.readFileSync(path.join(
  __dirname,
  '../src/database/migrations/125_iig_speaking_completion.sql'
), 'utf8');

test('IIG AI scoring migration is isolated from legacy grading tables', () => {
  for (const table of [
    'iig_ai_scoring_runs',
    'iig_ai_answer_transcriptions',
    'iig_ai_feature_sets',
    'iig_ai_question_runs',
    'iig_ai_group_results',
    'iig_ai_model_executions',
    'iig_ai_scoring_outbox',
    'iig_ai_scoring_events',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
  }
  assert.doesNotMatch(sql, /ALTER TABLE\s+(grading_jobs|ai_evaluation_results)/i);
});

test('IIG AI scoring runs are versioned and idempotent', () => {
  assert.match(sql, /UNIQUE \(submission_id, run_number\)/i);
  assert.match(sql, /UNIQUE \(request_key\)/i);
  assert.match(sql, /scoring_policy_version VARCHAR\(80\) NOT NULL/i);
  assert.match(sql, /input_fingerprint CHAR\(64\) NOT NULL/i);
  assert.match(sql, /'PRODUCTION'.*'RETRY'.*'RESCORE'.*'SHADOW'.*'BACKFILL'/s);
});

test('question and group outputs cannot duplicate within one scoring run', () => {
  assert.match(sql, /UNIQUE \(scoring_run_id, question_attempt_id\)/i);
  assert.match(sql, /UNIQUE \(scoring_run_id, score_group_id\)/i);
  assert.match(sql, /llm_group_score NUMERIC/i);
  assert.match(sql, /ml_suggested_score NUMERIC/i);
  assert.match(sql, /final_score NUMERIC/i);
});

test('model executions retain usage, cost and model lineage', () => {
  assert.match(sql, /input_tokens INTEGER NOT NULL DEFAULT 0/i);
  assert.match(sql, /output_tokens INTEGER NOT NULL DEFAULT 0/i);
  assert.match(sql, /estimated_cost_usd NUMERIC/i);
  assert.match(sql, /model_version VARCHAR\(120\)/i);
  assert.match(sql, /prompt_version VARCHAR\(80\)/i);
  assert.match(sql, /request_hash CHAR\(64\) NOT NULL/i);
});

test('evidence provider executions have dedicated lineage stages', () => {
  assert.match(evidenceStagesSql, /'SPEECH_EVIDENCE'/i);
  assert.match(evidenceStagesSql, /'TASK_EVIDENCE'/i);
  assert.match(evidenceStagesSql, /DROP CONSTRAINT IF EXISTS chk_iig_ai_model_executions_stage/i);
});

test('scoring dispatch uses a dedicated durable outbox', () => {
  assert.match(sql, /CONSTRAINT uq_iig_ai_scoring_outbox_dedup UNIQUE \(deduplication_key\)/i);
  assert.match(sql, /WHERE status IN \('PENDING', 'FAILED'\)/i);
  assert.match(sql, /'DEAD_LETTER'/i);
});

test('Speaking completion is tracked independently from ingestion readiness', () => {
  assert.match(speakingCompletionSql, /ai_scoring_status VARCHAR\(32\)/i);
  assert.match(speakingCompletionSql, /ai_scoring_started_at TIMESTAMPTZ/i);
  assert.match(speakingCompletionSql, /ai_scoring_completed_at TIMESTAMPTZ/i);
  assert.match(speakingCompletionSql, /'PENDING'.*'PROCESSING'.*'COMPLETED'/s);
});
