UPDATE expense_transactions SET expense_category='Chi tiêu cá nhân'
WHERE expense_category='Chi phí khác' AND expense_subcategory IN ('Mua sắm','Ăn uống','Đi lại','Giải trí','Lưu trú & du lịch');

UPDATE expense_transactions SET
  expense_category=CASE
    WHEN normalized_description ~ 'FACEBK|FACEBOOK|FB ME ADS|METAPAY' THEN 'Quảng cáo trực tuyến'
    WHEN normalized_description ~ 'GOOGLE (ADWS|ADS)|ADWORDS' THEN 'Quảng cáo trực tuyến'
    WHEN normalized_description LIKE '%TIKTOK%' THEN 'Quảng cáo trực tuyến'
    WHEN normalized_description LIKE '%COCCOC%' THEN 'Quảng cáo trực tuyến'
    WHEN normalized_description LIKE '%CANVA%' THEN 'Phần mềm & dịch vụ số'
    ELSE expense_category END,
  expense_subcategory=CASE
    WHEN normalized_description ~ 'FACEBK|FACEBOOK|FB ME ADS|METAPAY' THEN 'Facebook Ads'
    WHEN normalized_description ~ 'GOOGLE (ADWS|ADS)|ADWORDS' THEN 'Google Ads'
    WHEN normalized_description LIKE '%TIKTOK%' THEN 'TikTok Ads'
    WHEN normalized_description LIKE '%COCCOC%' THEN 'Cốc Cốc Ads'
    WHEN normalized_description LIKE '%CANVA%' THEN 'Thiết kế - Canva'
    ELSE expense_subcategory END,
  matched_keyword=CASE
    WHEN normalized_description ~ 'FACEBK|FACEBOOK|FB ME ADS|METAPAY' THEN 'Keyword trên dòng phí: Facebook'
    WHEN normalized_description ~ 'GOOGLE (ADWS|ADS)|ADWORDS' THEN 'Keyword trên dòng phí: Google Ads'
    WHEN normalized_description LIKE '%TIKTOK%' THEN 'Keyword trên dòng phí: TikTok'
    WHEN normalized_description LIKE '%COCCOC%' THEN 'Keyword trên dòng phí: Cốc Cốc'
    WHEN normalized_description LIKE '%CANVA%' THEN 'Keyword trên dòng phí: Canva'
    ELSE matched_keyword END,
  classification_confidence=CASE WHEN normalized_description ~ 'FACEBK|FACEBOOK|FB ME ADS|METAPAY|GOOGLE (ADWS|ADS)|ADWORDS|TIKTOK|COCCOC|CANVA' THEN 'high' ELSE classification_confidence END
WHERE fee_amount>0;
