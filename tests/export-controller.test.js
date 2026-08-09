const assert = require('node:assert/strict');
const test = require('node:test');

const { buildRows } = require('../src/controllers/exportController');

test('export rows map Speaking and Writing scores to Q1-Q19', () => {
  const rows = buildRows([
    {
      sub_id: 'submission-1', keycode: 'ABC123', test_name: 'Mock Test',
      status: 3, submitted_date: null, synced_at: null,
      section: 'Speaking', question_no: 1, final_score: '4.4'
    },
    {
      sub_id: 'submission-1', keycode: 'ABC123', test_name: 'Mock Test',
      status: 3, submitted_date: null, synced_at: null,
      section: 'Writing', question_no: 8, final_score: '5'
    }
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'ABC123');
  assert.equal(rows[1][4], 'Đã chấm');
  assert.equal(rows[1][5], 4);
  assert.equal(rows[1][23], 5);
});
