const test = require('node:test');
const assert = require('node:assert/strict');
const { numericOrNull, healthScore, actualTargetRatio, healthStatus } = require('../src/modules/reports/reportHealth');

test('report health preserves missing values instead of coercing them to zero', () => {
  assert.equal(numericOrNull(null), null);
  assert.equal(healthScore({ target_value: 100, actual_value: null, evaluation_direction: 'increase_good' }), null);
  assert.equal(healthStatus(null), 'missing');
});

test('report health supports explicit increase and decrease directions', () => {
  assert.equal(healthScore({ target_value: 100, actual_value: 90, evaluation_direction: 'increase_good' }), 0.9);
  assert.equal(healthScore({ target_value: 100, actual_value: 80, evaluation_direction: 'decrease_good' }), 1.25);
  assert.equal(healthStatus(0.9), 'near');
  assert.equal(healthStatus(1), 'good');
});

test('monitor KPIs are excluded from aggregate health', () => {
  assert.equal(healthScore({ target_value: 100, actual_value: 90, evaluation_direction: 'monitor' }), null);
  assert.equal(actualTargetRatio({ target_value: 100, actual_value: 90 }), 0.9);
  assert.equal(actualTargetRatio({ target_value: 0, actual_value: 90 }), null);
});

test('zero targets do not create a false perfect score', () => {
  assert.equal(healthScore({ target_value: 0, actual_value: 0, evaluation_direction: 'increase_good' }), null);
  assert.equal(healthScore({ target_value: 0, actual_value: 1, evaluation_direction: 'increase_good' }), 1.2);
});
