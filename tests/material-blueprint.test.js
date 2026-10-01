const test=require('node:test');
const assert=require('node:assert/strict');
const {buildItems,validateItems,validateDifficulty}=require('../src/modules/content-sources/materialBlueprintService');

const settings={enabledMaterialTypes:['SKILL_DRILL','FULL_MOCK_TEST'],materialQuantities:{SKILL_DRILL:10,FULL_MOCK_TEST:1},difficultyMix:{BASIC:30,INTERMEDIATE:50,ADVANCED:20},instructionLanguage:'BILINGUAL',targetScores:{LISTENING_READING:'450-850',SPEAKING_WRITING:'120-160'},maximumSourceSimilarity:.65};
const trends=[
  {id:'trend-speaking',skill:'SPEAKING',questionGroup:'Q11',topic:'Working remotely'},
  {id:'trend-writing',skill:'WRITING',questionGroup:'Q8',topic:'Office policy'}
];

test('blueprint splits skill drills while keeping one full mock scope',()=>{
  const items=buildItems(trends,settings);
  const drills=items.filter(item=>item.materialType==='SKILL_DRILL');
  const mocks=items.filter(item=>item.materialType==='FULL_MOCK_TEST');
  assert.equal(drills.length,2);
  assert.equal(drills.reduce((sum,item)=>sum+item.quantity,0),10);
  assert.deepEqual(drills.map(item=>item.quantity),[5,5]);
  assert.equal(mocks.length,1);
  assert.equal(mocks[0].sourceTrendIds.length,2);
  assert.equal(mocks[0].generationConstraints.mustCreateOriginalContent,true);
});

test('blueprint item validation requires production-ready content',()=>{
  assert.throws(()=>validateItems([]),/ít nhất một hạng mục/);
  assert.throws(()=>validateItems([{materialType:'SKILL_DRILL',title:'',objective:'Mục tiêu',quantity:1}]),/không được để trống/);
  assert.throws(()=>validateItems([{materialType:'UNKNOWN',title:'Tên',objective:'Mục tiêu',quantity:1}]),/không hợp lệ/);
});

test('blueprint difficulty must remain a complete one hundred percent mix',()=>{
  assert.deepEqual(validateDifficulty({BASIC:30,INTERMEDIATE:50,ADVANCED:20}),{BASIC:30,INTERMEDIATE:50,ADVANCED:20});
  assert.throws(()=>validateDifficulty({BASIC:20,INTERMEDIATE:20,ADVANCED:20}),/100%/);
});
