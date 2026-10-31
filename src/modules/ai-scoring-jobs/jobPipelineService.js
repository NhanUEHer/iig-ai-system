const HttpError = require('../../http/httpError');
const repository = require('./jobPipelineRepository');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_RUN=new Set(['TRANSCRIBING','EXTRACTING_FEATURES','SCORING_QUESTIONS','AGGREGATING_GROUPS','CALIBRATING']);
const RETRYABLE_TYPES=new Set(['ANSWER_TRANSCRIPTION_REQUESTED','FEATURE_EXTRACTION_REQUESTED','SPEECH_EVIDENCE_REQUESTED','TASK_EVIDENCE_REQUESTED','QUESTION_SCORING_REQUESTED','GROUP_SCORING_REQUESTED']);
const LABELS={
  SOURCE_FETCH_REQUESTED:'Tiếp nhận dữ liệu nguồn',SOURCE_SYNC_REQUESTED:'Đồng bộ cấu trúc bài thi',QUESTION_TRANSCRIPTION_REQUESTED:'Nhận dạng nội dung câu hỏi',
  MEDIA_PREPARATION_REQUESTED:'Chuẩn bị media',INPUT_VALIDATION_REQUESTED:'Kiểm tra đầu vào',AI_SCORING_REQUESTED:'Khởi tạo scoring run',
  ANSWER_TRANSCRIPTION_REQUESTED:'Nhận dạng câu trả lời',FEATURE_EXTRACTION_REQUESTED:'Trích xuất đặc trưng',SPEECH_EVIDENCE_REQUESTED:'Phân tích phát âm',
  TASK_EVIDENCE_REQUESTED:'Phân tích nội dung trả lời',QUESTION_SCORING_REQUESTED:'Chấm điểm câu hỏi',GROUP_SCORING_REQUESTED:'Tổng hợp điểm nhóm',
};
const PHASES={SOURCE_FETCH_REQUESTED:'ingestion',SOURCE_SYNC_REQUESTED:'ingestion',QUESTION_TRANSCRIPTION_REQUESTED:'ingestion',MEDIA_PREPARATION_REQUESTED:'ingestion',INPUT_VALIDATION_REQUESTED:'ingestion',AI_SCORING_REQUESTED:'scoring'};

function requireUuid(value,label='ID'){if(!UUID.test(String(value||'')))throw new HttpError(`${label} không hợp lệ.`,400,'INVALID_ID');return value;}
function commandInput(body={}){const reason=String(body.reason||'').trim();const idempotencyKey=String(body.idempotencyKey||'').trim();if(reason.length<3||reason.length>1000)throw new HttpError('Lý do phải có từ 3 đến 1000 ký tự.',400,'INVALID_REASON');if(idempotencyKey.length<8||idempotencyKey.length>128)throw new HttpError('Idempotency key không hợp lệ.',400,'INVALID_IDEMPOTENCY_KEY');return{reason,idempotencyKey};}
function publicPayload(payload={}){const allowed=['jobId','submissionId','scoringRunId','questionRunId','questionAttemptId','groupResultId','featureSetId','transcriptionId','mediaAssetId','scorerType','taskProfile','featureVersion'];return Object.fromEntries(allowed.filter(key=>payload[key]!=null).map(key=>[key,payload[key]]));}
function displayStatus(status){if(status==='PUBLISHED')return'DONE';if(status==='PROCESSING')return'RUNNING';if(status==='PENDING')return'WAITING';if(['FAILED','DEAD_LETTER'].includes(status))return'ERROR';return status;}
function output(row,source){
  if(source==='INGESTION')return{status:row.owner_status,errorCode:row.owner_error_code||null,errorMessage:row.owner_error_message||null};
  const value={runStatus:row.run_status};
  if(row.question_status)value.question={status:row.question_status,score:row.llm_score??null,errorCode:row.question_error_code||null,errorMessage:row.question_error_message||null};
  if(row.group_status)value.group={status:row.group_status,score:row.final_score??null,errorCode:row.group_error_code||null,errorMessage:row.group_error_message||null};
  if(row.provider)value.model={provider:row.provider,name:row.model_name,version:row.model_version||null,status:row.model_status,latencyMs:row.latency_ms==null?null:Number(row.latency_ms)};
  return value;
}
function mapStep(row,source,canRetry){const retryable=source==='SCORING'&&RETRYABLE_TYPES.has(row.event_type)&&['FAILED','DEAD_LETTER'].includes(row.status)&&ACTIVE_RUN.has(row.run_status);return{
  id:`${source.toLowerCase()}:${row.id}`,workItemId:row.id,source,phase:PHASES[row.event_type]||'scoring',type:row.event_type,label:LABELS[row.event_type]||row.event_type,
  status:displayStatus(row.status),rawStatus:row.status,attempts:Number(row.publish_attempts||0),startedAt:row.created_at,updatedAt:row.updated_at,completedAt:row.published_at||null,
  error:row.last_error?{message:row.last_error}:null,input:publicPayload(row.payload),output:output(row,source),runId:row.run_id||null,runNumber:row.run_number==null?null:Number(row.run_number),
  retry:{available:Boolean(canRetry&&retryable),reason:retryable?(canRetry?null:'Bạn không có quyền retry step.'):(source==='INGESTION'?'Step ingestion chưa hỗ trợ retry riêng; hãy retry job.':!['FAILED','DEAD_LETTER'].includes(row.status)?'Chỉ retry được step lỗi.':!RETRYABLE_TYPES.has(row.event_type)?'Step này phải retry ở cấp job.':'Attempt không còn ở trạng thái xử lý.')},
};}

class JobPipelineService{
  constructor(jobRepository=repository){this.repository=jobRepository;}
  async pipeline(jobId,runId,permissions=[]){const rows=await this.repository.workItems(requireUuid(jobId,'Job ID'),runId?requireUuid(runId,'Run ID'):null);const canRetry=permissions.includes('ai_scoring.operations.retry');const steps=[...rows.ingestion.map(row=>mapStep(row,'INGESTION',canRetry)),...rows.scoring.map(row=>mapStep(row,'SCORING',canRetry))];const current=steps.find(step=>step.status==='RUNNING')||steps.find(step=>step.status==='WAITING')||[...steps].reverse().find(step=>step.status==='ERROR')||steps[steps.length-1]||null;return{jobId,runId:runId||null,currentStepId:current?.id||null,summary:{total:steps.length,done:steps.filter(step=>step.status==='DONE').length,running:steps.filter(step=>step.status==='RUNNING').length,waiting:steps.filter(step=>step.status==='WAITING').length,error:steps.filter(step=>step.status==='ERROR').length},steps};}
  async retryStep(jobId,stepId,body,context={}){const [source,id]=String(stepId||'').split(':');if(source!=='scoring'||!UUID.test(id||''))throw new HttpError('Step ID không hợp lệ.',400,'INVALID_STEP_ID');const result=await this.repository.retryStep({jobId:requireUuid(jobId,'Job ID'),stepId:id,...commandInput(body),actorId:context.actorId,requestId:context.requestId||'unknown'});if(result.missing)throw new HttpError('Không tìm thấy step trong scoring job.',404,'STEP_NOT_FOUND');if(result.invalidState)throw new HttpError('Chỉ retry được step đang lỗi.',409,'STEP_RETRY_NOT_AVAILABLE',{status:result.invalidState});if(result.invalidRunState)throw new HttpError('Attempt đã kết thúc; hãy dùng retry job hoặc chấm lại.',409,'STEP_RETRY_RUN_TERMINAL',{status:result.invalidRunState});if(result.unsupported)throw new HttpError('Step này chưa hỗ trợ retry riêng.',409,'STEP_RETRY_UNSUPPORTED',{type:result.unsupported});return result;}
}

module.exports=new JobPipelineService();
module.exports.JobPipelineService=JobPipelineService;
