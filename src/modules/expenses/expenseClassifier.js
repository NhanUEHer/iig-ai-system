const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

const RULES = [
  { category: 'Quảng cáo trực tuyến', subcategory: 'Facebook Ads', pattern: /FACEBK|FACEBOOK|FB\.ME\/ADS|METAPAY/, keyword: 'FACEBK / FACEBOOK / FB.ME/ADS / METAPAY' },
  { category: 'Quảng cáo trực tuyến', subcategory: 'Google Ads', pattern: /GOOGLE\s*\*?\s*(?:ADWS|ADS)|ADWORDS/, keyword: 'GOOGLE ADWS / GOOGLE ADS / ADWORDS' },
  { category: 'Quảng cáo trực tuyến', subcategory: 'TikTok Ads', pattern: /TIKTOK/, keyword: 'TIKTOK' },
  { category: 'Quảng cáo trực tuyến', subcategory: 'Cốc Cốc Ads', pattern: /COCCOC/, keyword: 'COCCOC' },
  { category: 'Phần mềm & dịch vụ số', subcategory: 'Thiết kế - Canva', pattern: /CANVA/, keyword: 'CANVA' },
  { category: 'Phần mềm & dịch vụ số', subcategory: 'AI & trợ lý', pattern: /OPENAI|CHATGPT|ANTHROPIC|CLAUDE/, keyword: 'OPENAI / CHATGPT / ANTHROPIC / CLAUDE' },
  { category: 'Phần mềm & dịch vụ số', subcategory: 'Apple Services', pattern: /APPLE\.COM\/BILL/, keyword: 'APPLE.COM/BILL' },
  { category: 'Đào tạo & phát triển', subcategory: 'Thi cử & chứng chỉ', pattern: /ETS TOEFL|TOEFL/, keyword: 'ETS TOEFL / TOEFL' },
  { category: 'Đào tạo & phát triển', subcategory: 'Nền tảng học tập', pattern: /MAGOOSH|TST PREP|SKOOL|LINGOLEAP/, keyword: 'MAGOOSH / TST PREP / SKOOL / LINGOLEAP' },
  { category: 'Chi tiêu cá nhân', subcategory: 'Mua sắm', pattern: /SHOPEE|TIKI|UNIQLO|ZARA|PEDRO|FOOTLOCKER|MUJI|LOTTE SHOPPING|WINMART|WCM_|MAXVALU|GREEN MART|ONE MARKET/, keyword: 'Merchant mua sắm' },
  { category: 'Chi tiêu cá nhân', subcategory: 'Ăn uống', pattern: /STARBUCKS|HIGHLANDS|KATINAT|MCDONALDS|EVERYHALF|CAFE |TLJ /, keyword: 'Merchant ăn uống' },
  { category: 'Chi tiêu cá nhân', subcategory: 'Đi lại', pattern: /GRAB\*|GP_A\*|GOZ_\*/, keyword: 'GRAB / GP_A / GOZ_' },
  { category: 'Chi tiêu cá nhân', subcategory: 'Giải trí', pattern: /CGV|BETA CINEMA/, keyword: 'CGV / BETA CINEMA' },
  { category: 'Chi tiêu cá nhân', subcategory: 'Lưu trú & du lịch', pattern: /VINPEARL/, keyword: 'VINPEARL' },
];

const FEE_RULES = [
  { type: 'Phí giao dịch VND tại nước ngoài', pattern: /QUAN LY GIAO DICH VND TAI NUOC NGOAI|INTERNATIONAL DEVICE COUNTRY/ },
  { type: 'Phí chuyển đổi ngoại tệ', pattern: /GIAO DICH NGOAI TE|CHUYEN DOI NGOAI TE|FOREIGN CURRENCY|FX FEE/ },
  { type: 'Phí xử lý giao dịch quốc tế', pattern: /GIAO DICH NOI TE|XU LY GD QUOC TE|XU LY GIAO DICH QUOC TE|INTERNATIONAL TRANSACTION/ },
  { type: 'Thuế VAT', pattern: /^VAT$|THUE VAT|VALUE ADDED TAX/ },
  { type: 'Phí SMS', pattern: /SMS FEE|PHI SMS|SMS BANKING/ },
  { type: 'Phí thường niên', pattern: /THUONG NIEN|ANNUAL FEE/ },
  { type: 'Phí lãi và chậm thanh toán', pattern: /LAI |INTEREST|CHAM THANH TOAN|LATE PAYMENT/ },
];

function classifyFeeType(row) {
  const description = normalize(row.description);
  return FEE_RULES.find(rule => rule.pattern.test(description))?.type || 'Phí khác';
}

function classifyExpense(row) {
  const description = normalize(row.description);
  const isFee = Number(row.fee_amount ?? row.feeAmount) > 0 || description.startsWith('PHI ') || description.includes(' FEE');
  const rule = RULES.find(item => item.pattern.test(description));
  const feeType = isFee ? classifyFeeType(row) : null;
  if (rule) return { category: rule.category, subcategory: rule.subcategory, costNature: isFee ? 'fee' : 'direct', feeType, matchedKeyword: rule.keyword, confidence: 'high' };
  if (isFee) return { category: 'Chi phí tài chính', subcategory: 'Phí giao dịch độc lập', costNature: 'fee', feeType, matchedKeyword: 'FEE', confidence: 'medium' };
  return { category: 'Chi phí khác', subcategory: 'Chưa xác định', costNature: 'direct', feeType: null, matchedKeyword: null, confidence: 'low' };
}

function classifyRows(rows) {
  const classified = rows.map(row => ({ ...row, classification: classifyExpense(row) }));
  const bySource = new Map(classified.map(row => [`${row.source_page || row.sourcePage || 1}:${row.source_row || row.sourceRow}`, row]));
  for (const row of classified) {
    if (row.classification.costNature !== 'fee') continue;
    const raw = row.raw_data || row.rawData || {};
    const parentRow = raw.parentSourceRow;
    if (!parentRow) continue;
    const parent = bySource.get(`${raw.parentSourcePage || row.source_page || row.sourcePage || 1}:${parentRow}`);
    if (!parent || parent.classification.category === 'Chi phí khác') continue;
    row.classification = { ...parent.classification, costNature: 'fee', feeType: row.classification.feeType, matchedKeyword: `Kế thừa: ${parent.classification.matchedKeyword || parent.description}`, confidence: parent.classification.confidence };
  }
  return classified;
}

module.exports = { RULES, FEE_RULES, classifyExpense, classifyFeeType, classifyRows };
