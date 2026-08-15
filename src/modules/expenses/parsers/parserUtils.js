const crypto = require('crypto');

function decimal(value) {
  if (value === null || value === undefined || value === '') return '0.00';
  const cleaned = String(value).replace(/VND/gi, '').replace(/\s/g, '').replace(/,/g, '');
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return '0.00';
  return Math.abs(number).toFixed(2);
}
function isoDate(value) {
  const text = String(value || '');
  const alreadyIso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (alreadyIso) {
    const date = new Date(`${text}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
  }
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;
  let year = Number(match[3]); if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
  if (date.getUTCDate() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1) return null;
  return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}
function normalizeDescription(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toUpperCase(); }
function transaction(data) {
  const debit = decimal(data.debitAmount), credit = decimal(data.creditAmount), fee = decimal(data.feeAmount);
  return { transactionDate: isoDate(data.transactionDate), postingDate: isoDate(data.postingDate), description: String(data.description || '').trim(),
    normalizedDescription: normalizeDescription(data.description), originalAmount: decimal(data.originalAmount || Math.max(Number(debit), Number(credit))),
    originalCurrency: data.originalCurrency || 'VND', debitAmount: debit, creditAmount: credit, feeAmount: fee,
    referenceNumber: data.referenceNumber || null, sourcePage: data.sourcePage || null, sourceRow: data.sourceRow || null,
    warnings: data.warnings || [], rawData: data.rawData || {} };
}
function buildResult(bankCode, version, statement, transactions, warnings = []) {
  const sum = key => transactions.reduce((total, row) => total + Number(row[key] || 0), 0).toFixed(2);
  const parsedTotalDebit = sum('debitAmount'), parsedTotalCredit = sum('creditAmount');
  const debitDifference = statement.totalDebit == null ? null : (Number(parsedTotalDebit) - Number(statement.totalDebit)).toFixed(2);
  const creditDifference = statement.totalCredit == null ? null : (Number(parsedTotalCredit) - Number(statement.totalCredit)).toFixed(2);
  return { parser: { bankCode, version }, statement, transactions, reconciliation: { parsedTotalDebit, parsedTotalCredit, debitDifference,
    creditDifference, isBalanced: debitDifference !== null && creditDifference !== null && Number(debitDifference) === 0 && Number(creditDifference) === 0 }, warnings };
}
function fingerprint(accountId, row) { return crypto.createHash('sha256').update([accountId,row.transactionDate,row.postingDate,row.debitAmount,row.creditAmount,row.normalizedDescription,row.referenceNumber||''].join('|')).digest('hex'); }
module.exports = { decimal, isoDate, normalizeDescription, transaction, buildResult, fingerprint };
