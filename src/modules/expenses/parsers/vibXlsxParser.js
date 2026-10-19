const officeCrypto = require('officecrypto-tool');
const XLSX = require('xlsx');
const { decimal, isoDate, transaction, buildResult } = require('./parserUtils');

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function cell(rows, label) {
  const expected = normalize(label);
  const row = rows.find(item => normalize(item?.[0]).includes(expected));
  return row?.[2];
}

function amount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.abs(number) : 0;
}

function nullableDecimal(value) {
  return value === null || value === undefined || value === '' ? null : decimal(value);
}

function transactionType(description, debit, credit) {
  const text = normalize(description);
  if (debit > 0 && (text.startsWith('PHI ') || text === 'PHI' || text.includes(' FEE'))) return 'fee';
  if (credit > 0 && (text.includes('THANH TOAN SAO KE') || text.includes('PAYMENT'))) return 'payment';
  if (credit > 0) return 'refund';
  return 'purchase';
}

function mccData(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})(?:\s*-\s*(.*))?$/);
  return { text, code: match?.[1] || null, description: match?.[2]?.trim() || null };
}

function referenceNumber(description) {
  const token = String(description || '').match(/\*([A-Z0-9]{6,})/i);
  return token?.[1] || null;
}

function linkTransactionFees(rows) {
  const purchases = rows.filter(row => row.rawData.transactionType === 'purchase');
  for (const fee of rows.filter(row => row.rawData.transactionType === 'fee')) {
    const candidates = purchases.filter(row => row.transactionDate === fee.transactionDate
      && row.postingDate === fee.postingDate
      && row.rawData.mccCode === fee.rawData.mccCode);
    if (!candidates.length) continue;
    const feeAmount = Number(fee.feeAmount);
    const scored = candidates.map(row => {
      const purchaseAmount = Number(row.debitAmount);
      const ratio = purchaseAmount ? feeAmount / purchaseAmount : Number.POSITIVE_INFINITY;
      const rateDistance = Math.min(Math.abs(ratio - 0.011), Math.abs(ratio - 0.04));
      return { row, rateDistance, rowDistance: Math.abs(Number(row.sourceRow) - Number(fee.sourceRow)) };
    }).sort((a, b) => a.rateDistance - b.rateDistance || a.rowDistance - b.rowDistance);
    if (scored[0].rateDistance <= 0.003) {
      fee.rawData.parentSourcePage = scored[0].row.sourcePage;
      fee.rawData.parentSourceRow = scored[0].row.sourceRow;
    }
  }
}

module.exports = {
  version: '2.0.0',
  async parse(buffer, password) {
    let plain = buffer;
    try {
      if (officeCrypto.isEncrypted(buffer)) {
        if (!password) throw Object.assign(new Error('File VIB yêu cầu mật khẩu.'), { code: 'STATEMENT_PASSWORD_REQUIRED' });
        plain = await officeCrypto.decrypt(buffer, { password });
      }
    } catch (error) {
      if (error.code) throw error;
      throw Object.assign(new Error('Mật khẩu file VIB không đúng hoặc file bị lỗi.'), { code: 'STATEMENT_PASSWORD_INVALID' });
    }

    let workbook;
    try {
      workbook = XLSX.read(plain, { type: 'buffer', cellDates: false, raw: true });
    } catch {
      throw Object.assign(new Error('Không thể đọc nội dung Excel của sao kê VIB.'), { code: 'STATEMENT_TEMPLATE_UNSUPPORTED' });
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (!normalize(rows[0]?.[0]).includes('SAO KE GIAO DICH THE TIN DUNG VIB')) {
      throw Object.assign(new Error('File không đúng mẫu sao kê VIB được hỗ trợ.'), { code: 'STATEMENT_TEMPLATE_UNSUPPORTED' });
    }

    const header = rows.findIndex(row => normalize(row?.[0]).includes('NGAY GIAO DICH'));
    if (header < 0) throw Object.assign(new Error('Không tìm thấy bảng giao dịch trong sao kê VIB.'), { code: 'STATEMENT_TEMPLATE_UNSUPPORTED' });

    const transactions = [];
    let sourceAccountNumber = null;
    for (let index = header + 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (normalize(row?.[0]).includes('SO THE/ SO TAI KHOAN')) {
        sourceAccountNumber = String(row?.[2] || '').trim() || null;
        continue;
      }
      const transactionDate = isoDate(row?.[0]);
      const postingDate = isoDate(row?.[1]);
      const debit = amount(row?.[4]);
      const credit = amount(row?.[5]);
      if (!transactionDate || !postingDate || (!debit && !credit)) continue;
      const description = String(row?.[2] || '').trim();
      const type = transactionType(description, debit, credit);
      const mcc = mccData(row?.[3]);
      transactions.push(transaction({
        transactionDate,
        postingDate,
        description,
        originalAmount: Math.max(debit, credit),
        originalCurrency: 'VND',
        debitAmount: debit,
        creditAmount: credit,
        feeAmount: type === 'fee' ? debit : 0,
        referenceNumber: referenceNumber(description),
        sourcePage: 1,
        sourceRow: index + 1,
        rawData: {
          transactionType: type,
          sourceAccountNumber,
          mcc: mcc.text || null,
          mccCode: mcc.code,
          mccDescription: mcc.description,
          signedDebitAmount: Number(row?.[4] || 0).toFixed(2),
          signedCreditAmount: Number(row?.[5] || 0).toFixed(2),
          originalAmountBasis: 'settlement_vnd',
        },
      }));
    }
    linkTransactionFees(transactions);

    const statementDate = isoDate(cell(rows, 'Ngày sao kê'));
    const totalDebit = nullableDecimal(cell(rows, 'Phát sinh nợ trong kỳ'));
    const totalCredit = nullableDecimal(cell(rows, 'Phát sinh có trong kỳ'));
    const warnings = [];
    if (!transactions.length) warnings.push({ level: 'error', code: 'NO_TRANSACTIONS', message: 'Không nhận diện được giao dịch trong sao kê VIB.' });
    if (totalDebit === null || totalCredit === null) warnings.push({ level: 'warning', code: 'STATEMENT_TOTALS_MISSING', message: 'Không đọc được tổng ghi nợ hoặc ghi có trên sao kê VIB.' });

    return buildResult('VIB', this.version, {
      accountNumberMasked: String(cell(rows, 'Số thẻ chính') || ''),
      cardAccountNumber: String(cell(rows, 'Số tài khoản thẻ') || ''),
      accountHolder: String(rows[3]?.[0] || ''),
      statementDate,
      periodFrom: null,
      periodTo: statementDate,
      currency: 'VND',
      openingBalance: nullableDecimal(cell(rows, 'Dư nợ kỳ trước')),
      closingBalance: nullableDecimal(cell(rows, 'Dư nợ cuối kỳ')),
      totalDebit,
      totalCredit,
    }, transactions, warnings);
  },
};
