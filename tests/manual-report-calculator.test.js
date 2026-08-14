const test=require('node:test');
const assert=require('node:assert/strict');
const {calculate,validateWorkspace,reconcileWorkspace}=require('../src/modules/reports/manualReportCalculator');

test('revenue summary derives auditable KPIs and preserves manual-only values',()=>{
  const result=calculate('REV',[{revenue:100,order_count:4},{revenue:50,order_count:1}],{DT_02:500,DT_06:3});
  assert.deepEqual(result,{DT_02:500,DT_06:3,DT_01:150,DT_03:5,DT_04:30});
});

test('manual Ads entry uses ratio of sums and communication only derives Excel detail totals',()=>{
  const ads=calculate('ADS',[{budget_actual:20,lead_count:10,order_count:2,revenue:100},{budget_actual:10,lead_count:5,order_count:1,revenue:50}],{});
  assert.equal(ads.ADS_04,0.2);assert.equal(ads.ADS_06,0.2);assert.equal(ads.ADS_07,50);
  const communication=calculate('COM',[{followers_current:110,followers_previous:100,reach_current:1000,video_views:20,lead_count:2,revenue:30},{followers_current:55,followers_previous:50,reach_current:100,video_views:5,lead_count:1,revenue:10}],{});
  assert.ok(Math.abs(communication.TT_02-0.1)<1e-12);assert.deepEqual(Object.keys(communication).sort(),['TT_01','TT_02','TT_03','TT_06','TT_07','TT_09']);assert.equal(communication.TT_06,25);
});

test('manual validation distinguishes required fields, negative values and warnings',()=>{
  const result=validateWorkspace([{code:'K1',target_value:10,actual_value:null,evaluation_direction:'increase_good'}],[{name:'',amount:-1}],[['name','Tên','text',null,true],['amount','Số lượng','number']]);
  assert.equal(result.errors.length,2);assert.equal(result.warnings.length,1);
});

test('empty detail does not create false zero KPI results',()=>{
  assert.deepEqual(calculate('ADS',[],{}),{});
});

test('all auditable training and product KPIs derive from detail rows',()=>{
  const training=calculate('TRAIN',[{started_class_count:2,class_count:4,completed_class_count:1,active_student_count:20,new_student_count:5,completed_student_count:3,evaluated_student_count:2,qualified_student_count:1,upsell_revenue:100}],{});
  assert.equal(training.DAO_04,0.5);assert.equal(training.DAO_05,2);assert.equal(training.DAO_06,4);assert.equal(training.DAO_07,1);
  const product=calculate('PROD',[{kpi_code:'SP_02',contribution_value:'0.5'},{kpi_code:'SP_02 · Khóa TOEIC',contribution_value:'0.5'}],{});
  assert.equal(product.SP_02,1);
});

test('cross-section reconciliation ignores Ads cost differences and reports blocking product mappings',()=>{
  const ads=reconcileWorkspace('ADS',[],[{budget_actual:100}],[{ad_cost:90}]);
  assert.equal(ads.errors.length,0);assert.equal(ads.warnings.length,0);
  const product=reconcileWorkspace('PROD',[],[{contribution_value:0.5,kpi_code:null}],[]);
  assert.equal(product.errors.length,1);
});
