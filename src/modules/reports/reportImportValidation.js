const HttpError = require('../../http/httpError');

function validatePeriodMatch(filePeriod, selectedPeriod) {
  if (filePeriod?.year !== selectedPeriod.year || filePeriod?.month !== selectedPeriod.month) {
    throw new HttpError(`Kỳ trong file (${filePeriod?.month}/${filePeriod?.year}) không khớp kỳ đã chọn (${selectedPeriod.month}/${selectedPeriod.year}).`, 400, 'REPORT_PERIOD_MISMATCH');
  }
}

function validateKpiCatalog(kpis, definitions) {
  const codes = kpis.map(kpi => kpi.code);
  const duplicateCodes = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicateCodes.length) throw new HttpError(`File có KPI bị trùng: ${[...new Set(duplicateCodes)].join(', ')}.`, 400, 'REPORT_KPI_DUPLICATE');

  const definitionMap = new Map(definitions.map(item => [item.code, item]));
  const unknownCodes = codes.filter(code => !definitionMap.has(code));
  if (unknownCodes.length) throw new HttpError(`KPI chưa có trong master data: ${unknownCodes.join(', ')}.`, 400, 'REPORT_KPI_UNKNOWN');

  const wrongTeams = kpis.filter(kpi => kpi.teamCode !== definitionMap.get(kpi.code)?.team_code);
  if (wrongTeams.length) throw new HttpError(`KPI không đúng bộ phận: ${wrongTeams.map(item => item.code).join(', ')}.`, 400, 'REPORT_KPI_TEAM_MISMATCH');
}

module.exports = { validatePeriodMatch, validateKpiCatalog };
