const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePeriodMatch, validateKpiCatalog } = require('../src/modules/reports/reportImportValidation');

test('report import rejects a workbook whose internal period differs from the selected period', () => {
  assert.throws(
    () => validatePeriodMatch({ year: 2026, month: 1 }, { year: 2026, month: 6 }),
    error => error.statusCode === 400 && error.code === 'REPORT_PERIOD_MISMATCH'
  );
  assert.doesNotThrow(() => validatePeriodMatch({ year: 2026, month: 6 }, { year: 2026, month: 6 }));
});

test('report import validates duplicate, unknown and cross-team KPI mappings', () => {
  const definitions = [{ code: 'DT_01', team_code: 'REV' }];
  assert.throws(() => validateKpiCatalog([
    { code: 'DT_01', teamCode: 'REV' }, { code: 'DT_01', teamCode: 'REV' }
  ], definitions), error => error.code === 'REPORT_KPI_DUPLICATE');
  assert.throws(() => validateKpiCatalog([{ code: 'UNKNOWN', teamCode: 'REV' }], definitions), error => error.code === 'REPORT_KPI_UNKNOWN');
  assert.throws(() => validateKpiCatalog([{ code: 'DT_01', teamCode: 'ADS' }], definitions), error => error.code === 'REPORT_KPI_TEAM_MISMATCH');
});
