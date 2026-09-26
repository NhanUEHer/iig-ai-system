const test=require('node:test');
const assert=require('node:assert/strict');
const {validateContent}=require('../src/modules/content-sources/generatedMaterialService');
const {generatedMaterialSchema}=require('../src/clients/geminiContentClient');

test('generated material requires at least one structured section',()=>{
  assert.throws(()=>validateContent({title:'Empty',sections:[]}),/ít nhất một phần/);
  const content={title:'Drill',sections:[{title:'Part 1',questions:[]}]};
  assert.equal(validateContent(content),content);
});

test('Gemini material schema requires answer-bearing structured sections',()=>{
  assert.ok(generatedMaterialSchema.required.includes('sections'));
  const section=generatedMaterialSchema.properties.sections.items;
  assert.ok(section.required.includes('questions'));
  const question=section.properties.questions.items;
  assert.ok(question.required.includes('correctAnswer'));
  assert.ok(question.required.includes('explanation'));
});
