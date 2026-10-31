const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCommunicationDashboard}=require('../src/modules/reports/reportCommunicationDashboard');

test('buildCommunicationDashboard aggregates social channels and history',()=>{
  const result=buildCommunicationDashboard({dashboard:{period:{year:2026,month:10},kpis:[{code:'TT_05',actual_value:.05}],details:[{channel_name:'Facebook',followers_current:120,followers_previous:100,reach_current:500,reach_previous:600,video_views:80,engagement_count:25,engagement_rate:.05,lead_count:4},{channel_name:'TikTok',followers_current:80,followers_previous:70,reach_current:300,reach_previous:200,video_views:120,engagement_count:18,engagement_rate:.06,lead_count:5}]},monthly:[{year:2026,month:9,followers:170,reach:800}]});
  assert.equal(result.metrics.followers.value,200);
  assert.equal(result.metrics.reach.value,800);
  assert.equal(result.channels[0].name,'Facebook');
  assert.equal(result.monthly[0].followers,170);
  assert.equal(result.metrics.leads.rateFromReach,9/800);
  assert.equal(result.channels[0].leadRate,4/500);
  assert.equal(result.businessSummary.topTwoReachShare,1);
  assert.ok(result.insights.some(item=>item.type==='concentration'));
});

test('buildCommunicationDashboard detects conversion and data-quality risks',()=>{
  const result=buildCommunicationDashboard({dashboard:{period:{year:2026,month:9},kpis:[
    {code:'TT_07',previous_value:100}
  ],details:[
    {channel_name:'Facebook',reach_current:1200,reach_previous:1000,engagement_count:120,lead_count:70},
    {channel_name:'Khác',reach_current:0,reach_previous:0,engagement_count:0,lead_count:10}
  ]},monthly:[]});
  assert.equal(result.businessSummary.hasConversionRisk,true);
  assert.equal(result.businessSummary.missingReachChannels,1);
  assert.equal(result.channels.find(item=>item.name==='Khác').dataQuality.key,'missing_reach');
  assert.ok(result.insights.some(item=>item.type==='conversion'));
  assert.ok(result.insights.some(item=>item.type==='data_quality'));
});
