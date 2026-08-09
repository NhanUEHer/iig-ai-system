const test=require('node:test');
const assert=require('node:assert/strict');
const {calculate,validateWorkspace}=require('../src/modules/reports/manualReportCalculator');

test('revenue summary keeps manually entered KPI values',()=>{
  const result=calculate('REV',[{revenue:100,order_count:4},{revenue:50,order_count:1}],{DT_02:500,DT_06:3});
  assert.deepEqual(result,{DT_02:500,DT_06:3});
});

test('manual Ads and communication entry uses ratio of sums',()=>{
  const ads=calculate('ADS',[{budget_actual:20,lead_count:10,order_count:2,revenue:100},{budget_actual:10,lead_count:5,order_count:1,revenue:50}],{});
  assert.equal(ads.ADS_04,0.2);assert.equal(ads.ADS_06,0.2);assert.equal(ads.ADS_07,50);
  const communication=calculate('COM',[{followers_current:110,followers_previous:100,reach_current:1000,engagement_count:10},{followers_current:55,followers_previous:50,reach_current:100,engagement_count:10}],{});
  assert.ok(Math.abs(communication.TT_02-0.1)<1e-12);assert.equal(communication.TT_05,20/1100);
});

test('manual validation distinguishes required fields, negative values and warnings',()=>{
  const result=validateWorkspace([{code:'K1',target_value:10,actual_value:null,evaluation_direction:'increase_good'}],[{name:'',amount:-1}],[['name','Tên','text',null,true],['amount','Số lượng','number']]);
  assert.equal(result.errors.length,2);assert.equal(result.warnings.length,1);
});

test('empty detail does not create false zero KPI results',()=>{
  assert.deepEqual(calculate('ADS',[],{}),{});
});
