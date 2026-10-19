ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS fee_type VARCHAR(96);

UPDATE expense_transactions SET fee_type = CASE
  WHEN normalized_description ~ 'QUAN LY GIAO DICH VND TAI NUOC NGOAI|INTERNATIONAL DEVICE COUNTRY' THEN 'Phí giao dịch VND tại nước ngoài'
  WHEN normalized_description ~ 'GIAO DICH NGOAI TE|CHUYEN DOI NGOAI TE|FOREIGN CURRENCY|FX FEE' THEN 'Phí chuyển đổi ngoại tệ'
  WHEN normalized_description ~ 'GIAO DICH NOI TE|XU LY GD QUOC TE|XU LY GIAO DICH QUOC TE|INTERNATIONAL TRANSACTION' THEN 'Phí xử lý giao dịch quốc tế'
  WHEN normalized_description ~ '^VAT$|THUE VAT|VALUE ADDED TAX' THEN 'Thuế VAT'
  WHEN normalized_description ~ 'SMS FEE|PHI SMS|SMS BANKING' THEN 'Phí SMS'
  WHEN normalized_description ~ 'THUONG NIEN|ANNUAL FEE' THEN 'Phí thường niên'
  WHEN normalized_description ~ 'LAI |INTEREST|CHAM THANH TOAN|LATE PAYMENT' THEN 'Phí lãi và chậm thanh toán'
  ELSE 'Phí khác' END
WHERE cost_nature='fee' OR fee_amount>0;

CREATE INDEX IF NOT EXISTS expense_transactions_fee_type_idx ON expense_transactions(fee_type) WHERE fee_type IS NOT NULL;
