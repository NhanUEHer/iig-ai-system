const test=require('node:test');
const assert=require('node:assert/strict');
const {validateAnalysis}=require('../src/modules/content-sources/contentSourceService');
const fs=require('node:fs');
const path=require('node:path');

const base=()=>({
  classification:{contentType:'POST_EXAM_RECALL',exam:'TOEIC',skills:['SPEAKING'],isRelevant:true,relevanceScore:.9,evidence:'Em thi buổi tối ngày 20/05'},
  examContext:{examDate:'2026-05-20',examSession:'EVENING',location:null,actualScores:[],evidence:'Em thi buổi tối ngày 20/05'},
  recalledItems:[],performanceSignals:[],trendSignals:[],insights:[],materialRecommendations:[],uncertainties:[]
});

test('content analysis keeps only claims backed by exact normalized source evidence',()=>{
  const analysis=base();
  analysis.recalledItems=[
    {skill:'SPEAKING',questionNumbers:'Q11',taskType:'OPINION',topic:'Exercise',promptRecall:'Disadvantages',candidateResponse:'',confidence:.9,evidence:'There are several disadvantages when exercising alone'},
    {skill:'WRITING',questionNumbers:'Q8',taskType:'ESSAY',topic:'Remote work',promptRecall:'Invented',candidateResponse:'',confidence:.9,evidence:'This sentence never appeared'}
  ];
  const checked=validateAnalysis('Em thi buổi tối ngày 20/05.\nThere are several disadvantages   when exercising alone.',analysis);
  assert.equal(checked.analysis.recalledItems.length,1);
  assert.equal(checked.analysis.recalledItems[0].questionNumbers,'Q11');
  assert.ok(checked.metadata.rejectedEvidence>=1);
});

test('one-source trend cannot be persisted as verified',()=>{
  const analysis=base();analysis.trendSignals=[{signalType:'REPEAT',finding:'Có tín hiệu lặp',verificationStatus:'VERIFIED',confidence:.8,evidence:'nó y chang đề ngày 20/05'}];
  const checked=validateAnalysis('Em coi lại thì nó y chang đề ngày 20/05.',analysis);
  assert.equal(checked.analysis.trendSignals[0].verificationStatus,'UNVERIFIED');
});

test('phase one exposes exactly the three simple review labels',()=>{
  const migration=fs.readFileSync(path.join(__dirname,'../src/database/migrations/059_content_analysis_review_labels.sql'),'utf8');
  assert.match(migration,/APPROVED/);assert.match(migration,/NEEDS_REVIEW/);assert.match(migration,/REJECTED/);
  const route=fs.readFileSync(path.join(__dirname,'../src/routes/contentSourceRoutes.js'),'utf8');
  assert.match(route,/analyses\/:analysisId\/review/);
});
