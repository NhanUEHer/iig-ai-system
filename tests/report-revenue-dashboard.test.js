const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildRevenueDashboard}=require('../src/modules/reports/reportRevenueDashboard');

test('revenue dashboard keeps headline, contribution and waterfall totals consistent',()=>{
  const result=buildRevenueDashboard({dashboard:{period:{year:2026,month:10},kpis:[
    {code:'DT_01',actual_value:128,target_value:140,previous_value:120,prior_year_value:110},
    {code:'DT_03',actual_value:12,previous_value:10},
    {code:'DT_04',actual_value:10.67,previous_value:12}
  ],details:[
    {row_key:'A',product_group:'TOEIC',product_name:'LR',revenue:80,monthly_target:75,previous_revenue:60,prior_year_revenue:55,order_count:7},
    {row_key:'B',product_group:'TOEFL',product_name:'iBT',revenue:48,monthly_target:65,previous_revenue:60,prior_year_revenue:55,order_count:5}
  ]},monthly:[{year:2026,month:10,actual:128,target:140}]});
  assert.equal(result.metrics.revenue.value,128);
  assert.equal(result.metrics.completion.value,128/140);
  assert.equal(result.groups.reduce((sum,item)=>sum+item.revenue,0),128);
  assert.equal(result.waterfall.start+result.waterfall.steps.reduce((sum,item)=>sum+item.value,0),result.waterfall.end);
  assert.deepEqual(result.waterfall.steps.map(item=>item.name),['LR','iBT']);
  assert.equal(result.monthly[0].completion,128/140);
  assert.equal(result.products.length,2);
  assert.deepEqual(result.products.map(item=>item.orders),[7,5]);
  assert.equal(result.topProducts[0].name,'LR');
  assert.equal(result.products[0].averageOrder,80/7);
  assert.equal(result.products[0].priorYearChange,(80-55)/55);
  assert.equal(result.products[0].status.code,'growth');
  assert.equal(result.products[1].status.code,'below_plan');
  assert.equal(result.businessSummary.decliningCount,1);
  assert.equal(result.businessSummary.belowPlanCount,1);
  assert.match(result.insights[0].detail,/triệu|tỷ|đ/);
  assert.doesNotMatch(result.insights[0].detail,/\b80000000\b/);
});

test('revenue dashboard endpoint requires report view permission',()=>{
  const routes=fs.readFileSync(path.join(__dirname,'../src/routes/reportRoutes.js'),'utf8');
  assert.match(routes,/router\.get\('\/dashboard\/revenue',requirePermission\('reports\.view'\)/);
});
