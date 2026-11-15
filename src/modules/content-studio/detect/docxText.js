'use strict';
const JSZip = require('jszip');
const HttpError = require('../../../http/httpError');

const decode = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Extracts paragraph text from a .docx (one line per paragraph, tabs/breaks kept) without extra dependencies.
async function docxToText(buffer) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch { throw new HttpError('File không phải DOCX hợp lệ.', 400, 'INVALID_DOCX'); }
  const entry = zip.file('word/document.xml');
  if (!entry) throw new HttpError('File DOCX không có nội dung.', 400, 'INVALID_DOCX');
  const xml = await entry.async('string');
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || [];
  return paragraphs.map(paragraph => [...paragraph.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g)]
    .map(match => match[1] != null ? decode(match[1]) : match[0].startsWith('<w:tab') ? '\t' : '\n').join(''))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { docxToText };
