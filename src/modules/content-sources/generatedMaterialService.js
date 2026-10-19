const HttpError=require('../../http/httpError');
const repository=require('./generatedMaterialRepository');
const gemini=require('../../clients/geminiContentClient');
const {planBatches}=require('./materialGenerationPlanner');
const {getSpecification}=require('./toeicMaterialSpecifications');
const {validateGeneratedContent}=require('./materialContentValidator');

const clean=(value,max=20000)=>String(value||'').trim().slice(0,max);
function validateContent(content){
  if(!content||typeof content!=='object'||Array.isArray(content))throw new HttpError('Nội dung học liệu không hợp lệ.',400,'GENERATED_MATERIAL_CONTENT');
  if(!Array.isArray(content.sections)||!content.sections.length)throw new HttpError('Học liệu phải có ít nhất một phần nội dung.',400,'GENERATED_MATERIAL_SECTIONS');
  const serialized=JSON.stringify(content);if(Buffer.byteLength(serialized)>2*1024*1024)throw new HttpError('Nội dung học liệu vượt quá 2 MB.',400,'GENERATED_MATERIAL_TOO_LARGE');return content;
}
function mergeUsage(target={},usage={}){for(const [key,value] of Object.entries(usage))if(Number.isFinite(Number(value)))target[key]=Number(target[key]||0)+Number(value);return target;}
function mergeContent(parts,item){
  const unique=values=>[...new Set(values.filter(Boolean))];
  return {title:parts[0]?.title||item.title,overview:parts.map(part=>part.overview).filter(Boolean).join('\n\n'),learningObjectives:unique(parts.flatMap(part=>part.learningObjectives||[])),teacherNotes:unique(parts.flatMap(part=>part.teacherNotes||[])),sections:parts.flatMap(part=>part.sections||[]),qualityChecklist:{targetScoreAlignment:parts.map(part=>part.qualityChecklist?.targetScoreAlignment).filter(Boolean).join(' '),originalityNotes:parts.map(part=>part.qualityChecklist?.originalityNotes).filter(Boolean).join(' '),trendCoverage:unique(parts.flatMap(part=>part.qualityChecklist?.trendCoverage||[])),answerKeyComplete:parts.every(part=>part.qualityChecklist?.answerKeyComplete===true)}};
}
function map(row){return {id:row.id,blueprintId:row.blueprint_id,blueprintItemId:row.blueprint_item_id,version:row.version,status:row.status,title:row.title,content:row.content,model:row.model,promptVersion:row.prompt_version,templateCode:row.template_code,usageMetadata:row.usage_metadata||{},validationMetadata:row.validation_metadata||{},pipelineMetadata:row.pipeline_metadata||{},reviewNote:row.review_note||'',reviewedBy:row.reviewed_by,reviewedAt:row.reviewed_at,createdAt:row.created_at,updatedAt:row.updated_at};}
function itemFromRow(row){return {id:row.id,materialType:row.material_type,skill:row.skill,questionGroup:row.question_group,title:row.title,objective:row.objective,rationale:row.rationale,quantity:row.quantity,difficultyMix:row.difficulty_mix,sourceTrendIds:row.source_trend_ids||[],generationConstraints:row.generation_constraints||{}};}
async function generate(userId,blueprintId,itemId){
  const row=await repository.ownedItem(userId,blueprintId,itemId);if(!row)throw new HttpError('Không tìm thấy hạng mục blueprint.',404,'BLUEPRINT_ITEM_NOT_FOUND');if(row.blueprint_status!=='APPROVED')throw new HttpError('Blueprint phải được duyệt trước khi AI sinh học liệu.',409,'BLUEPRINT_NOT_APPROVED');
  const item=itemFromRow(row),snapshot=Array.isArray(row.trend_snapshot)?row.trend_snapshot:[],trendIds=new Set(item.sourceTrendIds),trends=snapshot.filter(trend=>trendIds.has(trend.id)).map(trend=>({skill:trend.skill,questionGroup:trend.questionGroup,taskType:trend.taskType,topic:trend.topic,trendType:trend.trendType,sourceCount:trend.sourceCount,confidence:trend.confidence}));
  const blueprint={title:row.blueprint_title,summary:row.blueprint_summary,instructionLanguage:row.instruction_language,targetScores:row.target_scores,difficultyMix:row.blueprint_difficulty_mix};
  const spec=getSpecification(item),batches=planBatches(item),parts=[],usage={},aiReviews=[];let repairedBatches=0,promptVersion='material-v2',templateCode='',usedModel=process.env.GEMINI_MATERIAL_MODEL||process.env.GEMINI_MODEL||'gemini-3.5-flash';
  for(const batch of batches){
    let ai=await gemini.generateLearningMaterial({blueprint,item,trends,batch});mergeUsage(usage,ai.usage);promptVersion=ai.promptVersion;templateCode=ai.templateCode;usedModel=ai.model;
    let validation=validateGeneratedContent(ai.content,item,batch.quantity,batch.difficulty);
    if(!validation.valid){const repaired=await gemini.generateLearningMaterial({blueprint,item,trends,batch,repairIssues:validation.issues,previousContent:ai.content});mergeUsage(usage,repaired.usage);ai=repaired;validation=validateGeneratedContent(ai.content,item,batch.quantity,batch.difficulty);repairedBatches++;}
    if(!validation.valid)throw new HttpError(`AI chưa tạo đúng cấu trúc batch ${batch.index}: ${validation.issues.map(issue=>issue.code).join(', ')}.`,502,'MATERIAL_VALIDATION_FAILED');
    if(spec.deepReview){const reviewed=await gemini.reviewLearningMaterial({item,batch,content:ai.content});mergeUsage(usage,reviewed.usage);aiReviews.push({batch:batch.index,...reviewed.review});if(reviewed.review.decision==='NEEDS_REPAIR'){const repaired=await gemini.generateLearningMaterial({blueprint,item,trends,batch,repairIssues:reviewed.review.issues,previousContent:ai.content});mergeUsage(usage,repaired.usage);ai=repaired;validation=validateGeneratedContent(ai.content,item,batch.quantity,batch.difficulty);repairedBatches++;if(!validation.valid)throw new HttpError(`Batch ${batch.index} chưa đạt sau kiểm định chuyên môn.`,502,'MATERIAL_REPAIR_FAILED');}}
    parts.push(ai.content);
  }
  const content=mergeContent(parts,item);validateContent(content);const validation=validateGeneratedContent(content,item,Number(item.quantity)||1);if(!validation.valid)throw new HttpError(`Học liệu chưa đạt kiểm định: ${validation.issues.map(issue=>issue.code).join(', ')}.`,502,'MATERIAL_VALIDATION_FAILED');
  const pipeline={batchCount:batches.length,repairedBatches,deepReviewRequired:Boolean(spec.deepReview),aiReviews,stages:['PLANNED','GENERATED','CODE_VALIDATED',...(spec.deepReview?['AI_REVIEWED']:[]),'HUMAN_REVIEW_REQUIRED']};
  return map(await repository.create(userId,{blueprintId,itemId,title:clean(content.title,240)||item.title,content,model:usedModel,usage,promptVersion,templateCode,validation,pipeline}));
}
async function list(userId,blueprintId,itemId){const owned=await repository.ownedItem(userId,blueprintId,itemId);if(!owned)throw new HttpError('Không tìm thấy hạng mục blueprint.',404,'BLUEPRINT_ITEM_NOT_FOUND');return {data:(await repository.list(userId,blueprintId,itemId)).map(map)};}
async function detail(userId,id){const row=await repository.detail(userId,id);if(!row)throw new HttpError('Không tìm thấy học liệu.',404,'GENERATED_MATERIAL_NOT_FOUND');return map(row);}
async function update(userId,id,input){await detail(userId,id);const title=clean(input.title,240);if(!title)throw new HttpError('Tên học liệu không được để trống.',400,'GENERATED_MATERIAL_TITLE');const saved=await repository.update(userId,id,title,validateContent(input.content));if(!saved)throw new HttpError('Chỉ kết quả Cần kiểm tra mới được chỉnh sửa.',409,'GENERATED_MATERIAL_LOCKED');return map(saved);}
async function review(userId,id,input){await detail(userId,id);if(!['NEEDS_REVIEW','APPROVED','REJECTED'].includes(input.status))throw new HttpError('Trạng thái học liệu không hợp lệ.',400,'GENERATED_MATERIAL_STATUS');const note=clean(input.note,2000);if(input.status==='REJECTED'&&!note)throw new HttpError('Cần nhập lý do từ chối học liệu.',400,'GENERATED_MATERIAL_REJECTION_NOTE');return map(await repository.review(userId,id,input.status,note));}
module.exports={validateContent,mergeContent,mergeUsage,generate,list,detail,update,review};
