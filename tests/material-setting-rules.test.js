const test=require('node:test');
const assert=require('node:assert/strict');
const {DEFAULTS,validate,evaluateTrend}=require('../src/modules/content-sources/materialSettingService');

test('material settings require difficulty percentages to total one hundred',()=>{
  assert.throws(()=>validate({...DEFAULTS,difficultyMix:{BASIC:40,INTERMEDIATE:40,ADVANCED:10}}),error=>error.code==='MATERIAL_SETTING_DIFFICULTY');
  assert.deepEqual(validate(DEFAULTS).difficultyMix,{BASIC:30,INTERMEDIATE:50,ADVANCED:20});
});

test('material rule accepts a recent confirmed trend that meets thresholds',()=>{
  const trend={skill:'SPEAKING',questionGroup:'Q11',trendType:'REPEATED_PROMPT',sourceCount:3,confidence:.9,lastSeenAt:'2026-09-01'};
  const result=evaluateTrend(trend,DEFAULTS,new Date('2026-09-09T00:00:00Z'));
  assert.equal(result.eligible,true);assert.equal(result.priority,'HIGH');assert.ok(result.recommendedMaterials.some(item=>item.type==='FULL_MOCK_TEST'));
});

test('material rule explains every failed gate',()=>{
  const trend={skill:'SPEAKING',questionGroup:'Q11',trendType:'SINGLE_SIGNAL',sourceCount:1,confidence:.4,lastSeenAt:'2025-01-01'};
  const result=evaluateTrend(trend,DEFAULTS,new Date('2026-09-09T00:00:00Z'));
  assert.equal(result.eligible,false);assert.ok(result.exclusionReasons.length>=4);assert.deepEqual(result.recommendedMaterials,[]);
});
