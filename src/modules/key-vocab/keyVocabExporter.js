const path = require('path');
const fs = require('fs/promises');
const JSZip = require('jszip');
const { ALLOWED_TYPES } = require('./keyVocabService');
const HttpError = require('../../http/httpError');

const TEMPLATE_PATH = path.join(__dirname, '../../assets/templates/KeyVocabulary_ImportTemplate.xlsx');

function normalizeItems(vocabularies) {
  if (!Array.isArray(vocabularies) || !vocabularies.length) throw new HttpError('Không có từ vựng để xuất dữ liệu.', 400, 'EMPTY_VOCAB_EXPORT');
  return vocabularies.map((item, index) => {
    const value = { t: String(item?.t || '').trim(), p: String(item?.p || '').trim(), i: String(item?.i || '').trim(), m: String(item?.m || '').trim() };
    if (!value.t || !value.i || !value.m || !ALLOWED_TYPES.has(value.p)) throw new HttpError(`Từ vựng thứ ${index + 1} chưa đủ dữ liệu để export.`, 422, 'INVALID_VOCAB_EXPORT');
    return value;
  });
}

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function createWorkbook(vocabularies) {
  const items = normalizeItems(vocabularies);
  const zip = await JSZip.loadAsync(await fs.readFile(TEMPLATE_PATH));
  const sheetFile = zip.file('xl/worksheets/sheet1.xml');
  if (!sheetFile) throw new HttpError('Template export Key Vocab không hợp lệ.', 500, 'INVALID_EXPORT_TEMPLATE');
  let xml = await sheetFile.async('string');
  const header = xml.match(/<x:row r="1"[\s\S]*?<\/x:row>/)?.[0];
  if (!header) throw new HttpError('Không tìm thấy header trong template Key Vocab.', 500, 'INVALID_EXPORT_TEMPLATE');
  const rows = items.map((item, index) => {
    const row = index + 2;
    const cells = [item.t, item.p, item.i, item.m, ''].map((value, col) => {
      const address = `${String.fromCharCode(65 + col)}${row}`;
      return `<x:c r="${address}" s="0" t="inlineStr"><x:is><x:t xml:space="preserve">${escapeXml(value)}</x:t></x:is></x:c>`;
    }).join('');
    return `<x:row r="${row}" spans="1:5">${cells}</x:row>`;
  }).join('');
  xml = xml.replace(/<x:sheetData>[\s\S]*?<\/x:sheetData>/, `<x:sheetData>${header}${rows}</x:sheetData>`);
  xml = xml.replace(/<x:dimension ref="[^"]+"\s*\/>/, `<x:dimension ref="A1:E${items.length + 1}" />`);
  zip.file('xl/worksheets/sheet1.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

module.exports = { createWorkbook };
