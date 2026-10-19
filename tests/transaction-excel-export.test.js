const test=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const {HEADERS,buildTransactionWorkbook}=require('../src/modules/expenses/transactionExcelExport');

test('transaction Excel export preserves dates, three monetary columns and classifications',()=>{
  const buffer=buildTransactionWorkbook([{transaction_date:new Date('2026-07-10T00:00:00.000Z'),posting_date:new Date('2026-07-11T00:00:00.000Z'),bank_code:'VIB',account_name:'DUONG NGOC DUC',account_number_masked:'513892******0399',account_type:'credit_card',account_currency:'VND',original_amount:'15500000.25',original_currency:'VND',debit_amount:'10000',credit_amount:'0',fee_amount:'10000',expense_category:'Quảng cáo trực tuyến',expense_subcategory:'Facebook Ads',fee_type:'Phí giao dịch quốc tế',cost_nature:'fee',matched_keyword:'FACEBK',classification_confidence:'high',description:'FACEBK ADS',original_filename:'vib_07.xlsx',source_page:null,source_row:9,committed_at:'2026-08-17T01:02:03.000Z'}]);
  const workbook=XLSX.read(buffer,{type:'buffer',cellDates:true});const sheet=workbook.Sheets['Giao dịch'];
  const headers=XLSX.utils.sheet_to_json(sheet,{header:1,range:0,blankrows:false})[0];
  assert.deepEqual(headers,HEADERS);assert.equal(headers.length,24);assert.ok(!headers.includes('Phí giao dịch'));assert.ok(!headers.includes('Tổng chi phí'));
  assert.equal(sheet.D2.v,'Phí giao dịch');assert.equal(sheet.J2.t,'n');assert.equal(sheet.J2.v,15500000.25);assert.equal(sheet.L2.v,10000);assert.equal(sheet.M2.v,0);assert.equal(sheet.N2.v,'Quảng cáo trực tuyến');assert.equal(sheet.O2.v,'Facebook Ads');assert.equal(sheet.P2.v,'Phí giao dịch quốc tế');assert.equal(sheet.T2.v,'FACEBK ADS');assert.ok(sheet.B2.v instanceof Date);
});
