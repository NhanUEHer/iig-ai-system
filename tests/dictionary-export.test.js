const test=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const JSZip=require('jszip');
const {createWorkbook,normalizeEntries}=require('../src/modules/dictionary/dictionaryExporter');

const candidate={
  status:'completed',originalChunk:'applicable',canonical:'applicable',partOfSpeech:'Adjective',ipa:'/ˈæplɪkəbəl/',
  meaningVi:'có thể áp dụng, phù hợp',meaningEn:'something that is relevant and can be used in a situation',
  originalSentence:'What is the most applicable strategy you gained from the workshop?',
  contextExplanation:'Trong ngữ cảnh bài đọc, applicable strategy nghĩa là chiến lược hữu ích nhất.',
  exampleEn:'The new policy is applicable to all employees.',exampleVi:'Chính sách mới có thể áp dụng cho tất cả nhân viên.',
  collocations:['applicable strategy – chiến lược có thể áp dụng','applicable rules – các quy tắc được áp dụng'],
  synonyms:['relevant','suitable','usable'],wordFamily:'apply - application - applicable'
};

test('dictionary Excel maps rich content to the import template',async()=>{
  const values=normalizeEntries([candidate])[0];
  assert.equal(values[6],'Câu gốc trong bài:\n“What is the most APPLICABLE strategy you gained from the workshop?”\n→ Trong ngữ cảnh bài đọc, applicable strategy nghĩa là chiến lược hữu ích nhất.');
  assert.equal(values[7],'The new policy is applicable to all employees.\n→ Chính sách mới có thể áp dụng cho tất cả nhân viên.');
  assert.equal(values[8],'applicable strategy – chiến lược có thể áp dụng\napplicable rules – các quy tắc được áp dụng');
  assert.equal(values[9],'relevant, suitable, usable');
  assert.equal(values[10],'apply – application – applicable');

  const buffer=await createWorkbook([candidate]);
  const workbook=XLSX.read(buffer,{type:'buffer'}),sheet=workbook.Sheets.Template;
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false});
  assert.equal(rows[0].length,12);
  assert.deepEqual(rows[1].slice(0,11),values.slice(0,11));
  const zip=await JSZip.loadAsync(buffer),sheetXml=await zip.file('xl/worksheets/sheet1.xml').async('string'),stylesXml=await zip.file('xl/styles.xml').async('string');
  assert.match(sheetXml,/sqref="C2:C1000"/);
  assert.match(sheetXml,/ref="A1:L2"/);
  const height=Number(sheetXml.match(/<(?:x:)?row r="2" ht="(\d+)"/)?.[1]);
  assert.ok(height>72&&height<=300);
  assert.match(stylesXml,/wrapText="1"/);
});
