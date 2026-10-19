async function extractPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number); const content = await page.getTextContent();
    const items = content.items.filter(item => item.str && item.str.trim()).map(item => ({ text: item.str.normalize('NFC'), x: item.transform[4], y: item.transform[5], width: item.width }));
    const buckets = [];
    for (const item of items.sort((a,b) => b.y-a.y || a.x-b.x)) { let line = buckets.find(row => Math.abs(row.y-item.y) <= 2); if (!line) { line={y:item.y,items:[]}; buckets.push(line); } line.items.push(item); }
    const lines = buckets.sort((a,b)=>b.y-a.y).map((line,index)=>({ row:index+1, y:line.y, items:line.items.sort((a,b)=>a.x-b.x), text:line.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ').replace(/\s+/g,' ').trim() }));
    pages.push({ number, items, lines, text: lines.map(line=>line.text).join('\n') });
  }
  return { pageCount: document.numPages, pages, text: pages.map(page=>page.text).join('\n') };
}
module.exports = { extractPdf };
