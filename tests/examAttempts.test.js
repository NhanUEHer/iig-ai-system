const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrations = path.join(__dirname, '..', 'src', 'database', 'migrations');
const read = name => fs.readFileSync(path.join(migrations, name), 'utf8');

// Candidate delivery is not mounted yet. These regression tests intentionally cover
// only the persistence foundation that the admin Exam Event module currently uses.
test('candidate exam persistence migration creates candidates, attempts and answers', () => {
  const source = read('073_candidate_exam_attempts.sql');
  assert.match(source, /CREATE TABLE IF NOT EXISTS exam_candidates/i);
  assert.match(source, /CREATE TABLE IF NOT EXISTS exam_attempts/i);
  assert.match(source, /CREATE TABLE IF NOT EXISTS exam_attempt_answers/i);
  assert.match(source, /question_snapshot/i);
  assert.match(source, /expires_at/i);
});

test('candidate lookup migration supports event contact and active-attempt lookup', () => {
  const source = read('074_candidate_lookup_indexes.sql');
  assert.match(source, /exam_event_id/i);
  assert.match(source, /email/i);
  assert.match(source, /phone/i);
  assert.match(source, /exam_attempts/i);
});

test('candidate table repair remains idempotent for existing environments', () => {
  const source = read('092_repair_candidate_exam_tables.sql');
  assert.match(source, /IF NOT EXISTS/i);
  assert.match(source, /exam_candidates/i);
  assert.match(source, /exam_attempts/i);
});

