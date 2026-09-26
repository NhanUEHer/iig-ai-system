const assert = require('node:assert/strict');
const test = require('node:test');

const { describeRequestError } = require('../src/clients/dynamicDifyClient');
const { errorMessage } = require('../src/modules/scoring/bulkGradeService');

test('Dify errors retain structured response details', () => {
  const error = { response: { status: 400, data: { message: 'Workflow input is invalid' } } };
  assert.equal(describeRequestError(error), 'Workflow input is invalid');
  assert.equal(errorMessage(error), 'Workflow input is invalid');
});

test('bulk grading never persists a blank error message', () => {
  assert.equal(
    errorMessage({ response: { status: 503 }, message: '' }),
    'Yêu cầu chấm điểm thất bại (HTTP 503).'
  );
});
