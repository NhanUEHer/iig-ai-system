const test=require('node:test');
const assert=require('node:assert/strict');
const JSZip=require('jszip');
const exporter=require('../src/modules/learning-materials/learningMaterialDocumentExporter');

const keyDetail={passage:'The company will roll out a revised policy and improve daily operations.',target_score:500,selection_mode:'balanced',created_by_name:'Nhan.ND',created_at:'2026-08-21T00:00:00Z',vocabularies:[{o:'roll out',t:'roll out',p:'Phrasal Verb',i:'/rəʊl aʊt/',m:'triển khai'}]};
const dictionaryDetail={passage:keyDetail.passage,created_by_name:'Nhan.ND',created_at:keyDetail.created_at,candidates:[{status:'completed',originalChunk:'revised',canonical:'revise',partOfSpeech:'Verb',ipa:'/rɪˈvaɪz/',meaningVi:'chỉnh sửa',meaningEn:'to examine and improve',originalSentence:'The company will roll out a revised policy and improve daily operations.',contextExplanation:'Mô tả chính sách đã được cập nhật.',exampleEn:'We revised the plan.',exampleVi:'Chúng tôi đã sửa kế hoạch.',collocations:['revised policy – chính sách sửa đổi'],synonyms:['amend','edit'],wordFamily:'revision – revised'}]};

test('Word and PDF learning-material templates preserve Vietnamese and structured content',async()=>{
  const docx=await exporter.create('key-vocab','docx',keyDetail),zip=await JSZip.loadAsync(docx),documentXml=await zip.file('word/document.xml').async('string');
  assert.match(documentXml,/KEY VOCAB/);assert.match(documentXml,/roll out/);assert.match(documentXml,/triển khai/);
  const dictionaryDocx=await exporter.create('dictionary','docx',dictionaryDetail),dictionaryZip=await JSZip.loadAsync(dictionaryDocx),dictionaryXml=await dictionaryZip.file('word/document.xml').async('string');
  assert.match(dictionaryXml,/CONTEXTUAL DICTIONARY/);assert.match(dictionaryXml,/Câu gốc trong bài/i);assert.match(dictionaryXml,/Mô tả chính sách đã được cập nhật/);assert.match(dictionaryXml,/w:br/);
  const pdf=await exporter.create('dictionary','pdf',dictionaryDetail);
  assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.ok(pdf.length>1000);
});

test('document export rejects empty completed content',async()=>{
  await assert.rejects(()=>exporter.create('dictionary','pdf',{passage:'source',candidates:[]}),error=>error.code==='EMPTY_DOCUMENT_EXPORT');
});
