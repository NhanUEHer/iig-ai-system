const JSZip = require('jszip');
const XLSX = require('xlsx');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkbook } = require('../src/modules/key-vocab/keyVocabExporter');

test('key vocab Excel follows the canonical template and maps in-article form before dictionary form', async () => {
    const buffer = await createWorkbook([{
      o: 'implemented',
      t: 'implement',
      p: 'Verb',
      i: '/ˈɪmplɪment/',
      m: 'triển khai'
    }]);
    const zip = await JSZip.loadAsync(buffer);
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Template, { header: 1, raw: false });
    assert.equal(rows[0][0], 'Từ vựng (*)');
    assert.equal(rows[0][1], 'Từ gốc (*)');
    assert.equal(rows[1][0], 'implemented');
    assert.equal(rows[1][1], 'implement');
    assert.match(sheetXml, /ref="A1:F2"/);
    assert.match(sheetXml, /<(?:x:)?c r="A2" s="0" t="inlineStr">/);
    assert.match(sheetXml, /<(?:x:)?c r="B2" s="0" t="inlineStr">/);
    assert.match(sheetXml, /sqref="C2:C1000"/);
    const sourceZip = await JSZip.loadAsync(require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/assets/templates/KeyVocabulary_ImportTemplate.xlsx')));
    assert.equal(
      await zip.file('xl/styles.xml').async('string'),
      await sourceZip.file('xl/styles.xml').async('string'),
      'export must preserve the original template styles'
    );
});
