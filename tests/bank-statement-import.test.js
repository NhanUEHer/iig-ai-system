const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const {decimal,isoDate,normalizeDescription,fingerprint}=require('../src/modules/expenses/parsers/parserUtils');const {getParser}=require('../src/modules/expenses/parsers/parserRegistry');
test('statement parser utilities keep decimal values deterministic',()=>{assert.equal(decimal('-1,234,567.89'),'1234567.89');assert.equal(isoDate('04/08/26'),'2026-08-04');assert.equal(normalizeDescription('Phí  giao dịch'),'PHI GIAO DICH');assert.equal(fingerprint('account',{transactionDate:'2026-08-04'}).length,64)});
test('parser registry requires the selected bank and includes VIB',()=>{assert.equal(getParser('VIB').version,'2.0.0');assert.throws(()=>getParser('OTHER'),error=>error.code==='STATEMENT_BANK_UNSUPPORTED')});
test('TPBank proprietary encoding is detected and blocked safely',()=>{const result=getParser('TPBANK').parse({text:'@RL%2A AWGWKQKRW',pages:[]});assert.equal(result.transactions.length,0);assert.equal(result.warnings[0].level,'error')});
test('VIB parses signed credits, classifies fees and keeps source card groups',async()=>{
  const XLSX=require('xlsx');
  const rows=Array.from({length:31},()=>[]);
  rows[0]=['Sao kê giao dịch thẻ tín dụng VIB'];
  rows[3]=['DUONG NGOC DUC'];
  rows[4]=['Số thẻ chính (Primary Card Number)',null,'513892******0399'];
  rows[5]=['Số tài khoản thẻ (Card Account Number)',null,'C000000000408168'];
  rows[15]=['Ngày sao kê (Statement Date)',null,'10/08/2026'];
  rows[19]=['Dư nợ kỳ trước (VND) (Previous Balance)',null,1000];
  rows[20]=['Phát sinh nợ trong kỳ (VND) (Total Debit Transaction)',null,1011];
  rows[21]=['Phát sinh có trong kỳ (VND) (Total Credit Transaction)',null,1000];
  rows[22]=['Dư nợ cuối kỳ (VND) (End Balance)',null,1011];
  rows[24]=['Ngày giao dịch','Ngày hạch toán','Diễn giải','MCC','Ghi nợ/Debit','Ghi có/Credit'];
  rows[25]=['Số thẻ/ Số tài khoản',null,'513892******0399'];
  rows[26]=['01/08/2026','02/08/2026','Mua Hàng / FACEBK *ABCDEF123','7311-Advertising Serv',1000,0];
  rows[27]=['01/08/2026','02/08/2026','Phí Quản Lý Giao Dịch VND Tại Nước Ngoài','7311-Advertising Serv',11,0];
  rows[28]=['03/08/2026','03/08/2026','Thanh toan sao ke the Master Card 08/2026','6012-Member Financial',0,-900];
  rows[29]=['04/08/2026','04/08/2026','cashback 08/2026','6012-Member Financial',0,-100];
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'saoke');
  const result=await getParser('VIB').parse(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
  assert.equal(result.reconciliation.isBalanced,true);
  assert.deepEqual(result.transactions.map(row=>row.rawData.transactionType),['purchase','fee','payment','refund']);
  assert.equal(result.transactions[1].feeAmount,'11.00');
  assert.equal(result.transactions[1].rawData.parentSourceRow,27);
  assert.equal(result.transactions[2].creditAmount,'900.00');
  assert.equal(result.transactions[0].rawData.sourceAccountNumber,'513892******0399');
  assert.equal(result.statement.cardAccountNumber,'C000000000408168');
});
test('TPBank embedded glyph codes are decoded before statement parsing',()=>{
  const {decodeGlyphs,detectCidOffset,detectEncoding}=require('../src/modules/expenses/parsers/tpBankObfuscatedExtractor');
  const glyphs=[11,11,9,10,15,9,12,10,12,16,1,41,41,1,38,42,22,1,41,37,23,22,35,32,1,26,23,22,35,32].map(originalCharCode=>({originalCharCode}));
  assert.equal(decodeGlyphs(glyphs),'11/05/2026 TT QUA TPBANK EBANK');
  const shiftedVnd=[42,34,24].map(originalCharCode=>({originalCharCode}));
  assert.equal(detectCidOffset([{glyphRuns:[shiftedVnd]}]),1);
  assert.equal(decodeGlyphs(shiftedVnd,1),'VND');
  const t7Runs=[[37,33,21,20,31,28],[39,31,23],[30,30,5,1,25,32,32,25,29,24]].map(run=>run.map(originalCharCode=>({originalCharCode})));
  assert.equal(detectEncoding([{glyphRuns:t7Runs}]).name,'tpbank_t7_permuted');
});
test('TPBank readable statement uses column coordinates for debit and credit',()=>{
  const line=(row,y,items)=>({row,y,items:items.map(([x,text,width=40])=>({x,text,width})),text:items.map(([,text])=>text).join(' ')});
  const firstLines=[
    line(1,700,[[200,'SAO KÊ TÀI KHOẢN THẺ TÍN DỤNG']]),
    line(2,680,[[220,'DUONG NGOC DUC'],[510,'11/01/2026']]),
    line(3,660,[[210,'401286xxxxxx8920'],[490,'VND 49.338.951']]),
    line(4,640,[[210,'Dư nợ sao kê'],[490,'VND 39.338.951']]),
    line(5,600,[[48,'15/12/2025'],[118,'15/12/2025'],[177,'TT QUA TPBANK EBANK',100],[360,'VND 20.000.000',60],[518,'20.000.000']]),
    line(6,580,[[48,'16/12/2025'],[118,'17/12/2025'],[177,'MERCHANT',100],[360,'VND 10.000.000',60],[448,'10.000.000']]),
    line(7,560,[[177,'Giá trị giao dịch thẻ kỳ này']]),
    line(8,550,[[443,'10.000.000']]),
  ];
  const text='TPBANK\nSAO KÊ TÀI KHOẢN THẺ TÍN DỤNG\nDUONG NGOC DUC 11/01/2026\n401286xxxxxx8920\nDư nợ kỳ trước VND 49.338.951\nDư nợ sao kê VND 39.338.951\nGiá trị giao dịch thẻ kỳ này\n10.000.000';
  const result=getParser('TPBANK').parse({text,pages:[{number:1,text,lines:firstLines}]});
  assert.equal(result.transactions.length,2);
  assert.equal(result.transactions[0].creditAmount,'20000000.00');
  assert.equal(result.transactions[1].debitAmount,'10000000.00');
  assert.equal(result.statement.totalDebit,'10000000.00');
  assert.equal(result.statement.totalCredit,'20000000.00');
  assert.equal(result.reconciliation.isBalanced,true);
  assert.equal(result.transactions[1].rawData.sourceAnchor.page,1);
});
test('VPBank parses purchases, fees and payments without swallowing statement notes',()=>{
  const line=(row,y,text)=>({row,y,text,items:[{x:62,y,width:500,text}]});
  const header='VPBANK CREDIT CARD STATEMENT\nStatement cycle : 21/05/2026 - 20/06/2026\nDUONG NGOC DUC TÓM TẮT TÀI KHOẢN / ACCOUNT SUMMARY\nBeginning Balance\n0.00 + -110.00 + 110.00 = 0.00\nTRANSACTION DETAILS OF xxxx-xxxx-xxxx-2945';
  const extracted={text:header,pages:[{number:1,text:header,lines:[
    line(1,500,'01/06/26 02/06/26 Retail merchant -100.00 VND -100.00'),
    line(2,480,'01/06/26 02/06/26 VAT 0.00 VND -10.00 -10.00'),
    line(3,460,'03/06/26 03/06/26 Credit Account I2B 110.00 VND 110.00'),
    line(4,440,'payment;'),
    line(5,420,'AMOUNT TO BE SPENT TO HAVE NEXT YEAR ANNUAL FEE WAIVED'),
  ]}]};
  const result=getParser('VPBANK').parse(extracted);
  assert.equal(result.parser.version,'2.0.0');
  assert.equal(result.transactions.length,3);
  assert.deepEqual(result.transactions.map(row=>row.rawData.transactionType),['purchase','fee','payment']);
  assert.equal(result.transactions[1].feeAmount,'10.00');
  assert.equal(result.transactions[1].rawData.parentSourceRow,1);
  assert.equal(result.transactions[2].description,'Credit Account I2B payment;');
  assert.equal(result.reconciliation.isBalanced,true);
  assert.deepEqual(result.transactions[0].rawData.sourceAnchor,{page:1,x:62,y:500,width:500,height:14});
});
test('expense migration contains preview, commit and audit tables',()=>{const sql=fs.readFileSync(path.join(__dirname,'../src/database/migrations/041_expense_statement_imports.sql'),'utf8');for(const table of ['expense_bank_accounts','expense_statement_imports','expense_statement_draft_transactions','expense_transactions','expense_audit_logs'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`))});
test('expense permissions are exposed in permission catalog',()=>{const {ALL_PERMISSIONS}=require('../src/modules/auth/permissions');for(const permission of ['expenses.view','expenses.import','expenses.review','expenses.config','expenses.manage'])assert.ok(ALL_PERMISSIONS.includes(permission))});
test('expense routes expose account declaration behind config permission',()=>{const source=fs.readFileSync(path.join(__dirname,'../src/routes/expenseRoutes.js'),'utf8');assert.match(source,/router\.post\('\/accounts',requirePermission\('expenses\.config','expenses\.manage'\)/)});
test('expense imports can be deleted only before commit',()=>{const routes=fs.readFileSync(path.join(__dirname,'../src/routes/expenseRoutes.js'),'utf8');const repository=fs.readFileSync(path.join(__dirname,'../src/modules/expenses/statementImportRepository.js'),'utf8');assert.match(routes,/router\.delete\('\/imports\/:id'/);assert.match(repository,/if\(item\.status==='committed'\)return\{protected:true/);assert.match(repository,/DELETE FROM expense_statement_imports WHERE id=\$1/)});
test('confirmed transaction list joins bank account and committed import',()=>{const routes=fs.readFileSync(path.join(__dirname,'../src/routes/expenseRoutes.js'),'utf8');const repository=fs.readFileSync(path.join(__dirname,'../src/modules/expenses/statementImportRepository.js'),'utf8');assert.match(routes,/router\.get\('\/transactions'/);assert.match(repository,/FROM expense_transactions t JOIN expense_statement_imports i/);assert.match(repository,/JOIN expense_bank_accounts a ON a\.id=t\.bank_account_id/);assert.match(repository,/i\.status='committed'/)});
test('statement source can be proxied through the authenticated API for PDF.js',()=>{const routes=fs.readFileSync(path.join(__dirname,'../src/routes/expenseRoutes.js'),'utf8');const storage=fs.readFileSync(path.join(__dirname,'../src/services/storageService.js'),'utf8');assert.match(routes,/router\.get\('\/imports\/:id\/source'/);assert.match(storage,/async function downloadBuffer/)});
test('VIB statement source viewer focuses the persisted Excel source row',()=>{const page=fs.readFileSync(path.join(__dirname,'../frontend/src/features/expenses/pages/BankTransactionsPage.jsx'),'utf8');const viewer=fs.readFileSync(path.join(__dirname,'../frontend/src/features/expenses/components/VibStatementViewer.jsx'),'utf8');assert.match(page,/VibStatementViewer rows=\{preview\.rows\} sourceRow=\{preview\.sourceRow\}/);assert.match(viewer,/scrollIntoView/);assert.match(viewer,/Number\(row\.source_row\) === Number\(sourceRow\)/)});
test('expense classifier allocates fees by merchant keyword or by their linked original transaction',()=>{const {classifyExpense,classifyRows}=require('../src/modules/expenses/expenseClassifier');assert.equal(classifyExpense({description:'FACEBK *ABC',fee_amount:0}).subcategory,'Facebook Ads');const merchantFee=classifyExpense({description:'PHI GIAO DICH FACEBK *ABC',fee_amount:100});assert.equal(merchantFee.subcategory,'Facebook Ads');assert.equal(merchantFee.costNature,'fee');assert.equal(classifyExpense({description:'SMS Fee',fee_amount:100}).subcategory,'Phí giao dịch độc lập');const rows=classifyRows([{description:'Mua Hàng / 9PAY*TIKTOK?ADS',source_page:1,source_row:10,fee_amount:0},{description:'Phí giao dịch',source_page:1,source_row:11,fee_amount:100,raw_data:{parentSourcePage:1,parentSourceRow:10}}]);assert.equal(rows[1].classification.subcategory,'TikTok Ads');assert.equal(rows[1].classification.costNature,'fee')});
test('cost classification migration keeps required groups and fee inheritance',()=>{const sql=fs.readFileSync(path.join(__dirname,'../src/database/migrations/042_expense_cost_classification.sql'),'utf8');for(const label of ['Facebook Ads','Google Ads','TikTok Ads','Cốc Cốc Ads','Chi tiêu cá nhân','Chi phí khác'])assert.match(sql,new RegExp(label));assert.match(sql,/parentSourceRow/)});
test('fee classification separates fee nature from its allocated expense group',()=>{const {classifyExpense,classifyRows}=require('../src/modules/expenses/expenseClassifier');assert.equal(classifyExpense({description:'VAT',fee_amount:650}).feeType,'Thuế VAT');assert.equal(classifyExpense({description:'Phí Quản Lý Giao Dịch VND Tại Nước Ngoài',fee_amount:5500}).feeType,'Phí giao dịch VND tại nước ngoài');const rows=classifyRows([{description:'FACEBK *ABC',source_page:1,source_row:10,debit_amount:100000},{description:'PHI GIAO DICH NOI TE O NUOC NGOAI',source_page:1,source_row:11,fee_amount:5500,raw_data:{parentSourcePage:1,parentSourceRow:10}}]);assert.equal(rows[1].classification.subcategory,'Facebook Ads');assert.equal(rows[1].classification.feeType,'Phí xử lý giao dịch quốc tế')});
test('fee type migration backfills the supported bank fee families',()=>{const sql=fs.readFileSync(path.join(__dirname,'../src/database/migrations/044_expense_fee_types.sql'),'utf8');for(const label of ['Phí giao dịch VND tại nước ngoài','Phí chuyển đổi ngoại tệ','Phí xử lý giao dịch quốc tế','Thuế VAT','Phí SMS','Phí thường niên','Phí khác'])assert.match(sql,new RegExp(label))});
test('expense dashboard is a separate route with monthly, category, bank and fee reporting',()=>{const routes=fs.readFileSync(path.join(__dirname,'../src/routes/expenseRoutes.js'),'utf8');const repository=fs.readFileSync(path.join(__dirname,'../src/modules/expenses/statementImportRepository.js'),'utf8');const app=fs.readFileSync(path.join(__dirname,'../frontend/src/App.jsx'),'utf8');assert.match(routes,/router\.get\('\/dashboard'/);for(const section of ['monthly','categories','banks','fees','topTransactions'])assert.match(repository,new RegExp(section));assert.match(app,/path="\/expenses\/dashboard"/)});
test('expense dashboard separates fee types while preserving their allocation target',()=>{const page=fs.readFileSync(path.join(__dirname,'../frontend/src/features/expenses/pages/ExpenseDashboardPage.jsx'),'utf8');assert.match(page,/Phân loại và phân bổ phí giao dịch/);assert.match(page,/fee_type/);assert.match(page,/Phí được tách khỏi chi phí gốc/)});
test('expense import persists header and draft rows atomically with R2 compensation',()=>{const repository=fs.readFileSync(path.join(__dirname,'../src/modules/expenses/statementImportRepository.js'),'utf8');const service=fs.readFileSync(path.join(__dirname,'../src/modules/expenses/statementImportService.js'),'utf8');assert.match(repository,/createWithDrafts\(data,rows\).*db\.transaction/);assert.match(service,/repository\.createWithDrafts/);assert.match(service,/Cannot compensate R2 upload after DB failure/)});
test('edited drafts are normalized and reconciled again before commit',()=>{const repository=fs.readFileSync(path.join(__dirname,'../src/modules/expenses/statementImportRepository.js'),'utf8');const service=fs.readFileSync(path.join(__dirname,'../src/modules/expenses/statementImportService.js'),'utf8');const page=fs.readFileSync(path.join(__dirname,'../frontend/src/features/expenses/pages/BankStatementImportsPage.jsx'),'utf8');assert.match(repository,/parsedDebitCents/);assert.match(repository,/item\.status!==\'ready_for_review\'/);assert.match(repository,/expectedDebit==null\|\|expectedCredit==null/);assert.match(service,/normalizeDescription\(description\)/);assert.match(page,/selected\.status !== 'ready_for_review'/)});
test('expense dashboard builds report dates in local time instead of UTC ISO conversion',()=>{const page=fs.readFileSync(path.join(__dirname,'../frontend/src/features/expenses/pages/ExpenseDashboardPage.jsx'),'utf8');assert.match(page,/const localIsoDate/);assert.doesNotMatch(page,/toISOString\(\)\.slice\(0,\s*10\)/)});
test('selected bank account is authoritative even when a statement contains other cards',()=>{const service=fs.readFileSync(path.join(__dirname,'../src/modules/expenses/statementImportService.js'),'utf8');assert.doesNotMatch(service,/validateParsedAccount/);assert.match(service,/detectedAccountNumber:result\.statement\?\.accountNumberMasked/)});
test('statement review compares decimal totals without floating point false mismatches',()=>{const source=fs.readFileSync(path.join(__dirname,'../frontend/src/features/expenses/pages/BankStatementImportsPage.jsx'),'utf8');assert.match(source,/Math\.round\(Number\(row\[key\]/);assert.match(source,/Math\.abs\(Number\(statementValue\) - Number\(detectedValue\)\) < 0\.005/)});

test('Techcombank fee row inherits transaction date but keeps its printed post date',()=>{
  const parser=getParser('TECHCOMBANK');
  const extracted={text:'TECHCOMBANK SAO KÊ TÀI KHOẢN THẺ TÍN DỤNG',pages:[{number:1,text:'TECHCOMBANK SAO KÊ TÀI KHOẢN THẺ TÍN DỤNG',lines:[
    {row:18,y:500,items:[{x:40,width:600}],text:'06/05/2026 07/05/2026 5,439,852 VND 5,439,852 Giao dịch thanh toán/Purchase - merchant'},
    {row:20,y:470,items:[{x:40,width:620}],text:'07/05/2026 5,439,852 VND 59,838 PHI GIAO DICH NOI TE O NUOC NGOAI - merchant'},
  ]}]};
  const result=parser.parse(extracted);
  assert.equal(result.transactions[1].transactionDate,'2026-05-06');
  assert.equal(result.transactions[1].postingDate,'2026-05-07');
  assert.equal(result.transactions[1].debitAmount,'59838.00');
  assert.equal(result.transactions[1].feeAmount,'59838.00');
  assert.equal(result.transactions[1].rawData.transactionType,'fee');
  assert.equal(result.transactions[1].rawData.parentSourceRow,18);
  assert.equal(result.transactions[1].rawData.transactionDateInherited,true);
  assert.deepEqual(result.transactions[1].rawData.sourceAnchor,{page:1,x:40,y:470,width:620,height:18});
});

test('Techcombank reads reconciliation totals from a later PDF page',()=>{
  const parser=getParser('TECHCOMBANK');
  const firstText='TECHCOMBANK SAO KÊ TÀI KHOẢN THẺ TÍN DỤNG\nSố dư kỳ trước (VND) Previous Balance: -30,569,659';
  const summaryText='Tổng ghi nợ trong kỳ Total Debit in period: 264,653,407\nTổng ghi có trong kỳ Total Credit in period: 175,000,000\nSố dư cần thanh toán(VND) Outstanding Balance: -120,223,066';
  const extracted={text:`${firstText}\n${summaryText}`,pages:[
    {number:1,text:firstText,lines:[]},
    {number:5,text:summaryText,lines:[]},
  ]};
  const result=parser.parse(extracted);
  assert.equal(result.statement.openingBalance,'30569659.00');
  assert.equal(result.statement.closingBalance,'120223066.00');
  assert.equal(result.statement.totalDebit,'264653407.00');
  assert.equal(result.statement.totalCredit,'175000000.00');
});

test('missing statement totals cannot be treated as balanced',()=>{
  const {buildResult}=require('../src/modules/expenses/parsers/parserUtils');
  const result=buildResult('TECHCOMBANK','test',{totalDebit:null,totalCredit:null},[]);
  assert.equal(result.reconciliation.isBalanced,false);
});
