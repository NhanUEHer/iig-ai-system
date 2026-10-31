const test=require('node:test');
const assert=require('node:assert/strict');
const {buildAdsDashboard}=require('../src/modules/reports/reportAdsDashboard');

test('buildAdsDashboard aggregates channel and product performance',()=>{
  const result=buildAdsDashboard({period:{year:2026,month:10},kpis:[],details:[
    {traffic_source:'Facebook',budget_target:100,budget_actual:120,lead_count:20,order_count:2,revenue:400,previous_revenue:300},
    {traffic_source:'Google',budget_target:100,budget_actual:80,lead_count:10,order_count:3,revenue:500,previous_revenue:400}
  ],detailSections:[{key:'adsProducts',rows:[{product_name:'A',ad_cost:120,revenue:500,lead_count:12,qualified_lead_count:8,order_count:3}]}]});
  assert.equal(result.metrics.spend.value,200);
  assert.equal(result.metrics.closingRate.value,5/30);
  assert.equal(result.channels[0].name,'Google');
  assert.equal(result.products[0].roas,500/120);
  assert.equal(result.insights[0].tone,'danger');
  assert.equal(result.metrics.cpl.value,200/30);
  assert.equal(result.metrics.cpa.value,40);
  assert.equal(result.metrics.roas.value,900/200);
  assert.equal(result.metrics.qualifiedLeads.value,8);
  assert.equal(result.reconciliation.channelRevenue,900);
  assert.equal(result.reconciliation.productRevenue,500);
  assert.equal(result.reconciliation.hasRevenueMismatch,true);
  assert.equal(result.channels[0].status.key,'efficient');
});

test('buildAdsDashboard flags a lead-quality conversion risk',()=>{
  const result=buildAdsDashboard({period:{year:2026,month:9},kpis:[
    {code:'ADS_02',previous_value:100},
    {code:'ADS_03',previous_value:30},
    {code:'ADS_01',previous_value:1000}
  ],details:[
    {traffic_source:'TikTok',budget_target:100,budget_actual:100,lead_count:120,order_count:20,revenue:800}
  ],detailSections:[]});
  assert.equal(result.businessSummary.hasLeadQualityRisk,true);
  assert.match(result.businessSummary.message,/chất lượng lead/);
  assert.equal(result.metrics.qualifiedLeads.coverage,'none');
});
