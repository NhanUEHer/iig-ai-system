const test=require('node:test');
const assert=require('node:assert/strict');
const {enrichKpiHistory,enrichSocialHistory,applyComKpiFallback}=require('../src/modules/reports/reportHistoryMetrics');

test('KPI history uses current historical periods and falls back to imported snapshots',()=>{
  const rows=[{team_code:'COM',code:'TT_01',actual_value:120,previous_value:90,prior_year_value:70}];
  const history=[{source_period:'previous',team_code:'COM',code:'TT_01',actual_value:100}];
  const [result]=enrichKpiHistory(rows,history);
  assert.equal(result.previous_value,100);
  assert.equal(result.prior_year_value,70);
  assert.equal(result.vs_previous,0.2);
});

test('missing KPI history remains null and is never converted to zero',()=>{
  const [result]=enrichKpiHistory([{team_code:'REV',code:'DT_01',actual_value:10,previous_value:null}],[]);
  assert.equal(result.previous_value,null);
  assert.equal(result.vs_previous,null);
});

test('social history preserves imported baselines until a previous period exists',()=>{
  const rows=[{channel_code:'FB',followers_previous:90,reach_previous:900}];
  assert.deepEqual(enrichSocialHistory(rows,[])[0],rows[0]);
  const [updated]=enrichSocialHistory(rows,[{channel_code:'FB',followers_current:100,reach_current:1000}]);
  assert.equal(updated.followers_previous,100);
  assert.equal(updated.reach_previous,1000);
});

test('COM KPI fallback aggregates previous followers and reach from detail rows',()=>{
  const result=applyComKpiFallback([{code:'TT_01',previous_value:null},{code:'TT_03',previous_value:null}],
    [{followers_previous:10,reach_previous:100},{followers_previous:20,reach_previous:200}]);
  assert.equal(result[0].previous_value,30);
  assert.equal(result[1].previous_value,300);
});
