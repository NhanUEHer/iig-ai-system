const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// The exam builder V3 contract is superseded by the Exam Management redesign
// (see tests/exam-management-redesign.test.js). Only the still-valid migration
// 081 foundation contract is asserted here; the redesign layers migration 107
// (sections, exam type, part content) on top of it without rewriting 081.
test('exam V3 migration 081 stores parent questions uniquely and keeps the immutable version table', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/081_exam_builder_v3.sql'), 'utf8');
  assert.match(sql, /uq_exam_parent_question/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS exam_versions/);
  assert.match(sql, /snapshot JSONB NOT NULL/);
  assert.match(sql, /DROP COLUMN IF EXISTS sub_question_id/);
});
