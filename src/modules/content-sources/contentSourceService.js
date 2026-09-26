const crypto=require('crypto');
const path=require('path');
const HttpError=require('../../http/httpError');
const repository=require('./contentSourceRepository');
const storage=require('../../services/storageService');
const gemini=require('../../clients/geminiContentClient');
const analysisProvider=require('./contentAnalysisProvider');
const {extractPdf}=require('../expenses/parsers/pdfTextExtractor');

const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const clean=value=>String(value||'').trim();
const checksum=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');

function basicTextDetection(text){
  const lower=text.toLowerCase();
  const skills=['LISTENING','READING','SPEAKING','WRITING'].filter(skill=>lower.includes(skill.toLowerCase()));
  const recall=/\b(review đề|đi thi|ca thi|exam recall|q(?:uestion)?\s*\d+)\b/i.test(text);
  return {documentType:recall?'exam_recall':'other',language:/[ăâđêôơư]/i.test(text)?'vi':'en',title:text.split(/\n/).find(Boolean)?.slice(0,120)||'Nội dung đã dán',rawText:text,summary:'',toeicSkills:skills,isExamRecall:recall,examDate:null,questionSignals:[],topics:[],confidence:recall?0.7:0.45,warnings:['Chưa phân tích AI; kết quả được phát hiện bằng quy tắc.']};
}

async function maybeStore(file,hash){
  if(!file||!storage.isR2Configured())return null;
  const ext=path.extname(file.originalname||'')||({"image/jpeg":'.jpg','image/png':'.png','image/webp':'.webp','application/pdf':'.pdf'}[file.mimetype]||'');
  return storage.uploadBuffer(file.buffer,`content-sources/${new Date().toISOString().slice(0,7)}/${hash}${ext}`,file.mimetype);
}

async function ingest({file,text,userId}){
  const pasted=clean(text);
  if(!file&&!pasted)throw new HttpError('Hãy tải file hoặc dán nội dung.',400,'CONTENT_SOURCE_REQUIRED');
  if(file&&pasted)throw new HttpError('Mỗi lượt chỉ nhận một file hoặc một đoạn text.',400,'CONTENT_SOURCE_AMBIGUOUS');
  let sourceType,detected,extractedText='',method,usage={},modelName=null,pageCount=null,hash=null,storageKey=null;
  if(!file){
    if(pasted.length>100000)throw new HttpError('Nội dung dán vượt quá 100.000 ký tự.',413,'CONTENT_TEXT_TOO_LARGE');
    sourceType='text';method='rules';extractedText=pasted;detected=basicTextDetection(pasted);
  }else{
    hash=checksum(file.buffer);
    if(file.mimetype==='application/pdf'){
      sourceType='pdf';
      if(!file.buffer.subarray(0,5).equals(Buffer.from('%PDF-')))throw new HttpError('File PDF không hợp lệ.',400,'CONTENT_FILE_INVALID');
      const pdf=await extractPdf(file.buffer);pageCount=pdf.pageCount;
      if(pageCount>50)throw new HttpError('PDF vượt quá giới hạn 50 trang.',413,'CONTENT_PDF_PAGE_LIMIT');
      extractedText=clean(pdf.text);
      if(extractedText.length>=40){method='pdf_text';detected=basicTextDetection(extractedText);detected.warnings=[];}
      else {const ai=await gemini.detectMedia({buffer:file.buffer,mimeType:file.mimetype,filename:file.originalname});detected=ai.detected;usage=ai.usage;modelName=ai.model;extractedText=clean(detected.rawText);method='gemini_vision';}
    }else if(IMAGE_TYPES.has(file.mimetype)){
      sourceType='image';const ai=await gemini.detectMedia({buffer:file.buffer,mimeType:file.mimetype,filename:file.originalname});detected=ai.detected;usage=ai.usage;modelName=ai.model;extractedText=clean(detected.rawText);method='gemini_vision';
    }else throw new HttpError('Chỉ hỗ trợ JPG, PNG, WebP và PDF.',415,'CONTENT_FILE_TYPE_UNSUPPORTED');
    storageKey=await maybeStore(file,hash);
  }
  const record=await repository.create({sourceType,filename:file?.originalname||null,mimeType:file?.mimetype||'text/plain',fileSize:file?.size||Buffer.byteLength(pasted),checksum:hash,storageKey,status:'ready',extractionMethod:method,extractedText,detectedContent:{...detected,pageCount},usageMetadata:{...usage,model:modelName},errorMessage:null,userId});
  return record;
}

async function extractBatchFile(file){
  if(file.mimetype==='application/pdf'){
    if(!file.buffer.subarray(0,5).equals(Buffer.from('%PDF-')))throw new HttpError(`File PDF “${file.originalname}” không hợp lệ.`,400,'CONTENT_FILE_INVALID');
    const pdf=await extractPdf(file.buffer);if(pdf.pageCount>50)throw new HttpError(`PDF “${file.originalname}” vượt quá 50 trang.`,413,'CONTENT_PDF_PAGE_LIMIT');
    const direct=clean(pdf.text);if(direct.length>=40)return {text:direct,method:'pdf_text',pages:pdf.pageCount,usage:{},model:null,detected:basicTextDetection(direct)};
  }
  if(file.mimetype!=='application/pdf'&&!IMAGE_TYPES.has(file.mimetype))throw new HttpError(`File “${file.originalname}” không được hỗ trợ.`,415,'CONTENT_FILE_TYPE_UNSUPPORTED');
  const ai=await gemini.detectMedia({buffer:file.buffer,mimeType:file.mimetype,filename:file.originalname});
  return {text:clean(ai.detected.rawText),method:'gemini_vision',pages:file.mimetype==='application/pdf'?1:0,usage:ai.usage||{},model:ai.model,detected:ai.detected};
}

async function ingestBatch({files,userId}){
  if(!Array.isArray(files)||files.length<2)throw new HttpError('Hãy chọn ít nhất hai file cho lượt tổng hợp.',400,'CONTENT_BATCH_REQUIRED');
  if(files.length>10)throw new HttpError('Mỗi lượt hỗ trợ tối đa 10 file.',413,'CONTENT_BATCH_LIMIT');
  if(files.reduce((sum,file)=>sum+Number(file.size||0),0)>50*1024*1024)throw new HttpError('Tổng dung lượng mỗi lượt không được vượt quá 50 MB.',413,'CONTENT_BATCH_SIZE_LIMIT');
  const results=[];for(const file of files)results.push(await extractBatchFile(file));
  const extractedText=results.map((item,index)=>`--- ${files[index].originalname} ---\n${item.text}`).join('\n\n');
  const base=basicTextDetection(extractedText),skills=[...new Set(results.flatMap(item=>item.detected?.toeicSkills||[]))];
  const usage=results.reduce((total,item)=>{for(const [key,value] of Object.entries(item.usage||{}))if(Number.isFinite(Number(value)))total[key]=(total[key]||0)+Number(value);return total;},{});
  const combinedHash=crypto.createHash('sha256');files.forEach(file=>combinedHash.update(file.buffer));
  return repository.create({sourceType:files.every(file=>IMAGE_TYPES.has(file.mimetype))?'image':'pdf',filename:`${files.length} file · ${files.map(file=>file.originalname).join(', ')}`.slice(0,500),mimeType:'application/x-content-bundle',fileSize:files.reduce((sum,file)=>sum+file.size,0),checksum:combinedHash.digest('hex'),storageKey:null,status:'ready',extractionMethod:results.some(item=>item.method==='gemini_vision')?'gemini_vision':'pdf_text',extractedText,detectedContent:{...base,toeicSkills:skills,isExamRecall:results.some(item=>item.detected?.isExamRecall)||base.isExamRecall,pageCount:results.reduce((sum,item)=>sum+(item.pages||0),0),inputFiles:files.map((file,index)=>({name:file.originalname,mimeType:file.mimetype,size:file.size,order:index+1}))},usageMetadata:{...usage,models:[...new Set(results.map(item=>item.model).filter(Boolean))]},errorMessage:null,userId});
}

const normalizeEvidence=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim().toLowerCase();
function evidenceExists(source,evidence){const needle=normalizeEvidence(evidence),haystack=normalizeEvidence(source);return needle.length>=4&&haystack.includes(needle);}
function validateAnalysis(source,analysis){
  let accepted=0,rejected=0;
  const keep=item=>{if(evidenceExists(source,item?.evidence)){accepted++;return true;}rejected++;return false;};
  if(analysis.classification&&!keep(analysis.classification))analysis.classification={contentType:'OTHER',exam:'',skills:[],isRelevant:false,relevanceScore:0,evidence:''};
  if(analysis.examContext&&!evidenceExists(source,analysis.examContext.evidence)){analysis.examContext={examDate:null,examSession:null,location:null,actualScores:[],evidence:''};rejected++;}
  else if(analysis.examContext){accepted++;analysis.examContext.actualScores=(analysis.examContext.actualScores||[]).filter(keep);}
  analysis.recalledItems=(analysis.recalledItems||[]).filter(keep);
  analysis.performanceSignals=(analysis.performanceSignals||[]).filter(keep);
  analysis.trendSignals=(analysis.trendSignals||[]).filter(item=>{if(item.verificationStatus==='VERIFIED')item.verificationStatus='UNVERIFIED';return keep(item);});
  const keepMulti=item=>{const valid=(item.evidence||[]).filter(value=>evidenceExists(source,value));rejected+=(item.evidence||[]).length-valid.length;if(!valid.length){rejected++;return false;}item.evidence=valid;accepted+=valid.length;return true;};
  analysis.insights=(analysis.insights||[]).filter(keepMulti);
  analysis.materialRecommendations=(analysis.materialRecommendations||[]).filter(keepMulti);
  return {analysis,metadata:{acceptedEvidence:accepted,rejectedEvidence:rejected,evidenceValidation:'exact_normalized_substring',validatedAt:new Date().toISOString()}};
}

async function analyze({sourceId,text,userId}){
  const source=await repository.findOwned(sourceId,userId);if(!source)throw new HttpError('Không tìm thấy nguồn nội dung.',404,'CONTENT_SOURCE_NOT_FOUND');
  const sourceText=clean(text)||clean(source.extractedText);if(sourceText.length<20)throw new HttpError('Nội dung quá ngắn để phân tích.',400,'CONTENT_ANALYSIS_TEXT_TOO_SHORT');if(sourceText.length>100000)throw new HttpError('Nội dung vượt quá 100.000 ký tự.',413,'CONTENT_ANALYSIS_TEXT_TOO_LARGE');
  const sourceTextHash=crypto.createHash('sha256').update(sourceText).digest('hex');
  const providerName=String(process.env.CONTENT_ANALYSIS_PROVIDER||'gemini').trim().toLowerCase();
  const schemaVersion=providerName==='dify'?'source-analysis-v2':'source-analysis-v1';
  const cached=await repository.findAnalysisByHash(sourceId,sourceTextHash,userId,schemaVersion);
  if(cached)return mapAnalysis(cached,true);
  const ai=await analysisProvider.analyze({sourceId,sourceText,sourceType:source.sourceType,userId,legacyValidator:validateAnalysis});
  const saved=await repository.createAnalysis({sourceId,sourceText,sourceTextHash,model:ai.model,provider:ai.provider,providerRunId:ai.providerRunId,schemaVersion:ai.schemaVersion,analysis:ai.analysis,validationMetadata:ai.validationMetadata,usageMetadata:ai.usage,userId});
  return mapAnalysis(saved,false);
}
function mapAnalysis(row,cached=false){return {id:row.id,analysis:row.analysis,validationMetadata:row.validation_metadata||{},usageMetadata:row.usage_metadata||{},model:row.model,provider:row.provider||'gemini',providerRunId:row.provider_run_id||null,schemaVersion:row.schema_version||row.analysis?.schemaVersion||'source-analysis-v1',cached,reviewLabel:row.review_label||'NEEDS_REVIEW',reviewNote:row.review_note||'',reviewedBy:row.reviewed_by||null,reviewedAt:row.reviewed_at||null,createdAt:row.created_at};}
async function review({analysisId,label,note,userId}){
  const allowed=new Set(['APPROVED','NEEDS_REVIEW','REJECTED']);if(!allowed.has(label))throw new HttpError('Nhãn kiểm duyệt không hợp lệ.',400,'CONTENT_REVIEW_LABEL_INVALID');
  const cleanNote=clean(note);if(cleanNote.length>1000)throw new HttpError('Ghi chú không được vượt quá 1.000 ký tự.',400,'CONTENT_REVIEW_NOTE_TOO_LONG');
  const updated=await repository.updateReview({analysisId,userId,label,note:cleanNote});if(!updated)throw new HttpError('Không tìm thấy kết quả phân tích.',404,'CONTENT_ANALYSIS_NOT_FOUND');return mapAnalysis(updated);
}
async function remove({sourceId,userId}){const deleted=await repository.remove(sourceId,userId);if(!deleted)throw new HttpError('Không tìm thấy nguồn nội dung.',404,'CONTENT_SOURCE_NOT_FOUND');if(deleted.storage_key&&storage.isR2Key(deleted.storage_key)){try{await storage.deleteFile(deleted.storage_key);}catch(error){console.warn('[ContentSource] Không thể xóa file R2:',error.message);}}return {id:deleted.id};}
async function detail({sourceId,userId}){const source=await repository.findOwned(sourceId,userId);if(!source)throw new HttpError('Không tìm thấy nguồn nội dung.',404,'CONTENT_SOURCE_NOT_FOUND');return source;}
module.exports={ingest,ingestBatch,analyze,review,remove,detail,validateAnalysis,list:(userId,query)=>repository.list(userId,query)};
