const { decimal, isoDate, normalizeDescription, transaction, buildResult } = require('./parserUtils');

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const tpAmount = value => String(value || '').replace(/[^\d]/g, '') || '0';
const itemText = (line, fromX, toX = Infinity) => line.items.filter(item => item.x >= fromX && item.x < toX).map(item => item.text).join(' ').trim();

function valuesAfterLabel(pages, label) {
  const matches = [];
  for (const page of pages) {
    for (let index = 0; index < page.lines.length; index += 1) {
      if (!page.lines[index].text.toLowerCase().includes(label.toLowerCase())) continue;
      for (const line of page.lines.slice(index + 1, index + 3)) {
        const value = line.items.find(item => item.x >= 430 && /^[\d.,]+$/.test(item.text.trim()));
        if (value) {
          matches.push({ value:tpAmount(value.text), page:page.number, row:line.row });
          break;
        }
      }
    }
  }
  return matches;
}
const valueAfterLabel = (pages, label) => valuesAfterLabel(pages, label)[0]?.value || null;

function statementSummaryValues(pages) {
  const positioned = [];
  for (const page of pages) {
    for (const line of page.lines) {
      if (line.items.some(item => item.x < 170 && DATE.test(item.text.trim()))) continue;
      const value = line.items.find(item => item.x >= 438 && item.x <= 446 && /^[\d.,]+$/.test(item.text.trim()));
      if (value) positioned.push({ value:tpAmount(value.text), page:page.number, row:line.row });
    }
  }
  const openings = valuesAfterLabel(pages, 'D n k trc');
  const spends = valuesAfterLabel(pages, 'Gi tr giao dch th k ny');
  const closings = valuesAfterLabel(pages, 'D n sao k');
  const spendAnchor = spends.at(-1) || (positioned.length >= 3 ? positioned.at(-2) : null);
  const closingAnchor = closings.at(-1) || (positioned.length >= 3 ? positioned.at(-1) : null);
  return {
    opening: openings[0]?.value || positioned[0]?.value || null,
    spend: spendAnchor?.value || null,
    closing: closingAnchor?.value || null,
    spendAnchor,
    closingAnchor,
  };
}

function parseTransactions(extracted, summaries) {
  const rows = [];
  for (const page of extracted.pages) {
    for (let index = 0; index < page.lines.length; index += 1) {
      const line = page.lines[index];
      const dates = line.items.filter(item => item.x < 170 && DATE.test(item.text.trim()));
      if (dates.length < 2) continue;

      const related = [line];
      if (!itemText(line, 170, 350) && index > 0 && !page.lines[index - 1].items.some(item => DATE.test(item.text.trim()))) related.unshift(page.lines[index - 1]);
      if (!line.items.some(item => item.x >= 350) && index + 1 < page.lines.length && !page.lines[index + 1].items.some(item => DATE.test(item.text.trim()))) related.push(page.lines[index + 1]);

      let description = related.map(part => itemText(part, 170, 350)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const original = related.flatMap(part => part.items).find(item => item.x >= 350 && item.x < 430 && /^([A-Z]{3})\s+[\d.,]+$/.test(item.text.trim()));
      const posted = related.flatMap(part => part.items).filter(item => item.x >= 430 && /^[\d.,]+$/.test(item.text.trim())).at(-1);
      if (!description || !original || !posted) continue;

      const originalMatch = original.text.trim().match(/^([A-Z]{3})\s+([\d.,]+)$/);
      const isCredit = posted.x >= 500;
      const isSummaryFee = summaries.spendAnchor?.page === page.number && summaries.closingAnchor?.page === page.number
        && line.row > summaries.spendAnchor.row && line.row < summaries.closingAnchor.row;
      const isFee = /Phi (?:xu ly GD quoc te|phat hanh lai)/i.test(description) || isSummaryFee;
      if (isSummaryFee && !/Phi xu ly GD quoc te/i.test(description)) {
        const merchant = description.match(/(?:CANVA|VINPEARL|[A-Z][A-Z0-9]*\*)[\s\S]*/)?.[0];
        description = `Phi xu ly GD quoc te${merchant ? ` ${merchant}` : ''}`;
      }
      const isRefund = isCredit && /Credit_|Hoan tien/i.test(description);
      const allItems = related.flatMap(part => part.items);
      const anchorX = Math.min(...allItems.map(item => item.x));
      const anchorRight = Math.max(...allItems.map(item => item.x + item.width));
      const anchorBottom = Math.min(...related.map(part => part.y));
      const anchorTop = Math.max(...related.map(part => part.y));
      rows.push(transaction({
        transactionDate: dates[0].text,
        postingDate: dates[1].text,
        description,
        originalAmount: tpAmount(originalMatch[2]),
        originalCurrency: originalMatch[1],
        debitAmount: isCredit ? 0 : tpAmount(posted.text),
        creditAmount: isCredit ? tpAmount(posted.text) : 0,
        feeAmount: isFee ? tpAmount(posted.text) : 0,
        sourcePage: page.number,
        sourceRow: line.row,
        rawData: {
          transactionType: isFee ? 'fee' : (isRefund ? 'refund' : (isCredit ? 'payment' : 'purchase')),
          sourceAnchor: { page: page.number, x: Number(anchorX.toFixed(2)), y: Number(anchorBottom.toFixed(2)), width: Number((anchorRight - anchorX).toFixed(2)), height: Number((anchorTop - anchorBottom + 14).toFixed(2)) },
        },
      }));
    }
  }

  for (const fee of rows.filter(row => row.rawData.transactionType === 'fee')) {
    const feeToken = fee.description.match(/\*[A-Z0-9-]+/i)?.[0]?.toUpperCase();
    const candidates = rows.filter(row => row.rawData.transactionType === 'purchase' && row.transactionDate === fee.transactionDate && row.postingDate === fee.postingDate && row.originalAmount === fee.originalAmount);
    const parent = candidates.find(row => feeToken && row.description.toUpperCase().includes(feeToken)) || candidates[0];
    if (parent) {
      fee.rawData.parentSourcePage = parent.sourcePage;
      fee.rawData.parentSourceRow = parent.sourceRow;
    }
  }
  return rows;
}

module.exports = {
  version: '2.3.0',
  parse(extracted) {
    const signature = extracted.text;
    if (signature.includes('@RL%2A') && signature.includes('AWGWKQKRW')) return buildResult('TPBANK', this.version, { accountNumberMasked:null,accountHolder:null,statementDate:null,periodFrom:null,periodTo:null,currency:'VND',openingBalance:null,closingBalance:null,totalDebit:null,totalCredit:null }, [], [
      { level:'error', code:'TPBANK_FONT_ENCODING_UNSUPPORTED', message:'PDF TPBank dùng font không có bảng ánh xạ Unicode; hệ thống không thể bóc tách an toàn và sẽ không cho commit.' },
    ]);
    if (!/SAO KÊ TÀI KHOẢN THẺ TÍN DỤNG/i.test(signature) || !/TPBANK/i.test(signature)) throw Object.assign(new Error('File không đúng mẫu sao kê TPBank được hỗ trợ.'), { code:'STATEMENT_TEMPLATE_UNSUPPORTED' });

    const first = extracted.pages[0];
    const summaries=statementSummaryValues(extracted.pages);
    const transactions = parseTransactions(extracted, summaries);
    const accountNumberRaw = signature.match(/\b\d{6}(?:[x*u?]){4,}\d{4}\b/i)?.[0] || null;
    const accountNumber = accountNumberRaw?.replace(/(?<=\d{6})[x*u?]+(?=\d{4})/i, match => 'x'.repeat(match.length)) || null;
    const holderLine = first.lines.find(line => line.items.some(item => item.x > 180 && item.x < 309 && /^[A-Z][A-Z\s]+$/.test(item.text.trim())));
    const statementDateLine = first.lines.find(line => line.items.some(item => item.x > 480 && DATE.test(item.text.trim())));
    const openingBalance = signature.match(/Dư nợ kỳ trước[\s\S]{0,80}?VND\s+([\d.]+)/i)?.[1]||summaries.opening;
    const closingBalance = signature.match(/Dư nợ sao kê[\s\S]{0,80}?VND\s+([\d.]+)/i)?.[1]||summaries.closing;
    const statementSpend = valueAfterLabel(extracted.pages, 'Giá trị giao dịch thẻ kỳ này')||summaries.spend;
    const parsedFees = transactions.reduce((sum, row) => sum + Number(row.feeAmount || 0), 0);
    const totalDebit = statementSpend == null ? null : String(Number(statementSpend) + parsedFees);
    const totalCredit = totalDebit == null || !openingBalance || !closingBalance ? null : String(Number(tpAmount(openingBalance)) + Number(totalDebit) - Number(tpAmount(closingBalance)));

    const result = buildResult('TPBANK', this.version, {
      accountNumberMasked: accountNumber,
      accountHolder: holderLine?.items.find(item => item.x > 180 && item.x < 309)?.text.trim() || null,
      statementDate: isoDate(statementDateLine?.items.find(item => item.x > 480 && DATE.test(item.text.trim()))?.text),
      periodFrom: null,
      periodTo: null,
      currency: 'VND',
      openingBalance: openingBalance ? decimal(tpAmount(openingBalance)) : null,
      closingBalance: closingBalance ? decimal(tpAmount(closingBalance)) : null,
      totalDebit: totalDebit == null ? null : decimal(totalDebit),
      totalCredit: totalCredit == null ? null : decimal(totalCredit),
    }, transactions);
    result.reconciliation.basis = {
      debit: 'statement_spend_plus_parsed_fees',
      credit: 'opening_balance_plus_debit_minus_closing_balance',
    };
    if(extracted.encodingRepaired) {
      result.reconciliation.sourceEncoding='embedded_glyph_map';
      result.reconciliation.encodingProfile=extracted.encodingProfile || 'sequential';
      result.reconciliation.encodingCidOffset=extracted.encodingCidOffset ?? 0;
    }
    return result;
  },
};
