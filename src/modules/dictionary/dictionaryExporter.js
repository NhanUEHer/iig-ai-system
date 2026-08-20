const path=require('path');
const fs=require('fs/promises');
const JSZip=require('jszip');
const HttpError=require('../../http/httpError');

const TEMPLATE_PATH=path.join(__dirname,'../../assets/templates/VocabularyDictionary_ImportTemplate.xlsx');
const clean=value=>String(value??'').trim();
const escapeXml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const escapePattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function uppercaseTerm(sentence,term){
  const source=clean(sentence),target=clean(term);
  if(!source||!target)return source;
  const matcher=new RegExp(`(^|[^\\p{L}\\p{N}])(${escapePattern(target)})(?=$|[^\\p{L}\\p{N}])`,'giu');
  return source.replace(matcher,(_,prefix,match)=>`${prefix}${match.toLocaleUpperCase()}`);
}

function wordFamily(value){
  if(Array.isArray(value))return value.map(clean).filter(Boolean).join(' – ');
  return clean(value).replace(/\s*(?:,|;|\||—|–)\s*/g,' – ').replace(/\s+-\s+/g,' – ');
}

function visualLineCount(value,charactersPerLine){
  return clean(value).split('\n').reduce((total,line)=>total+Math.max(1,Math.ceil(Array.from(line).length/charactersPerLine)),0);
}

function excelRowHeight(values){
  // G–K are deliberately estimated from the real column widths in the import
  // template. This keeps multiline content visible without changing its schema.
  const charactersPerLine=[10,12,16,13,19,54,16,30,23,15,12,20];
  const lines=Math.max(...values.map((value,index)=>visualLineCount(value,charactersPerLine[index])));
  return Math.min(300,Math.max(36,lines*15+10));
}

function normalizeEntries(candidates){
  const entries=(Array.isArray(candidates)?candidates:[]).filter(item=>item?.status==='completed');
  if(!entries.length)throw new HttpError('Chưa có mục từ điển hoàn tất để export.',400,'EMPTY_DICTIONARY_EXPORT');
  return entries.map((entry,index)=>{
    const required=[entry.originalChunk,entry.canonical,entry.partOfSpeech,entry.ipa,entry.meaningVi];
    if(required.some(value=>!clean(value)))throw new HttpError(`Mục từ điển thứ ${index+1} chưa đủ dữ liệu bắt buộc.`,422,'INVALID_DICTIONARY_EXPORT');
    const sentence=uppercaseTerm(entry.originalSentence||entry.sentenceText,entry.originalChunk);
    return [
      clean(entry.originalChunk),clean(entry.canonical),clean(entry.partOfSpeech),clean(entry.ipa),clean(entry.meaningVi),clean(entry.meaningEn),
      sentence?`Câu gốc trong bài:\n“${sentence}”\n→ ${clean(entry.contextExplanation)}`:clean(entry.contextExplanation),
      [clean(entry.exampleEn),clean(entry.exampleVi)?`→ ${clean(entry.exampleVi)}`:''].filter(Boolean).join('\n'),
      (Array.isArray(entry.collocations)?entry.collocations:[]).map(clean).filter(Boolean).join('\n'),
      (Array.isArray(entry.synonyms)?entry.synonyms:[]).map(clean).filter(Boolean).join(', '),
      wordFamily(entry.wordFamily),''];
  });
}

async function createWorkbook(candidates){
  const rows=normalizeEntries(candidates);
  const zip=await JSZip.loadAsync(await fs.readFile(TEMPLATE_PATH));
  const sheetFile=zip.file('xl/worksheets/sheet1.xml');
  const styleFile=zip.file('xl/styles.xml');
  if(!sheetFile||!styleFile)throw new HttpError('Template export Dictionary không hợp lệ.',500,'INVALID_DICTIONARY_EXPORT_TEMPLATE');
  let sheetXml=await sheetFile.async('string');
  const header=sheetXml.match(/<row r="1"[\s\S]*?<\/row>/)?.[0]||sheetXml.match(/<x:row r="1"[\s\S]*?<\/x:row>/)?.[0];
  if(!header)throw new HttpError('Không tìm thấy header trong template Dictionary.',500,'INVALID_DICTIONARY_EXPORT_TEMPLATE');
  const prefix=header.startsWith('<x:')?'x:':'';
  const xmlRows=rows.map((values,index)=>{
    const row=index+2;
    const height=excelRowHeight(values);
    const cells=values.map((value,column)=>`<${prefix}c r="${String.fromCharCode(65+column)}${row}" s="2" t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${escapeXml(value)}</${prefix}t></${prefix}is></${prefix}c>`).join('');
    return `<${prefix}row r="${row}" ht="${height}" customHeight="1" spans="1:12">${cells}</${prefix}row>`;
  }).join('');
  sheetXml=sheetXml.replace(new RegExp(`<${prefix}sheetData>[\\s\\S]*?<\\/${prefix}sheetData>`),`<${prefix}sheetData>${header}${xmlRows}</${prefix}sheetData>`);
  const dimension=`<${prefix}dimension ref="A1:L${rows.length+1}"/>`;
  if(new RegExp(`<${prefix}dimension ref="[^"]+"\\s*/>`).test(sheetXml))sheetXml=sheetXml.replace(new RegExp(`<${prefix}dimension ref="[^"]+"\\s*/>`),dimension);
  else sheetXml=sheetXml.replace(new RegExp(`(<${prefix}worksheet[^>]*>)`),`$1${dimension}`);
  zip.file('xl/worksheets/sheet1.xml',sheetXml);

  let stylesXml=await styleFile.async('string');
  const cellXfs=stylesXml.match(new RegExp(`<${prefix}cellXfs count="(\\d+)">([\\s\\S]*?)<\\/${prefix}cellXfs>`));
  if(!cellXfs)throw new HttpError('Style trong template Dictionary không hợp lệ.',500,'INVALID_DICTIONARY_EXPORT_TEMPLATE');
  const wrapStyle=`<${prefix}xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><${prefix}alignment vertical="top" wrapText="1"/></${prefix}xf>`;
  stylesXml=stylesXml.replace(cellXfs[0],`<${prefix}cellXfs count="${Number(cellXfs[1])+1}">${cellXfs[2]}${wrapStyle}</${prefix}cellXfs>`);
  zip.file('xl/styles.xml',stylesXml);
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
}

module.exports={createWorkbook,normalizeEntries,uppercaseTerm,wordFamily,visualLineCount,excelRowHeight};
