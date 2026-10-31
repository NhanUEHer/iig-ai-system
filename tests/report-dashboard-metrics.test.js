const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeKpis,buildInsights}=require('../src/modules/reports/reportDashboardMetrics');
const fs=require('node:fs');
const path=require('node:path');

test('dashboard summary keeps missing and monitored KPIs explicit',()=>{
  const summary=summarizeKpis([
    {code:'A',target_value:100,actual_value:100,previous_value:80,prior_year_value:50,evaluation_direction:'increase_good'},
    {code:'B',target_value:100,actual_value:null,evaluation_direction:'increase_good'},
    {code:'C',target_value:100,actual_value:90,evaluation_direction:'monitor'}
  ]);
  assert.equal(summary.total,3);
  assert.equal(summary.good,1);
  assert.equal(summary.missing,2);
  assert.equal(summary.monitored,1);
  assert.equal(summary.achievement,1);
  assert.ok(Math.abs(summary.previousChange-0.2)<Number.EPSILON*2);
});

test('dashboard insights prioritize risk and adverse movement',()=>{
  const insights=buildInsights([
    {team_code:'REV',code:'REV_1',name:'Doanh thu',target_value:100,actual_value:70,previous_value:100,evaluation_direction:'increase_good'},
    {team_code:'ADS',code:'ADS_1',name:'Chi phí',target_value:80,actual_value:120,previous_value:90,evaluation_direction:'decrease_good'}
  ]);
  assert.ok(insights.some(item=>item.kpiCode==='REV_1'&&item.type==='below_target'));
  assert.ok(insights.some(item=>item.kpiCode==='ADS_1'&&item.type==='negative_trend'));
  assert.equal(insights[0].severity,'critical');
});

test('dashboard insight and data-quality routes require report view permission',()=>{
  const routes=fs.readFileSync(path.join(__dirname,'../src/routes/reportRoutes.js'),'utf8');
  assert.match(routes,/router\.get\('\/dashboard\/insights',requirePermission\('reports\.view'\)/);
  assert.match(routes,/router\.get\('\/dashboard\/data-quality',requirePermission\('reports\.view'\)/);
});
