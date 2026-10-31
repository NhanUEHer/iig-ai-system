const HttpError = require('../../http/httpError');
const repository = require('./jobOperationRepository');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FAILED_INGESTION = new Set(['INVALID_REQUEST','SOURCE_FETCH_FAILED','MEDIA_FAILED','INVALID_INPUT','FAILED']);
const ACTIVE_RUN = new Set(['QUEUED','TRANSCRIBING','EXTRACTING_FEATURES','SCORING_QUESTIONS','AGGREGATING_GROUPS','CALIBRATING']);
const TERMINAL_RUN = new Set(['COMPLETED','COMPLETED_WITH_ISSUES','REVIEW_REQUIRED','FAILED','CANCELLED']);

function jobId(value) {
  if (!UUID.test(String(value || ''))) throw new HttpError('Job ID không hợp lệ.',400,'INVALID_ID');
  return value;
}
function commandInput(body = {}) {
  const reason = String(body.reason || '').trim();
  const idempotencyKey = String(body.idempotencyKey || '').trim();
  if (reason.length < 3 || reason.length > 1000) throw new HttpError('Lý do phải có từ 3 đến 1000 ký tự.',400,'INVALID_REASON');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new HttpError('Idempotency key không hợp lệ.',400,'INVALID_IDEMPOTENCY_KEY');
  return { reason,idempotencyKey };
}

class JobOperationService {
  constructor(jobRepository = repository) { this.repository = jobRepository; }
  async availableActions(id, permissions = []) {
    const state = await this.repository.state(jobId(id));
    if (!state) throw new HttpError('Không tìm thấy scoring job.',404,'JOB_NOT_FOUND');
    const allowed = state.run_status === 'FAILED' && permissions.includes('ai_scoring.operations.retry');
    let reason = null;
    if (!permissions.includes('ai_scoring.operations.retry')) reason = 'Bạn không có quyền retry scoring job.';
    else if (!state.run_id && FAILED_INGESTION.has(state.job_status)) reason = 'Job lỗi ở ingestion, chưa có scoring attempt để retry.';
    else if (state.run_status !== 'FAILED') reason = 'Chỉ retry được attempt AI mới nhất đã thất bại.';
    const canCancel = ACTIVE_RUN.has(state.run_status) && permissions.includes('ai_scoring.operations.cancel');
    let cancelReason = null;
    if (!permissions.includes('ai_scoring.operations.cancel')) cancelReason = 'Bạn không có quyền hủy scoring job.';
    else if (!ACTIVE_RUN.has(state.run_status)) cancelReason = 'Chỉ hủy được attempt AI đang xử lý.';
    const canRescore=TERMINAL_RUN.has(state.run_status)&&permissions.includes('ai_scoring.operations.rescore');
    let rescoreReason=null;
    if(!permissions.includes('ai_scoring.operations.rescore'))rescoreReason='Bạn không có quyền chấm lại scoring job.';
    else if(!TERMINAL_RUN.has(state.run_status))rescoreReason='Chỉ chấm lại được attempt đã kết thúc.';
    const canReconcile=Boolean(state.run_id)&&state.run_status!=='CANCELLED'&&Number(state.active_items||0)===0&&permissions.includes('ai_scoring.operations.reconcile');
    let reconcileReason=null;
    if(!permissions.includes('ai_scoring.operations.reconcile'))reconcileReason='Bạn không có quyền đối soát scoring job.';
    else if(!state.run_id)reconcileReason='Job chưa có scoring attempt để đối soát.';
    else if(state.run_status==='CANCELLED')reconcileReason='Attempt đã hủy không được đối soát lại trạng thái.';
    else if(Number(state.active_items||0)>0)reconcileReason='Attempt vẫn còn công việc đang xử lý.';
    return { jobId:id,actions:[
      { key:'retry',label:'Retry job',permission:'ai_scoring.operations.retry',available:allowed,reason,impact:'Tạo attempt mới từ scoring plan hiện tại; kết quả cũ được giữ nguyên.' },
      { key:'cancel',label:'Hủy xử lý',permission:'ai_scoring.operations.cancel',available:canCancel,reason:cancelReason,impact:'Dừng công việc chưa hoàn tất; evidence đã hoàn thành vẫn được giữ lại.',danger:true },
      { key:'rescore',label:'Chấm lại',permission:'ai_scoring.operations.rescore',available:canRescore,reason:rescoreReason,impact:'Tạo run chấm mới và phát sinh model calls; kết quả cũ được giữ nguyên.' },
      { key:'reconcile',label:'Đối soát',permission:'ai_scoring.operations.reconcile',available:canReconcile,reason:reconcileReason,impact:'Tính lại tiến độ và trạng thái từ kết quả đã lưu; không gọi model.' },
    ] };
  }
  async retry(id, body, context = {}) {
    const input = commandInput(body);
    const result = await this.repository.retry({ jobId:jobId(id),...input,actorId:context.actorId,requestId:context.requestId || 'unknown' });
    if (result.missing) throw new HttpError('Không tìm thấy scoring job.',404,'JOB_NOT_FOUND');
    if (result.invalidState) throw new HttpError('Chỉ retry được attempt AI mới nhất đã thất bại.',409,'RETRY_NOT_AVAILABLE',{ status:result.invalidState });
    return result;
  }
  async cancel(id, body, context = {}) {
    const input=commandInput(body);
    const result=await this.repository.cancel({ jobId:jobId(id),...input,actorId:context.actorId,requestId:context.requestId||'unknown' });
    if(result.missing) throw new HttpError('Không tìm thấy scoring job.',404,'JOB_NOT_FOUND');
    if(result.invalidState) throw new HttpError('Chỉ hủy được attempt AI đang xử lý.',409,'CANCEL_NOT_AVAILABLE',{ status:result.invalidState });
    return result;
  }
  async rescore(id,body,context={}){
    const input=commandInput(body);
    const result=await this.repository.rescore({jobId:jobId(id),...input,actorId:context.actorId,requestId:context.requestId||'unknown'});
    if(result.missing)throw new HttpError('Không tìm thấy scoring job.',404,'JOB_NOT_FOUND');
    if(result.invalidState)throw new HttpError('Chỉ chấm lại được attempt đã kết thúc.',409,'RESCORE_NOT_AVAILABLE',{status:result.invalidState});
    return result;
  }
  async reconcile(id,body,context={}){
    const input=commandInput(body);
    const result=await this.repository.reconcile({jobId:jobId(id),...input,actorId:context.actorId,requestId:context.requestId||'unknown'});
    if(result.missing)throw new HttpError('Không tìm thấy scoring job.',404,'JOB_NOT_FOUND');
    if(result.invalidState)throw new HttpError('Attempt đã hủy không thể đối soát lại.',409,'RECONCILE_NOT_AVAILABLE',{status:result.invalidState});
    if(result.activeItems)throw new HttpError('Attempt vẫn còn công việc đang xử lý.',409,'RECONCILE_ACTIVE_ITEMS',{activeItems:result.activeItems});
    return result;
  }
}

module.exports = new JobOperationService();
module.exports.JobOperationService = JobOperationService;
