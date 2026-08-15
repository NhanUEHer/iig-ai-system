const CID_TO_ASCII = new Map([
  [1, ' '], [2, '%'], [3, '('], [4, ')'], [5, '*'], [6, ','], [7, '-'], [8, '.'], [9, '/'],
  [10, '0'], [11, '1'], [12, '2'], [13, '3'], [14, '4'], [15, '5'], [16, '6'], [17, '7'], [18, '8'], [19, '9'],
  [20, ':'], [21, '?'], [48, '_'],
]);
for (let cid = 22; cid <= 47; cid += 1) CID_TO_ASCII.set(cid, String.fromCharCode(65 + cid - 22));
for (let cid = 49; cid <= 57; cid += 1) CID_TO_ASCII.set(cid, String.fromCharCode(97 + cid - 49));
for (const [cid, character] of [[58,'k'],[59,'l'],[60,'m'],[61,'n'],[62,'o'],[63,'p'],[64,'q'],[65,'r'],[66,'s'],[67,'t'],[68,'u'],[69,'v'],[70,'w'],[71,'x'],[72,'y'],[73,'z']]) CID_TO_ASCII.set(cid, character);

const TPBANK_T7_CID_TO_ASCII = new Map([
  [1,' '],[2,'%'],[3,'('],[4,')'],[5,'*'],[6,','],[7,'.'],[8,'/'],[9,'0'],[10,'1'],[11,'2'],[12,'3'],[13,'4'],[14,'5'],[15,'6'],[16,'7'],[17,'8'],[18,'9'],[19,':'],
  [20,'A'],[21,'B'],[22,'C'],[23,'D'],[24,'E'],[25,'G'],[27,'I'],[28,'K'],[29,'L'],[30,'M'],[31,'N'],[32,'O'],[33,'P'],[34,'Q'],[36,'S'],[37,'T'],[38,'U'],[39,'V'],[40,'W'],
  [42,'a'],[43,'b'],[44,'c'],[45,'d'],[46,'e'],[47,'g'],[48,'h'],[49,'i'],[50,'k'],[51,'l'],[52,'m'],[53,'n'],[54,'o'],[55,'p'],[56,'r'],[57,'s'],[58,'t'],[59,'u'],[60,'v'],[61,'w'],[62,'x'],[63,'y'],
]);

function decodeGlyphs(glyphs, cidOffset = 0, glyphMap = CID_TO_ASCII) {
  return glyphs.filter(glyph => glyph && typeof glyph === 'object')
    .map(glyph => {
      const cid = Number(glyph.originalCharCode);
      return glyphMap.get(glyphMap === CID_TO_ASCII && cid >= 21 ? cid + cidOffset : cid) || '';
    }).join('');
}

function encodingScore(text) {
  const patterns = [
    [/\bVND\b/g, 8], [/\bTPBANK\b/g, 12], [/\bEBANK\b/g, 5], [/DUONG NGOC DUC/g, 20],
    [/GOOGLE/g, 4], [/SHOPEE/g, 4], [/GRAB/g, 4], [/CANVA/g, 4], [/VIET NAM/g, 3],
    [/D n (?:k trc|sao k)/g, 8], [/Gi tr giao dch th k ny/g, 12], [/Phi xu ly GD quoc te/g, 10],
  ];
  return patterns.reduce((score, [pattern, weight]) => score + (text.match(pattern)?.length || 0) * weight, 0);
}

function detectCidOffset(pageContexts) {
  let best = { offset:0, score:-1 };
  for (let offset = -3; offset <= 3; offset += 1) {
    const sample = pageContexts.flatMap(context => context.glyphRuns).map(glyphs => decodeGlyphs(glyphs, offset)).join('\n');
    const score = encodingScore(sample);
    if (score > best.score) best = { offset, score };
  }
  return best.offset;
}

function detectEncoding(pageContexts) {
  const cidOffset = detectCidOffset(pageContexts);
  const offsetSample = pageContexts.flatMap(context => context.glyphRuns).map(glyphs => decodeGlyphs(glyphs, cidOffset)).join('\n');
  const t7Sample = pageContexts.flatMap(context => context.glyphRuns).map(glyphs => decodeGlyphs(glyphs, 0, TPBANK_T7_CID_TO_ASCII)).join('\n');
  return encodingScore(t7Sample) > encodingScore(offsetSample)
    ? { name:'tpbank_t7_permuted', cidOffset:0, glyphMap:TPBANK_T7_CID_TO_ASCII }
    : { name:'sequential', cidOffset, glyphMap:CID_TO_ASCII };
}

async function repairTpBankExtraction(buffer, extracted) {
  if (/TPBANK/i.test(extracted.text) && /SAO KÊ TÀI KHOẢN THẺ TÍN DỤNG/i.test(extracted.text)) return extracted;
  const controlCount = [...extracted.text].filter(character => character.charCodeAt(0) < 32 && !/\s/.test(character)).length;
  if (controlCount < 10) return extracted;

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data:new Uint8Array(buffer), disableFontFace:true, fontExtraProperties:true }).promise;
  const pageContexts = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const operatorList = await page.getOperatorList();
    const fontSizes = new Map();
    const fontCandidates = new Map();
    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      if (operatorList.fnArray[index] === pdfjs.OPS.setFont) {
        const [name, size] = operatorList.argsArray[index];
        const font = page.commonObjs.get(name);
        fontCandidates.set(name, font?.widths?.length || 0);
        fontSizes.set(name, Number(size) || 1);
      }
    }
    const regularFont = [...fontCandidates.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    const glyphRuns = [];
    let activeFont = null;
    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      if (operatorList.fnArray[index] === pdfjs.OPS.setFont) activeFont = operatorList.argsArray[index][0];
      else if (operatorList.fnArray[index] === pdfjs.OPS.showText && activeFont === regularFont) glyphRuns.push(operatorList.argsArray[index]?.[0] || []);
    }
    pageContexts.push({ number, page, operatorList, regularFont, fontSizes, glyphRuns });
  }

  const encoding = detectEncoding(pageContexts);
  const pages = [];
  for (const { number, operatorList, regularFont, fontSizes } of pageContexts) {
    let fontName = null;
    let matrix = [1,0,0,1,0,0];
    const items = [];
    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      const operation = operatorList.fnArray[index];
      const args = operatorList.argsArray[index];
      if (operation === pdfjs.OPS.setFont) {
        fontName = args[0];
        fontSizes.set(fontName, Number(args[1]) || 1);
      } else if (operation === pdfjs.OPS.setTextMatrix) matrix = Array.from(args[0] || args);
      else if (operation === pdfjs.OPS.setLeadingMoveText || operation === pdfjs.OPS.moveText) {
        matrix[4] += Number(args[0] || 0) * matrix[0];
        matrix[5] += Number(args[1] || 0) * matrix[3];
      } else if (operation === pdfjs.OPS.showText && fontName === regularFont) {
        const glyphs = args?.[0] || [];
        const text = decodeGlyphs(glyphs, encoding.cidOffset, encoding.glyphMap).replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const scale = Math.abs(matrix[0]) || fontSizes.get(fontName) || 8;
        const width = glyphs.reduce((sum, glyph) => sum + (glyph && typeof glyph === 'object' ? Number(glyph.width || 0) : 0), 0) / 1000 * scale;
        items.push({ text, x:matrix[4], y:matrix[5], width });
        matrix[4] += width;
      }
    }
    const buckets = [];
    for (const item of items.sort((left,right) => right.y-left.y || left.x-right.x)) {
      let line = buckets.find(row => Math.abs(row.y-item.y) <= 2);
      if (!line) { line={y:item.y,items:[]}; buckets.push(line); }
      line.items.push(item);
    }
    const lines = buckets.sort((left,right)=>right.y-left.y).map((line,index)=>({row:index+1,y:line.y,items:line.items.sort((left,right)=>left.x-right.x),text:line.items.sort((left,right)=>left.x-right.x).map(item=>item.text).join(' ').replace(/\s+/g,' ').trim()}));
    pages.push({number,items,lines,text:lines.map(line=>line.text).join('\n')});
  }
  const text = `TPBANK\nSAO KÊ TÀI KHOẢN THẺ TÍN DỤNG\n${pages.map(page=>page.text).join('\n')}`;
  return {pageCount:document.numPages,pages,text,encodingRepaired:true,encodingProfile:encoding.name,encodingCidOffset:encoding.cidOffset};
}

module.exports = { decodeGlyphs, detectCidOffset, detectEncoding, repairTpBankExtraction };
