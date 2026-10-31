const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(
  __dirname,
  '../src/database/migrations/121_iig_scoring_ingestion_foundation.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const transcriptionSql = fs.readFileSync(path.join(
  __dirname,
  '../src/database/migrations/122_iig_question_transcriptions.sql'
), 'utf8');

test('IIG ingestion migration creates the isolated canonical schema', () => {
  for (const table of [
    'iig_scoring_jobs',
    'iig_scoring_job_idempotency_keys',
    'iig_ingestion_outbox',
    'iig_exam_catalog',
    'iig_exam_versions',
    'iig_exam_sections',
    'iig_exam_score_groups',
    'iig_exam_questions',
    'iig_exam_question_score_groups',
    'iig_submissions',
    'iig_question_attempts',
    'iig_media_assets',
    'iig_source_snapshots',
    'iig_processing_events',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
  }
});

test('IIG exam versions and submissions preserve deduplication invariants', () => {
  assert.match(sql, /UNIQUE \(exam_id, structure_hash\)/i);
  assert.match(sql, /UNIQUE \(partner, source_scoring_id\)/i);
  assert.match(sql, /UNIQUE \(submission_id, exam_question_id\)/i);
  assert.match(sql, /UNIQUE \(source_key\)/i);
});

test('IIG canonical relationships cannot cross exam versions', () => {
  assert.match(sql, /FOREIGN KEY \(current_version_id, id\)/i);
  assert.match(sql, /FOREIGN KEY \(section_id, exam_version_id\)/i);
  assert.match(sql, /FOREIGN KEY \(question_id, exam_version_id\)/i);
  assert.match(sql, /FOREIGN KEY \(score_group_id, exam_version_id\)/i);
  assert.match(sql, /FOREIGN KEY \(submission_id, exam_version_id\)/i);
  assert.match(sql, /FOREIGN KEY \(exam_question_id, exam_version_id\)/i);
});

test('IIG media assets have one owner and durable objects are unique', () => {
  assert.match(sql, /CONSTRAINT chk_iig_media_assets_owner CHECK/i);
  assert.match(sql, /CASE WHEN exam_question_id IS NULL THEN 0 ELSE 1 END/i);
  assert.match(sql, /CASE WHEN question_attempt_id IS NULL THEN 0 ELSE 1 END/i);
  assert.match(sql, /uq_iig_media_assets_storage_key/i);
  assert.match(sql, /is_required BOOLEAN NOT NULL DEFAULT TRUE/i);
});

test('IIG accepted jobs use an outbox with deterministic deduplication', () => {
  assert.match(sql, /uq_iig_job_idempotency_partner_key UNIQUE \(partner, idempotency_key\)/i);
  assert.match(sql, /CONSTRAINT uq_iig_ingestion_outbox_dedup UNIQUE \(deduplication_key\)/i);
  assert.match(sql, /WHERE status IN \('PENDING', 'FAILED'\)/i);
  assert.match(sql, /'ACCEPTED'.*'FETCHING_SOURCE'.*'READY_FOR_AI'/s);
  assert.match(sql, /'DEAD_LETTER'/);
  assert.match(sql, /uq_iig_source_snapshots_payload/i);
});

test('IIG question transcripts are reusable exam-level records with durable workflow states', () => {
  assert.match(transcriptionSql, /CREATE TABLE IF NOT EXISTS iig_exam_question_transcriptions/i);
  assert.match(transcriptionSql, /UNIQUE \(exam_question_id, target_type\)/i);
  assert.match(transcriptionSql, /UNIQUE \(media_asset_id, target_type\)/i);
  assert.match(transcriptionSql, /REFERENCES iig_exam_questions\(id\)/i);
  assert.match(transcriptionSql, /'PENDING'.*'PROCESSING'.*'COMPLETED'.*'FAILED'.*'REVIEW'/s);
  assert.match(transcriptionSql, /'TRANSCRIBING'/);
  assert.match(transcriptionSql, /'PENDING_TRANSCRIPTION'/);
});
