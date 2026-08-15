const { decimal, isoDate, normalizeDescription, transaction, buildResult } = require('./parserUtils');

const DATE = /^\d{2}\/\d{2}\/\d{2}$/;
const ROW = /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s+([A-Z]{3})(?:\s+(-?[\d,]+\.\d{2}))?\s+(-?[\d,]+\.\d{2})$/;
const STOP = /^(?:Số tiền chi tiêu từ ngày|AMOUNT TO BE SPENT|Chú thích|Statement glossary|Lãi suất và phí|Interest, fees and charges)/i;
const IGNORE_CONTINUATION = /^(?:Page \d+ of \d+|CHI TIẾT|TRANSACTION DETAILS|Ngày giao dịch|Tnx date|TÓM TẮT|STATEMENT SUMMARY|Dư nợ đầu kỳ|Beginning Balance|Tổng dư nợ|Đã thanh toán)/i;

const amount = value => Math.abs(Number(String(value || 0).replace(/,/g, '')));
const nullableDecimal = value => value == null ? null : decimal(value);

function anchorFor(line, pageNumber) {
  const items = line.items || [];
  if (!items.length) return { page:pageNumber, x:0, y:line.y || 0, width:0, height:14 };
  const left = Math.min(...items.map(item => item.x));
  const right = Math.max(...items.map(item => item.x + Number(item.width || 0)));
  return { page:pageNumber, x:Number(left.toFixed(2)), y:Number((line.y || 0).toFixed(2)), width:Number((right-left).toFixed(2)), height:14 };
}

function parseRows(extracted) {
  const rows = [];
  let pendingDate = null;
  let finished = false;
  for (const page of extracted.pages) {
    if (finished) break;
    for (const line of page.lines) {
      const text = String(line.text || '').trim();
      if (rows.length && STOP.test(text)) { finished = true; break; }
      if (DATE.test(text)) { pendingDate = text; continue; }
      const candidate = pendingDate ? `${pendingDate} ${text}` : text;
      const match = candidate.match(ROW);
      if (match) {
        pendingDate = null;
        const payment = Number(match[7].replace(/,/g, ''));
        const fee = amount(match[6]);
        const debit = payment < 0 ? Math.abs(payment) : 0;
        const credit = payment > 0 ? payment : 0;
        const type = fee > 0 ? 'fee' : (credit > 0 ? (/payment|thanh toan/i.test(match[3]) ? 'payment' : 'refund') : 'purchase');
        const referenceNumber = match[3].match(/\*([A-Z0-9-]{5,})/i)?.[1] || null;
        rows.push(transaction({
          transactionDate:match[1], postingDate:match[2], description:match[3], originalAmount:amount(match[4]),
          originalCurrency:match[5], feeAmount:fee, debitAmount:debit, creditAmount:credit, referenceNumber,
          sourcePage:page.number, sourceRow:line.row,
          rawData:{ transactionType:type, signedPaymentAmount:payment.toFixed(2), sourceAnchor:anchorFor(line,page.number) },
        }));
        continue;
      }
      pendingDate = null;
      if (!rows.length || !text || IGNORE_CONTINUATION.test(text)) continue;
      const previous = rows.at(-1);
      previous.description = `${previous.description} ${text}`.replace(/\s+/g, ' ').trim();
      previous.normalizedDescription = normalizeDescription(previous.description);
      if (!previous.referenceNumber) previous.referenceNumber = previous.description.match(/\*([A-Z0-9-]{5,})/i)?.[1] || null;
    }
  }
  for (const row of rows) {
    row.rawData.transactionType = Number(row.feeAmount) > 0 ? 'fee'
      : (Number(row.creditAmount) > 0 ? (/payment|thanh toan/i.test(row.description) ? 'payment' : 'refund') : 'purchase');
  }
  for (let index = 0; index < rows.length; index += 1) {
    const fee = rows[index];
    if (fee.rawData.transactionType !== 'fee') continue;
    const parent = rows.slice(0,index).reverse().find(row => row.rawData.transactionType === 'purchase'
      && row.transactionDate === fee.transactionDate && row.postingDate === fee.postingDate);
    if (parent) {
      fee.rawData.parentSourcePage = parent.sourcePage;
      fee.rawData.parentSourceRow = parent.sourceRow;
    }
  }
  return rows;
}

module.exports = {
  version:'2.0.0',
  parse(extracted) {
    if (!/VPBANK CREDIT CARD STATEMENT/i.test(extracted.text) || !/TRANSACTION DETAILS/i.test(extracted.text)) throw Object.assign(new Error('File không đúng mẫu sao kê VPBank được hỗ trợ.'), { code:'STATEMENT_TEMPLATE_UNSUPPORTED' });
    const rows = parseRows(extracted);
    const text = extracted.pages[0].text;
    const cycle = text.match(/Statement cycle\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i);
    const summary = text.match(/Beginning Balance[\s\S]*?(-?[\d,]+\.\d{2})\s+\+\s+(-?[\d,]+\.\d{2})\s+\+\s+([\d,]+\.\d{2})\s+=\s+(-?[\d,]+\.\d{2})/i);
    const warnings = rows.length ? [] : [{ level:'error', code:'VPBANK_NO_TRANSACTIONS', message:'Không nhận diện được giao dịch VPBank trong file sao kê.' }];
    const result = buildResult('VPBANK', this.version, {
      accountNumberMasked:text.match(/TRANSACTION DETAILS OF\s+([x\d-]+)/i)?.[1] || null,
      accountHolder:text.split('\n').find(value => /DUONG NGOC DUC/i.test(value))?.split(' TÓM')[0] || null,
      statementDate:cycle ? isoDate(cycle[2]) : null,
      periodFrom:cycle ? isoDate(cycle[1]) : null,
      periodTo:cycle ? isoDate(cycle[2]) : null,
      currency:'VND',
      openingBalance:nullableDecimal(summary?.[1]),
      closingBalance:nullableDecimal(summary?.[4]),
      totalDebit:nullableDecimal(summary?.[2]),
      totalCredit:nullableDecimal(summary?.[3]),
    }, rows, warnings);
    result.reconciliation.basis = { debit:'statement_total_debit', credit:'statement_paid_during_term' };
    return result;
  },
};
