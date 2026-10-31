const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseCookieFromCurl,
  rtaGroup,
  csvValue,
  groupRows,
} = require('../scripts/backfill-iig-rta-training');

test('curl parser reads the session cookie without requiring it in environment variables', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const file = path.join(os.tmpdir(), `iig-curl-${process.pid}.txt`);
  fs.writeFileSync(file, "curl --url 'https://example.test' \\\n  -b 'a=1; b=2' \\\n  --data-raw '{}'");
  try {
    assert.equal(parseCookieFromCurl(file), 'a=1; b=2');
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('RTA group is selected from the official Q1-Q2 range', () => {
  const group = rtaGroup({
    groupScorings: [
      { scoreScaleGroupName: 'Describe a picture', fromQuestion: 3, toQuestion: 4, toScore: 3 },
      { scoreScaleGroupName: 'Read text aloud', fromQuestion: 1, toQuestion: 2, toScore: 3, selectedScore: 2 },
    ],
  });
  assert.equal(group.selectedScore, 2);
});

test('CSV quoting preserves commas, quotes, and newlines', () => {
  assert.equal(csvValue('hello, "world"\nnext'), '"hello, ""world""\nnext"');
});

test('group rows require successful Q1 and Q2 and prefix all features', () => {
  const base = {
    status: 'SUCCESS',
    scoringId: 'scoring-1',
    keycode: 'ABC123',
    mockTestId: 'mock-1',
    passageHash: 'passage',
    teacherGroupScore: 2,
    labelSource: 'teacher',
    audio: { checksumSha256: 'audio' },
    mlFeatures: { values: new Proxy({}, { get: () => 1 }) },
  };
  const rows = groupRows([
    { ...base, questionNumber: 1 },
    { ...base, questionNumber: 2 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].teacher_group_score, 2);
  assert.equal(rows[0].q1_azure_accuracy, 1);
  assert.equal(rows[0].q2_azure_accuracy, 1);
});
