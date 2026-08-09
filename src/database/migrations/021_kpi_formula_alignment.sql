-- Only mark KPI as derived when every source field exists in the direct-entry detail form.
UPDATE report_kpi_definitions SET input_mode='manual',formula_code=NULL WHERE code IN
('TT_04','TT_08','TRADE_02','TRADE_06','DAO_04','DAO_05','DAO_07');

UPDATE report_kpi_definitions SET input_mode='derived',formula_code=code WHERE code IN
('ADS_01','ADS_02','ADS_03','ADS_04','ADS_05','ADS_06','ADS_07',
 'TT_01','TT_02','TT_03','TT_05','TT_06','TT_07','TT_09',
 'TRADE_03','TRADE_04','TRADE_05','TRADE_07','TRADE_08','TRADE_09','TRADE_10','TRADE_11',
 'DAO_01','DAO_02','DAO_03','DAO_06','DAO_08','DAO_09');

-- Drafts are not historical records yet; align their formula snapshot with the corrected master.
UPDATE report_kpi_values value SET
  input_mode_snapshot=definition.input_mode,
  formula_code_snapshot=definition.formula_code
FROM report_kpi_definitions definition,report_data_versions version
WHERE value.kpi_definition_id=definition.id AND value.version_id=version.id AND version.status='draft';
