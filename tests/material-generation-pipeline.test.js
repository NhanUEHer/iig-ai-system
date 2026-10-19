const test=require('node:test');
const assert=require('node:assert/strict');
const {planBatches}=require('../src/modules/content-sources/materialGenerationPlanner');
const {templateCode,buildPrompt}=require('../src/modules/content-sources/materialPromptRegistry');
const {validateGeneratedContent}=require('../src/modules/content-sources/materialContentValidator');

const item={materialType:'SKILL_DRILL',skill:'SPEAKING',quantity:10,difficultyMix:{BASIC:30,INTERMEDIATE:50,ADVANCED:20}};
test('routes each material to a versioned specialized prompt',()=>{
  assert.equal(templateCode(item),'speaking_skill_drill_v2');
  const batch=planBatches(item)[0],result=buildPrompt({blueprint:{},item,trends:[],batch});
  assert.equal(result.version,'material-v2');
  assert.match(result.prompt,/QUY CHUẨN KỸ NĂNG/);
  assert.match(result.prompt,/sample answer/i);
});

test('splits large drills into deterministic small batches',()=>{
  const batches=planBatches(item);
  assert.equal(batches.length,2);
  assert.deepEqual(batches.map(batch=>batch.quantity),[5,5]);
});

test('code validator rejects incomplete or wrong-size output',()=>{
  const content={sections:[{questions:[{prompt:'Question',context:'',difficulty:'BASIC',options:['A','B'],correctAnswer:'A',explanation:'',sampleAnswer:'Answer',rubric:['Clear']}],vocabulary:[]}]};
  const result=validateGeneratedContent(content,item,5,{BASIC:1,INTERMEDIATE:3,ADVANCED:1});
  assert.equal(result.valid,false);
  assert.ok(result.issues.some(issue=>issue.code==='QUANTITY_MISMATCH'));
  assert.ok(result.issues.some(issue=>issue.code==='MISSING_EXPLANATION'));
});
