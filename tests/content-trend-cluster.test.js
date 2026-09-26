const test=require('node:test');
const assert=require('node:assert/strict');
const {similarity,cluster}=require('../src/modules/content-sources/trendClusterService');

const item=(sourceId,topic,prompt)=>({id:`analysis-${sourceId}`,source_id:sourceId,analysis:{examContext:{examDate:'2026-05-20'},recalledItems:[{skill:'SPEAKING',questionNumbers:'Q11',taskType:'EXPRESS_OPINION',topic,promptRecall:prompt,candidateResponse:'',confidence:.9,evidence:prompt}]}});

test('similarity requires the same skill and question group',()=>{
  const left={skill:'SPEAKING',questionNumbers:'Q11',taskType:'EXPRESS_OPINION',topic:'exercise alone',promptRecall:'disadvantages of exercising alone'};
  assert.ok(similarity(left,{...left,promptRecall:'What are disadvantages of exercising alone?'})>=.8);
  assert.equal(similarity(left,{...left,questionNumbers:'Q7'}),0);
});

test('two independent approved sources confirm a repeated prompt cluster',()=>{
  const result=cluster([item('source-a','Exercise alone','Disadvantages of exercising alone'),item('source-b','Exercising alone','What are the disadvantages of exercising alone?')]);
  assert.equal(result.length,1);
  assert.equal(result[0].sourceCount,2);
  assert.equal(result[0].verificationStatus,'CONFIRMED');
  assert.equal(result[0].trendType,'REPEATED_PROMPT');
});

test('one source remains an unverified signal',()=>{
  const result=cluster([item('source-a','Exercise alone','Disadvantages of exercising alone')]);
  assert.equal(result[0].verificationStatus,'UNVERIFIED');
  assert.equal(result[0].sourceCount,1);
});
