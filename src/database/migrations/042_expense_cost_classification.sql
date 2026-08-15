ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS expense_category VARCHAR(96);
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS expense_subcategory VARCHAR(96);
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS cost_nature VARCHAR(24) NOT NULL DEFAULT 'direct';
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS matched_keyword TEXT;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS classification_confidence VARCHAR(16) NOT NULL DEFAULT 'low';

UPDATE expense_transactions SET
  expense_category = CASE
    WHEN normalized_description ~ 'FACEBK|FACEBOOK|FB ME ADS|METAPAY' THEN 'Quảng cáo trực tuyến'
    WHEN normalized_description ~ 'GOOGLE (ADWS|ADS)|ADWORDS' THEN 'Quảng cáo trực tuyến'
    WHEN normalized_description LIKE '%TIKTOK%' THEN 'Quảng cáo trực tuyến'
    WHEN normalized_description LIKE '%COCCOC%' THEN 'Quảng cáo trực tuyến'
    WHEN normalized_description LIKE '%CANVA%' THEN 'Phần mềm & dịch vụ số'
    WHEN normalized_description ~ 'OPENAI|CHATGPT|ANTHROPIC|CLAUDE|APPLE COM BILL' THEN 'Phần mềm & dịch vụ số'
    WHEN normalized_description ~ 'ETS TOEFL|TOEFL|MAGOOSH|TST PREP|SKOOL|LINGOLEAP' THEN 'Đào tạo & phát triển'
    WHEN normalized_description ~ 'SHOPEE|TIKI|UNIQLO|ZARA|PEDRO|FOOTLOCKER|MUJI|LOTTE SHOPPING|WINMART|WCM|MAXVALU|GREEN MART|ONE MARKET|STARBUCKS|HIGHLANDS|KATINAT|MCDONALDS|EVERYHALF|GRAB|GP A|GOZ|CGV|BETA CINEMA|VINPEARL' THEN 'Chi tiêu cá nhân'
    ELSE 'Chi phí khác' END,
  expense_subcategory = CASE
    WHEN normalized_description ~ 'FACEBK|FACEBOOK|FB ME ADS|METAPAY' THEN 'Facebook Ads'
    WHEN normalized_description ~ 'GOOGLE (ADWS|ADS)|ADWORDS' THEN 'Google Ads'
    WHEN normalized_description LIKE '%TIKTOK%' THEN 'TikTok Ads'
    WHEN normalized_description LIKE '%COCCOC%' THEN 'Cốc Cốc Ads'
    WHEN normalized_description LIKE '%CANVA%' THEN 'Thiết kế - Canva'
    WHEN normalized_description ~ 'OPENAI|CHATGPT|ANTHROPIC|CLAUDE' THEN 'AI & trợ lý'
    WHEN normalized_description LIKE '%APPLE COM BILL%' THEN 'Apple Services'
    WHEN normalized_description ~ 'ETS TOEFL|TOEFL' THEN 'Thi cử & chứng chỉ'
    WHEN normalized_description ~ 'MAGOOSH|TST PREP|SKOOL|LINGOLEAP' THEN 'Nền tảng học tập'
    WHEN normalized_description ~ 'GRAB|GP A|GOZ' THEN 'Đi lại'
    WHEN normalized_description ~ 'STARBUCKS|HIGHLANDS|KATINAT|MCDONALDS|EVERYHALF|CAFE|TLJ' THEN 'Ăn uống'
    WHEN normalized_description ~ 'CGV|BETA CINEMA' THEN 'Giải trí'
    WHEN normalized_description LIKE '%VINPEARL%' THEN 'Lưu trú & du lịch'
    WHEN normalized_description ~ 'SHOPEE|TIKI|UNIQLO|ZARA|PEDRO|FOOTLOCKER|MUJI|LOTTE SHOPPING|WINMART|WCM|MAXVALU|GREEN MART|ONE MARKET' THEN 'Mua sắm'
    ELSE 'Chưa xác định' END,
  matched_keyword = CASE WHEN normalized_description ~ 'FACEBK|FACEBOOK|FB ME ADS|METAPAY' THEN 'FACEBK / FACEBOOK / FB.ME/ADS / METAPAY' ELSE NULL END,
  classification_confidence = CASE WHEN normalized_description ~ 'FACEBK|FACEBOOK|FB ME ADS|METAPAY|GOOGLE (ADWS|ADS)|ADWORDS|TIKTOK|COCCOC|CANVA|OPENAI|CHATGPT|ANTHROPIC|CLAUDE|APPLE COM BILL|ETS TOEFL|TOEFL|MAGOOSH|TST PREP|SKOOL|LINGOLEAP' THEN 'high' ELSE 'low' END
WHERE debit_amount > 0;

UPDATE expense_transactions SET expense_category='Chi phí tài chính',expense_subcategory='Phí giao dịch độc lập',cost_nature='fee',matched_keyword='FEE',classification_confidence='medium'
WHERE fee_amount > 0;

UPDATE expense_transactions fee SET expense_category=parent.expense_category,expense_subcategory=parent.expense_subcategory,
  cost_nature='fee',matched_keyword='Kế thừa giao dịch gốc',classification_confidence=parent.classification_confidence
FROM expense_transactions parent
WHERE fee.import_id=parent.import_id AND fee.fee_amount>0
  AND (fee.raw_data->>'parentSourceRow')::integer=parent.source_row
  AND COALESCE((fee.raw_data->>'parentSourcePage')::integer,fee.source_page,1)=COALESCE(parent.source_page,1)
  AND parent.expense_category<>'Chi phí khác';

CREATE INDEX IF NOT EXISTS expense_transactions_category_idx ON expense_transactions(expense_category,expense_subcategory);
