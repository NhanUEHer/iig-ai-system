const XLSX = require('xlsx');
const HttpError = require('../../http/httpError');

const REQUIRED_SHEETS = ['01_Tong_hop','98_DATA_EXPORT','02_Doanh_thu','03_MKT_Ads','04_Truyen_thong','05_Trade','06_Dao_tao','07_San_pham'];
const TEAM_CODES = { 'DOANH THU': 'REV', 'MARKETING ADS': 'ADS', 'TRUYEN THONG': 'COM', TRADE: 'TRADE', 'DAO TAO': 'TRAIN', 'SAN PHAM': 'PROD' };
const NOTE_SPECS = [
  ['02_Doanh_thu','REV',[32,34,36,38]], ['03_MKT_Ads','ADS',[46,48,50,52]],
  ['04_Truyen_thong','COM',[33,35,37,39]], ['05_Trade','TRADE',[45,47,49,51]],
  ['06_Dao_tao','TRAIN',[29,31,33,35]], ['07_San_pham','PROD',[43,45,47,49]]
];

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g,'d').replace(/Đ/g,'D').trim().toUpperCase();
const slug = value => normalize(value).replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,100) || 'UNKNOWN';
const value = (sheet, address) => sheet?.[address]?.v ?? null;
const rows = (sheet, start, count, width) => Array.from({ length: count }, (_, offset) =>
  Array.from({ length: width }, (_, column) => value(sheet, XLSX.utils.encode_cell({ r: start - 1 + offset, c: column }))));
const numberOrNull = input => input === '' || input === null || input === undefined || !Number.isFinite(Number(input)) ? null : Number(input);
const textOrNull = input => input === '' || input === null || input === undefined ? null : String(input).trim();
const dateOrNull = input => {
  if (input instanceof Date && !Number.isNaN(input.getTime())) return input.toISOString().slice(0,10);
  return null;
};
const mergedText = (sheet, row) => rows(sheet, row, 1, 12)[0].slice(1).map(textOrNull).filter(Boolean).join(' ').trim();

function mapAdsCategory(name) {
  const n = normalize(name);
  if (n.includes('TOEIC')) return ['TOEIC','TOEIC'];
  if (n.includes('TOEFL PRI') || n.includes('TOEFL JUN') || n.includes('PRIMARY') || n.includes('JUNIOR')) return ['TOEFL_PRI_JUN','TOEFL Pri, Jun'];
  if (n.includes('TOEFL')) return ['TOEFL_IBT','TOEFL iBT'];
  if (n.includes('GIAO TIEP')) return ['GIAO_TIEP','Giao tiếp'];
  if (n.includes('TIN HOC') || n.includes('MOS') || n.includes('IC3')) return ['TIN_HOC','Tin học'];
  return ['KHAC','Khác'];
}

function parseWorkbook(buffer, selectedYear, selectedMonth, options = {}) {
  let workbook;
  try { workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellFormula: true }); }
  catch (error) { throw new HttpError('Không thể đọc file Excel.', 400, 'REPORT_FILE_INVALID'); }
  const requiredSheets = Array.isArray(options.requiredSheets) && options.requiredSheets.length ? options.requiredSheets : REQUIRED_SHEETS;
  const missingSheets = requiredSheets.filter(name => !workbook.Sheets[name]);
  if (missingSheets.length) throw new HttpError(`File thiếu sheet bắt buộc: ${missingSheets.join(', ')}.`, 400, 'REPORT_TEMPLATE_INVALID');

  const summary = workbook.Sheets['01_Tong_hop'];
  const exportSheet = workbook.Sheets['98_DATA_EXPORT'];
  const summaryMonth = numberOrNull(value(summary, 'B5') ?? value(summary, 'B4'));
  const summaryYear = numberOrNull(value(summary, 'D5') ?? value(summary, 'D4'));
  const allExportRows = rows(exportSheet, 5, 300, 16).filter(row => textOrNull(row[4]));
  if (!allExportRows.length) throw new HttpError('Không tìm thấy KPI trong 98_DATA_EXPORT.', 400, 'REPORT_KPI_EMPTY');
  const exportRows = allExportRows.filter(row => Number(row[0])===Number(selectedYear) && Number(row[1])===Number(selectedMonth));
  if (!exportRows.length) throw new HttpError(`Không tìm thấy KPI kỳ ${selectedMonth}/${selectedYear} trong 98_DATA_EXPORT.`,400,'REPORT_KPI_PERIOD_EMPTY');
  const fileYear = summaryYear || numberOrNull(exportRows[0][0]);
  const fileMonth = summaryMonth || numberOrNull(exportRows[0][1]);
  if (!Number.isInteger(fileYear) || !Number.isInteger(fileMonth) || fileMonth < 1 || fileMonth > 12) {
    throw new HttpError('Không xác định được tháng/năm trong file.', 400, 'REPORT_FILE_PERIOD_MISSING');
  }
  const warnings = [];
  if (fileYear && fileYear !== selectedYear) warnings.push(`Năm trong file là ${fileYear}, khác năm đã chọn ${selectedYear}.`);
  if (fileMonth && fileMonth !== selectedMonth) warnings.push(`Tháng trong file là ${fileMonth}, khác tháng đã chọn ${selectedMonth}. Dữ liệu sẽ lưu theo kỳ đã chọn.`);
  if (summaryYear && fileYear && summaryYear !== fileYear) warnings.push('Kỳ tại 01_Tong_hop không khớp 98_DATA_EXPORT.');
  if (summaryMonth && fileMonth && summaryMonth !== fileMonth) warnings.push('Tháng tại 01_Tong_hop không khớp 98_DATA_EXPORT.');

  const kpis = exportRows.map(row => ({
    code: String(row[4]).trim(), teamCode: TEAM_CODES[normalize(row[3])] || null,
    target: numberOrNull(row[8]), actual: numberOrNull(row[9]), previous: numberOrNull(row[11]), priorYear: numberOrNull(row[13]),
    evaluation: textOrNull(row[15]), note: null
  }));
  const missingActuals = kpis.filter(item => item.actual === null).map(item => item.code);
  if (missingActuals.length) warnings.push(`${missingActuals.length} KPI chưa có giá trị thực hiện.`);

  const revenue = rows(workbook.Sheets['02_Doanh_thu'],17,12,12).filter(r => r[1] && normalize(r[0]) !== 'TONG').map(r => ({
    rowKey:`SP_${slug(r[1])}`,productGroup:textOrNull(r[0]),productCode:`SP_${slug(r[1])}`,productName:String(r[1]),orderCount:numberOrNull(r[2]),revenue:numberOrNull(r[3]),monthlyTarget:numberOrNull(r[5]),previousRevenue:numberOrNull(r[7]),priorYearRevenue:numberOrNull(r[9]),note:textOrNull(r[11])
  }));
  const adsChannels = rows(workbook.Sheets['03_MKT_Ads'],18,10,12).filter(r => r[0] && normalize(r[0]) !== 'TONG').map(r => ({
    rowKey:`CH_${slug(r[0])}`,channelCode:`CH_${slug(r[0])}`,trafficSource:String(r[0]),budgetTarget:numberOrNull(r[1]),budgetActual:numberOrNull(r[2]),leadCount:numberOrNull(r[4]),orderCount:numberOrNull(r[5]),revenue:numberOrNull(r[6]),previousRevenue:null,note:textOrNull(r[11])
  }));
  const adMap = new Map(['TOEIC','TOEFL_PRI_JUN','TOEFL_IBT','GIAO_TIEP','TIN_HOC','KHAC'].map(code => [code,{ rowKey:code,productGroup:code,productCode:code,productName:code,adCost:0,revenue:0,leadCount:null,qualifiedLeadCount:null,orderCount:null,note:null }]));
  rows(workbook.Sheets['03_MKT_Ads'],32,20,6).filter(r => r[1] && normalize(r[0]) !== 'TONG').forEach(r => {
    const [code,name] = mapAdsCategory(r[1]); const item=adMap.get(code); item.productName=name; item.adCost += numberOrNull(r[2]) || 0; item.revenue += numberOrNull(r[4]) || 0;
  });
  const adsProducts = [...adMap.values()];
  const social = rows(workbook.Sheets['04_Truyen_thong'],20,10,12).filter(r => r[0] && normalize(r[0]) !== 'TONG / TB').map(r => ({
    rowKey:`SOC_${slug(r[0])}`,channelCode:`SOC_${slug(r[0])}`,channelName:String(r[0]),followersCurrent:numberOrNull(r[1]),followersPrevious:numberOrNull(r[2]),reachCurrent:numberOrNull(r[4]),reachPrevious:numberOrNull(r[5]),organicReach:null,videoViews:numberOrNull(r[7]),engagementCount:null,engagementRate:numberOrNull(r[8]),leadCount:numberOrNull(r[9]),orderCount:null,revenue:numberOrNull(r[10]),budget:null,note:textOrNull(r[11])
  }));
  const trade = rows(workbook.Sheets['05_Trade'],22,20,12).filter(r => textOrNull(r[1])).map(r => ({
    rowKey:`ORG_${slug(r[1])}`,organizationCode:`ORG_${slug(r[1])}`,organizationName:String(r[1]),organizationType:textOrNull(r[2]),region:textOrNull(r[3]),activityType:null,activityDateText:textOrNull(r[4]),activityDays:numberOrNull(r[5]),workshopCount:numberOrNull(r[6]),socialPostCount:null,reach:numberOrNull(r[7]),leadCount:numberOrNull(r[8]),orderCount:null,budget:numberOrNull(r[9]),revenue:numberOrNull(r[10]),isNewContract:null,note:textOrNull(r[11])
  }));
  const training = rows(workbook.Sheets['06_Dao_tao'],20,6,12).filter(r => r[0] && normalize(r[0]) !== 'TONG / TB').map(r => ({
    rowKey:`COURSE_${slug(r[0])}`,courseCode:`COURSE_${slug(r[0])}`,courseName:String(r[0]),classCount:numberOrNull(r[1]),activeStudentCount:numberOrNull(r[2]),studentTarget:numberOrNull(r[3]),newStudentCount:numberOrNull(r[5]),completedStudentCount:numberOrNull(r[6]),qualifiedStudentCount:null,outputRate:numberOrNull(r[8]),teacherCount:numberOrNull(r[7]),startedClassCount:null,completedClassCount:null,upsellRevenue:numberOrNull(r[9]),upsellRevenueTarget:null,status:textOrNull(r[10]),note:textOrNull(r[11])
  }));
  const products = rows(workbook.Sheets['07_San_pham'],16,25,12).filter(r => textOrNull(r[2])).map(r => ({
    rowKey:`ACT_${slug(r[2])}`,productGroup:textOrNull(r[1]),activityCode:`ACT_${slug(r[2])}`,activityName:String(r[2]),activityType:textOrNull(r[3]),ownerUnit:textOrNull(r[4]),cooperatingUnit:textOrNull(r[5]),plannedStartDate:null,plannedEndDate:null,actualStartDate:null,actualEndDate:dateOrNull(r[9]),targetQuantity:null,actualQuantity:null,progressStatus:textOrNull(r[8]),outputUrl:textOrNull(r[10]),implementationResult:textOrNull(r[7]),evaluationResult:null,nextAction:textOrNull(r[6]),note:textOrNull(r[11])
  }));
  const notes = NOTE_SPECS.map(([sheetName,teamCode,positions]) => {
    const sheet=workbook.Sheets[sheetName]; const [highlights,issues,risks,proposals]=positions.map(row => mergedText(sheet,row));
    return { teamCode,executiveSummary:[highlights,issues,risks,proposals].filter(Boolean).join('\n'),highlights,issues,risks,proposals,nextMonthPlan:null,approvalStatus:textOrNull(value(sheet,'H4')) };
  });
  const teamStatuses = NOTE_SPECS.map(([sheetName,teamCode]) => ({
    teamCode,
    status: textOrNull(value(workbook.Sheets[sheetName], 'H4')) || 'Chưa cập nhật'
  }));
  return { filePeriod:{ year:fileYear,month:fileMonth }, selectedPeriod:{ year:selectedYear,month:selectedMonth }, warnings, missingActuals,
    kpis, details:{ revenue,adsChannels,adsProducts,social,trade,training,products }, notes, teamStatuses };
}

module.exports = { parseWorkbook, REQUIRED_SHEETS };
