const assert = require('node:assert/strict');
const test = require('node:test');

const { SubmissionRepository } = require('../src/modules/submissions/submissionRepository');
const { EvaluationRepository } = require('../src/modules/scoring/evaluationRepository');
const { MappingRepository } = require('../src/modules/mappings/mappingRepository');
const { ExportRepository } = require('../src/modules/exports/exportRepository');

function createDatabase(rows = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows };
    }
  };
}

test('SubmissionRepository returns one answer and updates status with parameters', async () => {
  const answer = { id: 'answer-1', submission_id: 'submission-1' };
  const database = createDatabase([answer]);
  const repository = new SubmissionRepository(database);

  assert.equal(await repository.findAnswerById('answer-1'), answer);
  await repository.updateAnswerStatus('answer-1', 'scoring');

  assert.deepEqual(database.calls[0].params, ['answer-1']);
  assert.deepEqual(database.calls[1].params, ['scoring', 'answer-1']);
  assert.match(database.calls[1].sql, /UPDATE submission_answers/);
});

test('SubmissionRepository acquires scoring ownership atomically', async () => {
  const queries = [];
  const repository = new SubmissionRepository({
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rowCount: 1 };
    }
  });
  assert.equal(await repository.tryStartScoring('answer-1'), true);
  assert.match(queries[0].sql, /IS DISTINCT FROM 'scoring'/);
  assert.deepEqual(queries[0].params, ['answer-1']);
});

test('EvaluationRepository performs teacher-note upsert in one query', async () => {
  const database = createDatabase();
  const repository = new EvaluationRepository(database);

  await repository.upsertTeacherNote('answer-2', 'Cần cải thiện phát âm');

  assert.equal(database.calls.length, 1);
  assert.deepEqual(database.calls[0].params, ['answer-2', 'Cần cải thiện phát âm']);
  assert.match(database.calls[0].sql, /ON CONFLICT \(answer_id\) DO UPDATE/);
});

test('EvaluationRepository maps full evaluation fields in stable order', async () => {
  const database = createDatabase();
  const repository = new EvaluationRepository(database);

  await repository.upsertEvaluation({
    answerId: 'answer-3',
    requestSentAt: 'sent-at',
    responseReceivedAt: 'received-at',
    transcribe: 'hello',
    finalScore: 4,
    errors: '[]'
  });

  const { sql, params } = database.calls[0];
  assert.equal(params.length, 26);
  assert.deepEqual(params.slice(0, 5), ['answer-3', 'sent-at', 'received-at', 'hello', 4]);
  assert.equal(params[19], '[]');
  assert.match(sql, /transcribe = COALESCE/);
});

test('SubmissionRepository builds parameterized list filters', async () => {
  const database = createDatabase([]);
  const repository = new SubmissionRepository(database);

  await repository.list({ keycode: 'ABC', studentName: 'Nguyen', status: '2' });

  assert.deepEqual(database.calls[0].params, ['%ABC%', '%Nguyen%', 2]);
  assert.match(database.calls[0].sql, /keycode ILIKE \$1/);
  assert.match(database.calls[0].sql, /student_name ILIKE \$2/);
  assert.match(database.calls[0].sql, /status = \$3/);
});

test('SubmissionRepository paginates combined search and returns answer counters', async () => {
  const calls = [];
  const repository = new SubmissionRepository({
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('COUNT(*)::int')) return { rows: [{ total: 23 }] };
      return { rows: [{ id: 'submission-1', answer_count: 19, scored_count: 10 }] };
    }
  });
  const result = await repository.listPage({ search: 'QETUVZ', status: '2', section: 'Speaking', page: 2, limit: 10 });
  assert.equal(result.meta.total, 23);
  assert.equal(result.meta.totalPages, 3);
  assert.match(calls[1].sql, /COUNT\(sa\.id\).*answer_count/s);
  assert.match(calls[1].sql, /LIMIT \$4 OFFSET \$5/);
  assert.deepEqual(calls[1].params, ['%QETUVZ%', 2, 'Speaking', 10, 10]);
});

test('SubmissionRepository scopes answer detail to its submission', async () => {
  const database = { query: async (sql, params) => ({ rows: [{ id: 'answer-1' }], sql, params }) };
  const repository = new SubmissionRepository(database);
  const answer = await repository.findAnswerDetail('submission-1', 'answer-1');
  assert.equal(answer.id, 'answer-1');
});

test('MappingRepository upserts mapping and propagates display fields', async () => {
  const database = createDatabase([{ keycode: 'ABC123' }]);
  const repository = new MappingRepository(database);

  await repository.upsert({
    keycode: 'ABC123',
    courseScoringId: 'course-1',
    studentName: 'Student',
    testName: 'Test'
  });

  assert.equal(database.calls.length, 2);
  assert.deepEqual(database.calls[0].params, ['ABC123', 'course-1', 'Student', 'Test']);
  assert.match(database.calls[0].sql, /ON CONFLICT \(keycode\) DO UPDATE/);
  assert.match(database.calls[1].sql, /UPDATE mocktest_submissions/);
});

test('ExportRepository scopes score export to selected submissions', async () => {
  const database = createDatabase([]);
  const repository = new ExportRepository(database);

  await repository.findSubmissionScores(['submission-1', 'submission-2']);

  assert.deepEqual(database.calls[0].params, [['submission-1', 'submission-2']]);
  assert.match(database.calls[0].sql, /WHERE s.id = ANY\(\$1\)/);
});
