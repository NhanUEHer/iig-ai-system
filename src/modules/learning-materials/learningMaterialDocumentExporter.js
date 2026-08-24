const path=require('path');
const {Document,Packer,Paragraph,TextRun,HeadingLevel,AlignmentType,Footer,PageNumber,ShadingType}=require('docx');
const PDFDocument=require('pdfkit');
const HttpError=require('../../http/httpError');

const BLUE='155A9C',INK='102A43',MUTED='627D98',PALE='EDF5FC',LINE='D9E2EC';
const FONT_REGULAR=path.join(__dirname,'../../assets/fonts/DejaVuSans.ttf');
const FONT_BOLD=path.join(__dirname,'../../assets/fonts/DejaVuSans-Bold.ttf');
const clean=value=>String(value??'').trim();
const escapePattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function sourceRuns(passage,terms){
  const values=[...new Set(terms.map(clean).filter(Boolean))].sort((a,b)=>b.length-a.length);
  if(!values.length)return [new TextRun(clean(passage))];
  const matcher=new RegExp(`(${values.map(escapePattern).join('|')})`,'giu');
  return clean(passage).split(matcher).filter(Boolean).map(part=>new TextRun({text:part,bold:values.some(value=>value.toLocaleLowerCase()===part.toLocaleLowerCase()),color:values.some(value=>value.toLocaleLowerCase()===part.toLocaleLowerCase())?BLUE:INK,highlight:values.some(value=>value.toLocaleLowerCase()===part.toLocaleLowerCase())?'yellow':undefined}));
}

function normalize(type,detail){
  if(!['key-vocab','dictionary'].includes(type))throw new HttpError('Loại học liệu không hỗ trợ export.',400,'INVALID_DOCUMENT_EXPORT_TYPE');
  const entries=type==='key-vocab'?(detail.vocabularies||[]).map(item=>({term:clean(item.t),original:clean(item.o||item.t),pos:clean(item.p),ipa:clean(item.i),meaningVi:clean(item.m)}))
    :(detail.candidates||[]).filter(item=>item.status==='completed').map(item=>({term:clean(item.canonical||item.originalChunk),original:clean(item.originalChunk),pos:clean(item.partOfSpeech),ipa:clean(item.ipa),meaningVi:clean(item.meaningVi),meaningEn:clean(item.meaningEn),sentence:clean(item.originalSentence||item.sentenceText),context:clean(item.contextExplanation),exampleEn:clean(item.exampleEn),exampleVi:clean(item.exampleVi),collocations:Array.isArray(item.collocations)?item.collocations.map(clean).filter(Boolean):[],synonyms:Array.isArray(item.synonyms)?item.synonyms.map(clean).filter(Boolean):[],wordFamily:clean(item.wordFamily)}));
  if(!entries.length)throw new HttpError('Chưa có dữ liệu hoàn tất để export tài liệu.',400,'EMPTY_DOCUMENT_EXPORT');
  return {type,title:type==='key-vocab'?'KEY VOCAB - TOEIC LEARNING MATERIAL':'CONTEXTUAL DICTIONARY',passage:clean(detail.passage),createdBy:clean(detail.created_by_name||detail.createdByName||'IIG Workspace'),createdAt:detail.created_at||detail.createdAt||new Date().toISOString(),meta:type==='key-vocab'?`TOEIC ${detail.target_score||detail.targetScore||500}+ · ${clean(detail.selection_mode||detail.selectionMode||'balanced')}`:'Từ điển chi tiết theo ngữ cảnh',entries};
}

const docParagraph=(text,options={})=>new Paragraph({children:String(text??'').split('\n').map((line,index)=>new TextRun({text:line,break:index?1:0,bold:options.bold,color:options.color||INK,size:options.size||21})),spacing:{before:options.before||0,after:options.after??100,line:options.line||280},keepNext:options.keepNext});
function addDocxEntry(children,entry,index,type){
  children.push(new Paragraph({heading:HeadingLevel.HEADING_2,children:[new TextRun({text:`${String(index+1).padStart(2,'0')}  ${entry.term}`,bold:true,color:BLUE,size:28}),new TextRun({text:`   ${entry.pos}${entry.ipa?`   ${entry.ipa}`:''}`,color:MUTED,size:19})],spacing:{before:240,after:105},keepNext:true}));
  children.push(docParagraph(`Nghĩa: ${entry.meaningVi||'—'}`,{bold:true,after:130,keepNext:type==='dictionary'}));
  if(type==='key-vocab'){
    if(entry.original!==entry.term)children.push(docParagraph(`Dạng trong bài: ${entry.original}`,{color:MUTED,after:140,line:300}));
    return;
  }
  const section=(label,text)=>{children.push(docParagraph(label.toLocaleUpperCase(),{bold:true,color:MUTED,size:17,before:90,after:55,keepNext:true}));children.push(docParagraph(text||'—',{size:20,line:320,after:95}));};
  section('Định nghĩa tiếng Anh',entry.meaningEn);
  section('Câu gốc trong bài',entry.sentence);
  section('Nghĩa trong ngữ cảnh',entry.context);
  section('Ví dụ',`${entry.exampleEn||'—'}${entry.exampleVi?`\n→ ${entry.exampleVi}`:''}`);
  section('Collocations',entry.collocations.join('\n')||'—');
  section('Synonyms',entry.synonyms.join(', ')||'—');
  section('Word family',entry.wordFamily||'—');
}

async function createDocx(type,detail){
  const model=normalize(type,detail),children=[];
  children.push(new Paragraph({children:[new TextRun({text:'CONTENT TOOLS · AI ACADEMY',bold:true,color:BLUE,size:18})],spacing:{after:90}}));
  children.push(new Paragraph({children:[new TextRun({text:model.title,bold:true,color:INK,size:38})],spacing:{after:70}}));
  children.push(docParagraph(`${model.entries.length} mục · ${model.meta} · Tạo bởi ${model.createdBy} · ${new Date(model.createdAt).toLocaleDateString('vi-VN')}`,{color:MUTED,size:19,after:180}));
  children.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:'Nội dung nguồn',bold:true,color:BLUE,size:30})],spacing:{before:0,after:80},keepNext:true}));
  children.push(new Paragraph({children:sourceRuns(model.passage,model.entries.map(entry=>entry.original)),shading:{type:ShadingType.CLEAR,fill:PALE},spacing:{after:180,line:300},indent:{left:180,right:180}}));
  children.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:type==='key-vocab'?'Danh sách từ vựng':'Nội dung từ điển',bold:true,color:BLUE,size:30})],spacing:{before:60,after:30},keepNext:true}));
  model.entries.forEach((entry,index)=>addDocxEntry(children,entry,index,type));
  const doc=new Document({styles:{default:{document:{run:{font:'Arial',size:21,color:INK},paragraph:{spacing:{after:100,line:280}}}},paragraphStyles:[{id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',run:{font:'Arial',size:30,bold:true,color:BLUE},paragraph:{spacing:{before:280,after:120},keepNext:true}},{id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',run:{font:'Arial',size:26,bold:true,color:BLUE},paragraph:{spacing:{before:180,after:80},keepNext:true}}]},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,right:1080,bottom:1080,left:1080},pageNumbers:{start:1}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:'IIG Workspace  ·  ',color:MUTED,size:17}),new TextRun({children:[PageNumber.CURRENT],color:MUTED,size:17})]})]})},children}]});
  return Packer.toBuffer(doc);
}

function writePdfEntry(doc,entry,index,type){
  const entryText=type==='key-vocab'
    ?`${entry.meaningVi}\n${entry.original}`
    :[entry.meaningVi,entry.meaningEn,entry.sentence,entry.context,entry.exampleEn,entry.exampleVi,...entry.collocations,...entry.synonyms,entry.wordFamily].join('\n');
  const estimatedHeight=(type==='dictionary'?150:72)+doc.heightOfString(entryText,{width:504,lineGap:3});
  if(doc.y+Math.min(estimatedHeight,560)>doc.page.height-doc.page.margins.bottom)doc.addPage();
  doc.moveDown(.9).font('Bold').fontSize(14).fillColor('#155A9C').text(`${String(index+1).padStart(2,'0')}  ${entry.term}`,{continued:true}).font('Regular').fontSize(9).fillColor('#627D98').text(`   ${entry.pos}${entry.ipa?`   ${entry.ipa}`:''}`);
  doc.moveDown(.5).font('Bold').fontSize(10).fillColor('#102A43').text(`Nghĩa: ${entry.meaningVi||'—'}`,{lineGap:2});
  if(type==='key-vocab'){if(entry.original!==entry.term)doc.moveDown(.25).font('Regular').fillColor('#627D98').text(`Dạng trong bài: ${entry.original}`,{lineGap:2});return;}
  const section=(label,text)=>{doc.moveDown(.5).font('Bold').fontSize(7.5).fillColor('#627D98').text(label.toUpperCase(),{characterSpacing:.5});doc.moveDown(.22).font('Regular').fontSize(9.5).fillColor('#102A43').text(text||'—',{lineGap:3});};
  section('Định nghĩa tiếng Anh',entry.meaningEn);section('Câu gốc trong bài',entry.sentence);section('Nghĩa trong ngữ cảnh',entry.context);section('Ví dụ',`${entry.exampleEn||'—'}${entry.exampleVi?`\n→ ${entry.exampleVi}`:''}`);section('Collocations',entry.collocations.join('\n')||'—');section('Synonyms',entry.synonyms.join(', ')||'—');section('Word family',entry.wordFamily||'—');
  doc.moveDown(.75).strokeColor('#D9E2EC').lineWidth(.5).moveTo(54,doc.y).lineTo(558,doc.y).stroke();
}

async function createPdf(type,detail){
  const model=normalize(type,detail);
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'LETTER',margins:{top:48,bottom:72,left:54,right:54},info:{Title:model.title,Author:'IIG Workspace'}}),chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
    doc.registerFont('Regular',FONT_REGULAR);doc.registerFont('Bold',FONT_BOLD);
    let pageNumber=1;
    const stampFooter=preservePosition=>{const {x,y}=doc;const bottomMargin=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Regular').fontSize(8).fillColor('#829AB1').text(`IIG Workspace  ·  ${pageNumber}`,54,754,{width:504,align:'right',lineBreak:false});doc.page.margins.bottom=bottomMargin;doc.x=preservePosition?x:doc.page.margins.left;doc.y=preservePosition?y:doc.page.margins.top;};
    doc.on('pageAdded',()=>{pageNumber+=1;stampFooter(false);});stampFooter(true);
    doc.font('Bold').fontSize(9).fillColor('#155A9C').text('CONTENT TOOLS · AI ACADEMY',{characterSpacing:1});doc.moveDown(.5).fontSize(22).fillColor('#102A43').text(model.title);doc.moveDown(.35).font('Regular').fontSize(9).fillColor('#627D98').text(`${model.entries.length} mục · ${model.meta} · Tạo bởi ${model.createdBy} · ${new Date(model.createdAt).toLocaleDateString('vi-VN')}`);
    doc.moveDown(1.2).font('Bold').fontSize(15).fillColor('#155A9C').text('Nội dung nguồn');
    doc.moveDown(.45).font('Regular').fontSize(9.5).fillColor('#102A43').text(model.passage||'—',{width:504,lineGap:2});
    doc.moveDown(.8);
    doc.font('Bold').fontSize(15).fillColor('#155A9C').text(type==='key-vocab'?'Danh sách từ vựng':'Nội dung từ điển');model.entries.forEach((entry,index)=>writePdfEntry(doc,entry,index,type));
    doc.end();
  });
}

async function create(type,format,detail){if(format==='docx')return createDocx(type,detail);if(format==='pdf')return createPdf(type,detail);throw new HttpError('Định dạng export không được hỗ trợ.',400,'INVALID_DOCUMENT_EXPORT_FORMAT');}
module.exports={create,createDocx,createPdf,normalize,sourceRuns};
