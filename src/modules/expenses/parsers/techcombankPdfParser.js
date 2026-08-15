const { decimal, isoDate, normalizeDescription, transaction, buildResult } = require('./parserUtils');
module.exports = {
  version: '1.2.0',
  parse(extracted) {
    if (!/TECHCOMBANK|Techcombank/i.test(extracted.text) || !/SAO KÊ TÀI KHOẢN THẺ TÍN DỤNG/i.test(extracted.text)) throw Object.assign(new Error('File không đúng mẫu sao kê Techcombank được hỗ trợ.'), { code:'STATEMENT_TEMPLATE_UNSUPPORTED' });
    const first = extracted.pages[0].text;
    const transactions = [];
    for (const page of extracted.pages) for (const line of page.lines) {
      const match = line.text.match(/^(\d{2}\/\d{2}\/\d{4})\s+(?:(\d{2}\/\d{2}\/\d{4})\s+)?([\d,]+)\s+([A-Z]{3})\s+([\d,]+)\s+(.*)$/);
      if (!match || /Tổng ghi|Số dư cần/i.test(match[6])) { if(transactions.length && page.number===1 && line.row>17 && line.row<42 && !/^\d+\s*\/\s*\d+$/i.test(line.text)){transactions[transactions.length-1].description+=` ${line.text}`;transactions[transactions.length-1].normalizedDescription=normalizeDescription(transactions[transactions.length-1].description);} continue; }
      const previous = transactions[transactions.length-1];
      const isCredit = /Thanh toan no the/i.test(match[6]);
      const isFee = /PHI GIAO DICH/i.test(match[6]);
      // Fee rows leave Transaction Date blank in the statement. Their only printed
      // date is Post Date, while Original Amount repeats the parent transaction.
      const transactionDate = isFee && !match[2] ? previous?.transactionDate : match[1];
      const postingDate = isFee && !match[2] ? match[1] : (match[2] || match[1]);
      const anchorX = Math.min(...line.items.map(item => item.x));
      const anchorRight = Math.max(...line.items.map(item => item.x + item.width));
      transactions.push(transaction({ transactionDate, postingDate, originalAmount:match[3], originalCurrency:match[4],
        debitAmount:isCredit?0:match[5], creditAmount:isCredit?match[5]:0, feeAmount:isFee?match[5]:0, description:match[6], sourcePage:page.number, sourceRow:line.row,
        rawData:{ transactionType:isFee?'fee':(isCredit?'payment':'purchase'), parentSourceRow:isFee?previous?.sourceRow:null,
          printedTransactionDate:isFee&&!match[2]?null:match[1], printedPostingDate:isFee&&!match[2]?match[1]:(match[2]||null), transactionDateInherited:isFee&&!match[2],
          sourceAnchor:{page:page.number,x:Number(anchorX.toFixed(2)),y:Number(line.y.toFixed(2)),width:Number((anchorRight-anchorX).toFixed(2)),height:18} } }));
    }
    // Account identity belongs to the first page, but statement totals are
    // printed after the final transaction and may therefore be on a later page.
    const statementText = extracted.text;
    const findMoney = label => statementText.match(new RegExp(label+'[^\\n]*?(-?[\\d,]+)(?:\\s|$)','i'))?.[1];
    const optionalMoney = label => { const value=findMoney(label); return value == null ? null : decimal(value); };
    return buildResult('TECHCOMBANK', this.version, { accountNumberMasked:first.match(/Số tài khoản thẻ tín dụng:\s*(\d+)/i)?.[1] || null,
      accountHolder:first.match(/Ông\/Bà:\s*([^\n]+?)\s+Ngày sao kê:/i)?.[1]?.trim() || null,
      statementDate:isoDate(first.match(/Ngày sao kê:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]), periodFrom:null, periodTo:null, currency:'VND',
      openingBalance:optionalMoney('Previous Balance:'), closingBalance:optionalMoney('Outstanding Balance:'),
      totalDebit:optionalMoney('Total Debit in period:'), totalCredit:optionalMoney('Total Credit in period:') }, transactions);
  }
};
