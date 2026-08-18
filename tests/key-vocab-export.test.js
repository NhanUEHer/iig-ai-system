const JSZip = require('jszip');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbook } = require('../src/modules/key-vocab/keyVocabExporter');

test('key vocab Excel exports original form before canonical form', async () => {
    const buffer = await createWorkbook([{
      o: 'implemented',
      t: 'implement',
      p: 'Verb',
      i: '/ˈɪmplɪment/',
      m: 'triển khai'
    }]);
    const zip = await JSZip.loadAsync(buffer);
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
    assert.match(sheetXml, /Từ gốc/);
    assert.match(sheetXml, /ref="A1:F2"/);
    assert.match(sheetXml, /<x:c r="A2" s="0" t="inlineStr"><x:is><x:t xml:space="preserve">implemented<\/x:t><\/x:is><\/x:c>/);
    assert.match(sheetXml, /<x:c r="B2" s="0" t="inlineStr"><x:is><x:t xml:space="preserve">implement<\/x:t><\/x:is><\/x:c>/);
    assert.match(sheetXml, /sqref="C2:C1000"/);
});
