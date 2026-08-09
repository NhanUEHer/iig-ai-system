const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { parseWorkbook, REQUIRED_SHEETS } = require('../src/modules/reports/reportWorkbookParser');

function buildWorkbook() {
  const workbook = XLSX.utils.book_new();
  for (const name of REQUIRED_SHEETS) {
    const data = Array.from({ length: 60 }, () => Array(16).fill(null));
    if (name === '01_Tong_hop') { data[4][1] = 7; data[4][3] = 2026; }
    if (name === '98_DATA_EXPORT') {
      data[3] = ['Năm','Tháng','Kỳ báo cáo','Team','Mã KPI','Chỉ số','Đơn vị','Chiều đánh giá','Kế hoạch','Thực hiện','% HT KH','Tháng trước','% vs TTr','Cùng kỳ','% vs CK','Đánh giá'];
      data[4] = [2026,7,'07/2026','Doanh thu','DT_01','Doanh thu thực hiện tháng','Tỷ đồng','Tăng tốt',100,95,.95,80,.1875,90,.0556,'Chưa đạt'];
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('report workbook parser reads the KPI import contract and selected period', () => {
  const parsed = parseWorkbook(buildWorkbook(), 2026, 7);
  assert.deepEqual(parsed.filePeriod, { year: 2026, month: 7 });
  assert.equal(parsed.kpis.length, 1);
  assert.deepEqual(parsed.kpis[0], {
    code: 'DT_01', teamCode: 'REV', target: 100, actual: 95,
    previous: 80, priorYear: 90, evaluation: 'Chưa đạt', note: null
  });
  assert.equal(parsed.warnings.length, 0);
});

test('report workbook parser rejects templates missing required sheets', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['invalid']]), 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  assert.throws(() => parseWorkbook(buffer, 2026, 7), error => error.code === 'REPORT_TEMPLATE_INVALID');
});
