const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { TEAM_ENTRY_CONFIG } = require('../src/modules/reports/manualReportConfig');
const { buildTemplate, parseTemplate, parseNumber, parseDate } = require('../src/modules/reports/manualReportWorkbook');

function workspace(teamCode) {
  const config = TEAM_ENTRY_CONFIG[teamCode];
  return {
    team_code: teamCode,
    team_name: teamCode,
    year: 2026,
    month: 8,
    config: {
      ...config,
      fields: config.fields.map(([key,label,type,lookup,required=false]) => ({key,label,type,lookup,required}))
    },
    kpis: [
      { code: `${teamCode}_01`, name: 'Chỉ số nhập tay', unit: 'Lượt', evaluation_direction: 'increase_good', input_mode: 'manual', target_value: '10.000000000', actual_value: '11.000000000', note: 'Đạt' },
      { code: `${teamCode}_02`, name: 'Chỉ số tự tính', unit: '%', evaluation_direction: 'monitor', input_mode: 'derived', target_value: null, actual_value: '0.500000000', note: null }
    ],
    details: [],
    adsProducts: [],
    note: { highlights: 'Nổi bật', issues: '', risks: '', proposals: 'Kế hoạch' }
  };
}

test('manual report templates contain exactly three sheets for every department', () => {
  for (const teamCode of Object.keys(TEAM_ENTRY_CONFIG)) {
    const buffer = buildTemplate(workspace(teamCode));
    const workbook = XLSX.read(buffer, { type: 'buffer', cellNF: true });
    assert.deepEqual(workbook.SheetNames, ['KPI','Chi tiết','Nhận xét']);
    const detailRows = XLSX.utils.sheet_to_json(workbook.Sheets['Chi tiết'], { header: 1, defval: null });
    const labels = detailRows.flat().filter(Boolean);
    for (const field of TEAM_ENTRY_CONFIG[teamCode].fields.filter(item => item[2] === 'computed')) {
      assert.equal(labels.includes(field[1]), false, `${teamCode} must omit computed field ${field[1]}`);
    }
    assert.equal(workbook.Sheets.KPI.E7.z, '#,##0.############################');
  }
});

test('manual report template round-trip preserves editable KPI and note data', () => {
  const current = workspace('REV');
  const parsed = parseTemplate(buildTemplate(current), current);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.kpis[0].target_value, '10.000000000');
  assert.equal(parsed.kpis[0].actual_value, '11.000000000');
  assert.equal(parsed.kpis[1].actual_value, '0.500000000');
  assert.equal(parsed.note.highlights, 'Nổi bật');
  assert.equal(parsed.summary.kpis, 2);
});

test('Ads template keeps both detail blocks inside the Chi tiết sheet', () => {
  const current = workspace('ADS');
  current.details = [{ traffic_source: 'Facebook', budget_target: 100, budget_actual: 90, lead_count: 12, order_count: 2, revenue: 500, note: '' }];
  current.adsProducts = [{ product_group: 'TOEIC LR', product_name: 'TOEIC Online', ad_cost: 90, revenue: 500, lead_count: 12, qualified_lead_count: 8, order_count: 2, note: '' }];
  const parsed = parseTemplate(buildTemplate(current), current);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.details.length, 1);
  assert.equal(parsed.details[0].traffic_source, 'Facebook');
  assert.equal(parsed.adsProducts.length, 1);
  assert.equal(parsed.adsProducts[0].product_name, 'TOEIC Online');
});

test('Ads template headers match both web entry forms', () => {
  const workbook = XLSX.read(buildTemplate(workspace('ADS')), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Chi tiết'], { header: 1, defval: null });
  assert.deepEqual(rows[5].filter(Boolean), ['Nguồn traffic','KH ngân sách','NS thực hiện','Lead / Data','Đơn hàng','Doanh thu','Xu hướng','Ghi chú']);
  const productHeader = rows.find(row => row?.[0] === 'Nhóm sản phẩm');
  assert.deepEqual(productHeader.filter(Boolean), ['Nhóm sản phẩm','Sản phẩm','Chi phí Ads','Doanh thu','Ghi chú']);
});

test('Ads import remains compatible with templates downloaded before the trend column', () => {
  const current = workspace('ADS');
  const workbook = XLSX.read(buildTemplate(current), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Chi tiết'], { header: 1, defval: null });
  rows[5].splice(6,1);
  for (let index=6;index<26;index++) rows[index].splice(6,1);
  workbook.Sheets['Chi tiết'] = XLSX.utils.aoa_to_sheet(rows);
  const parsed = parseTemplate(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), current);
  assert.deepEqual(parsed.errors, []);
  assert.ok(parsed.warnings.some(message => message.includes('phiên bản cũ')));
});

test('template number parser accepts Vietnamese and international formats', () => {
  assert.equal(parseNumber('4,711772500'), '4.711772500');
  assert.equal(parseNumber('1.234.567,89'), '1234567.89');
  assert.equal(parseNumber('1,234,567.89'), '1234567.89');
});

test('template number parser preserves imported decimal scale without rounding', () => {
  assert.equal(parseNumber('4,711772500'), '4.711772500');
  assert.equal(parseNumber('4.711774'), '4.711774');
  assert.equal(parseNumber('34'), '34');
});

test('template date parser normalizes Excel serials and API date strings', () => {
  assert.equal(parseDate(46203), '2026-06-30');
  assert.equal(parseDate('2026-06-30T00:00:00.000Z'), '2026-06-30');
  assert.equal(parseDate('Tue Jun 30 2026 00:00:00 GMT+0000 (Coordinated Universal Time)'), '2026-06-30');
});

test('product template import converts Excel dates to YYYY-MM-DD', () => {
  const current=workspace('PROD');
  current.details=[{product_group:'TOEIC LR',activity_name:'Pre TOEIC',actual_end_date:'2026-06-30'}];
  const parsed=parseTemplate(buildTemplate(current),current);
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.details[0].actual_end_date,'2026-06-30');
});

test('import rejects changed KPI metadata', () => {
  const current = workspace('REV');
  const workbook = XLSX.read(buildTemplate(current), { type: 'buffer' });
  workbook.Sheets.KPI.B7.v = 'Tên KPI đã sửa';
  const parsed = parseTemplate(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), current);
  assert.ok(parsed.errors.some(message => message.includes(current.kpis[0].code)));
});

test('import validates select values against report master data', () => {
  const current = workspace('REV');
  current.details = [{ product_group: 'Nhóm không tồn tại', product_name: 'Sản phẩm A' }];
  current.masterData = { product_group: [{ code: 'toeic_lr', label: 'TOEIC LR' }] };
  const parsed = parseTemplate(buildTemplate(current), current);
  assert.ok(parsed.errors.some(message => message.includes('không thuộc danh mục Nhóm sản phẩm')));
});

test('import restores comma-formatted integer counts misread by Excel locale', () => {
  const current = workspace('ADS');
  current.details = [{ traffic_source: 'Facebook', lead_count: 6786, order_count: 777 }];
  const workbook = XLSX.read(buildTemplate(current), { type: 'buffer' });
  workbook.Sheets['Chi tiết'].D7.v = 6.786;
  workbook.Sheets['Chi tiết'].D7.t = 'n';
  const parsed = parseTemplate(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), current);
  assert.equal(parsed.details[0].lead_count, '6786');
  assert.equal(parsed.details[0].order_count, '777');
});
