import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleStop, RefreshCw, RotateCcw } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Badge, Button, DataTable, DateTimeDisplay, DetailTemplate,
  Drawer, EmptyState, FormField, JobIdentity, Modal, ProgressBar, Skeleton, StatusBadge, Surface, Textarea,
} from '../../../design-system-v2';
import {
  cancelScoringJob, getScoringJob, getScoringJobAttempts, getScoringJobAvailableActions, getScoringJobModelExecutions, getScoringJobPipeline,
  getScoringJobPlan, getScoringJobQuestion, getScoringJobQuestions, getScoringJobTimeline,
  reconcileScoringJob, rescoreScoringJob, retryScoringJob, retryScoringStep,
} from '../../../services/aiScoringJobService';
import {
  AttemptPicker, ModelLineageSection, PipelineExecutionSection, PipelineStepDetail, PlanSection, QuestionDetail, RetryBadge,
  TimelineSection,
} from '../components/ScoringJobDetailSections';
import { STATUS_LABEL, statusTone } from '../utils/scoringJobStatus';
import './ScoringJobDetailPage.css';

const duration=(start,end)=>{if(!start)return '—';const ms=new Date(end||Date.now())-new Date(start);return ms<60000?`${Math.max(1,Math.round(ms/1000))} giây`:ms<3600000?`${Math.round(ms/60000)} phút`:`${Math.round(ms/360000)/10} giờ`;};
const tabs=[{value:'overview',label:'Tổng quan'},{value:'pipeline',label:'Pipeline'},{value:'plan',label:'Kế hoạch chấm'},{value:'questions',label:'Câu hỏi'},{value:'timeline',label:'Timeline'},{value:'models',label:'Model lineage'}];

export default function ScoringJobDetailPage({ currentUser }) {
  const { jobId }=useParams(); const [params,setParams]=useSearchParams();
  const tab=params.get('tab')||'overview'; const [overview,setOverview]=useState(null); const [attempts,setAttempts]=useState([]); const [actions,setActions]=useState([]); const [selectedRunId,setSelectedRunId]=useState(null); const [data,setData]=useState(null); const [loading,setLoading]=useState(true); const [tabLoading,setTabLoading]=useState(false); const [error,setError]=useState(''); const [selectedQuestion,setSelectedQuestion]=useState(null); const [selectedStep,setSelectedStep]=useState(null); const [operation,setOperation]=useState(null); const [reason,setReason]=useState(''); const [operationLoading,setOperationLoading]=useState(false); const [operationResult,setOperationResult]=useState('');
  const canLineage=currentUser?.permissions?.includes('ai_scoring.jobs.view_model_lineage');
  const pipelineRunning=Number(data?.summary?.running||0); const pipelineWaiting=Number(data?.summary?.waiting||0);
  const loadOverview=useCallback(async()=>{setLoading(true);setError('');try{const [job,runs,available]=await Promise.all([getScoringJob(jobId),getScoringJobAttempts(jobId),getScoringJobAvailableActions(jobId)]);setOverview(job);setAttempts(runs);setActions(available.actions||[]);setSelectedRunId(current=>runs.some(run=>run.id===current)?current:job.run_id||runs[0]?.id||null);}catch(e){setError(e.response?.data?.error||'Không thể tải chi tiết scoring job.');}finally{setLoading(false);}},[jobId]);
  useEffect(()=>{loadOverview();},[loadOverview]);
  useEffect(()=>{if(tab==='overview'){setData(null);return;}let active=true;setTabLoading(true);setError('');const request=tab==='pipeline'?getScoringJobPipeline(jobId,selectedRunId):tab==='plan'?getScoringJobPlan(jobId,selectedRunId):tab==='questions'?getScoringJobQuestions(jobId,selectedRunId):tab==='timeline'?getScoringJobTimeline(jobId):canLineage?getScoringJobModelExecutions(jobId):Promise.resolve([]);request.then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.response?.data?.error||'Không thể tải dữ liệu tab.');}).finally(()=>{if(active)setTabLoading(false);});return()=>{active=false;};},[tab,jobId,selectedRunId,canLineage]);
  useEffect(()=>{if(tab!=='pipeline'||(pipelineRunning===0&&pipelineWaiting===0))return undefined;let active=true;const timer=setInterval(()=>{getScoringJobPipeline(jobId,selectedRunId).then(value=>{if(active)setData(value);}).catch(()=>{});},5000);return()=>{active=false;clearInterval(timer);};},[tab,jobId,selectedRunId,pipelineRunning,pipelineWaiting]);
  const status=overview?.run_status||overview?.job_status;
  const completed=Number(overview?.completed_questions||overview?.ready_questions||0);
  const total=Number(overview?.run_total||overview?.total_questions||0);
  const identity=overview?<JobIdentity
    keycode={overview.keycode}
    jobId={overview.id}
    secondaryId={overview.source_scoring_id}
    tenant={overview.tenant_name||'Dữ liệu cũ'}
    scope={overview.run_type||'Legacy'}
    status={statusTone(status)}
    statusLabel={STATUS_LABEL[status]||status}
    metrics={[
      {label:'Tiến độ',value:total?`${completed}/${total}`:'—'},
      {label:'Thời lượng',value:duration(overview.run_started_at||overview.started_at,overview.run_completed_at||overview.completed_at)},
      {label:'Retry',value:Number(overview.retry_count||0)},
    ]}
  />:<Skeleton lines={3}/>;
  const openQuestion=async row=>{setSelectedQuestion({loading:true,title:row.source_question_id||row.question_key});try{setSelectedQuestion(await getScoringJobQuestion(jobId,row.question_id));}catch(e){setSelectedQuestion({error:e.response?.data?.error||'Không thể tải câu hỏi.',title:row.source_question_id||row.question_key});}};
  const submitOperation=async()=>{if(reason.trim().length<3||!operation)return;setOperationLoading(true);setError('');try{const payload={reason:reason.trim(),idempotencyKey:crypto.randomUUID()};if(operation.key==='cancel')await cancelScoringJob(jobId,payload);else if(operation.key==='rescore')await rescoreScoringJob(jobId,payload);else if(operation.key==='reconcile')await reconcileScoringJob(jobId,payload);else if(operation.key==='stepRetry')await retryScoringStep(jobId,operation.step.id,payload);else await retryScoringJob(jobId,payload);const label=operation.key==='cancel'?'Đã hủy attempt đang xử lý. Evidence hoàn tất trước đó vẫn được giữ nguyên.':operation.key==='rescore'?'Đã tạo run chấm lại. Kết quả của run cũ vẫn được giữ nguyên.':operation.key==='reconcile'?'Đã đối soát tiến độ và trạng thái từ dữ liệu đã lưu. Không phát sinh model call.':operation.key==='stepRetry'?`Đã đưa step “${operation.step.label}” vào hàng đợi xử lý lại.`:'Đã tạo attempt retry mới. Kết quả của attempt cũ vẫn được giữ nguyên.';setOperation(null);setReason('');setSelectedStep(null);setOperationResult(label);await loadOverview();if(tab==='pipeline')setData(await getScoringJobPipeline(jobId,selectedRunId));}catch(e){setError(e.response?.data?.error||'Không thể thực hiện thao tác vận hành.');}finally{setOperationLoading(false);}};
  const questionColumns=useMemo(()=>[
    {key:'number',label:'Câu',width:80,render:row=>row.question_number||'—'},
    {key:'identity',label:'Câu hỏi',width:240,render:row=><span className="scoring-question-cell"><strong>{row.source_question_id||row.question_key}</strong><small>{row.group_ids?.join(' · ')||row.scorer_type}</small></span>},
    {key:'section',label:'Section',width:150,render:row=>row.section_name},
    {key:'status',label:'Trạng thái',width:160,render:row=><StatusBadge status={statusTone(row.status)} label={STATUS_LABEL[row.status]||row.status}/>},
    {key:'score',label:'Điểm',align:'center',width:90,render:row=>row.llm_score??'—'},
    {key:'retry',label:'Retry',align:'center',width:80,render:row=><RetryBadge count={row.retry_count}/>},
    {key:'duration',label:'Thời lượng',width:110,render:row=>duration(row.started_at,row.completed_at)},
  ],[]);
  if(loading)return <div className="scoring-job-detail-screen"><Skeleton lines={8}/></div>;
  if(!overview)return <div className="scoring-job-detail-screen"><Alert tone="danger" title="Không thể mở scoring job">{error}</Alert></div>;
  const availableActions=actions.filter(action=>action.available);
  const actionSummary=availableActions[0]?.impact||actions.find(action=>action.key==='cancel')?.reason||actions.find(action=>action.key==='retry')?.reason||'Không có thao tác khả dụng cho trạng thái hiện tại.';
  const overviewContent=<><Surface className="scoring-operation-bar"><div><strong>Thao tác vận hành</strong><small>{actionSummary}</small></div><span className="scoring-operation-bar__actions">{availableActions.map(action=><Button key={action.key} size="sm" variant={action.danger?'danger':'outline'} icon={action.key==='cancel'?<CircleStop/>:action.key==='reconcile'?<RefreshCw/>:<RotateCcw/>} onClick={()=>{setOperation(action);setOperationResult('');}}>{action.label}</Button>)}</span></Surface><Surface><h2>Lịch sử attempt</h2>{attempts.length?<DataTable ariaLabel="Lịch sử attempt" rowKey="id" rows={attempts} columns={[{key:'run',label:'Run',render:r=>`#${r.run_number}`},{key:'type',label:'Loại',render:r=><Badge>{r.run_type}</Badge>},{key:'status',label:'Trạng thái',render:r=><StatusBadge status={statusTone(r.status)} label={STATUS_LABEL[r.status]||r.status}/>},{key:'progress',label:'Tiến độ',render:r=><ProgressBar value={r.completed_questions} max={r.total_questions||1}/>},{key:'requested',label:'Yêu cầu lúc',render:r=><DateTimeDisplay value={r.requested_at}/>} ]}/>:<EmptyState title="Chưa có scoring attempt" description="Job mới chỉ có dữ liệu ingestion."/>}</Surface></>;
  const attemptPicker=<AttemptPicker attempts={attempts} value={selectedRunId} onChange={setSelectedRunId}/>;
  const planContent=<>{attemptPicker}<PlanSection data={data}/></>;
  const pipelineContent=<>{attemptPicker}<PipelineExecutionSection data={data} selectedStepId={selectedStep?.id} onSelect={setSelectedStep} onRetry={step=>{setOperation({key:'stepRetry',step});setReason('');}}/></>;
  const rows=Array.isArray(data)?data:[];
  const timelineContent=<TimelineSection events={rows}/>;
  const modelContent=<ModelLineageSection rows={rows} canView={canLineage}/>;
  const questionsContent=<>{attemptPicker}<Surface className="scoring-questions-section"><header className="scoring-section-head"><div><h2>Câu hỏi</h2><p>{rows.length} câu trong scoring plan của attempt đã chọn</p></div></header><DataTable density="compact" ariaLabel="Câu hỏi trong scoring plan" rowKey="id" rows={rows} columns={questionColumns} emptyTitle="Chưa có question run" emptyDescription="Attempt này chưa sinh dữ liệu chấm theo câu." onRowClick={openQuestion}/></Surface></>;
  const cancelling=operation?.key==='cancel'; const rescoring=operation?.key==='rescore'; const reconciling=operation?.key==='reconcile'; const retryingStep=operation?.key==='stepRetry';
  const modalTitle=cancelling?'Hủy scoring job?':rescoring?'Chấm lại scoring job?':reconciling?'Đối soát scoring job?':retryingStep?'Retry step xử lý?':'Retry scoring job?';
  const modalDescription=cancelling?'Công việc chưa hoàn tất sẽ dừng. External call đã gửi có thể vẫn hoàn tất nhưng không được hồi sinh attempt.':rescoring?'Hệ thống sẽ tạo một run mới và gọi lại model. Run cùng kết quả hiện tại không bị thay đổi.':reconciling?'Hệ thống sẽ tính lại tiến độ và trạng thái từ kết quả câu hỏi/nhóm đã lưu. Không gọi model và không thay đổi điểm chi tiết.':retryingStep?`Chỉ step “${operation.step.label}” được đưa lại vào hàng đợi. Các step đã hoàn tất vẫn được giữ nguyên.`:'Hệ thống sẽ tạo một attempt mới và giữ nguyên toàn bộ kết quả cũ.';
  return <div className="scoring-job-detail-screen"><DetailTemplate breadcrumb={[{label:'AI Scoring'},{label:'Scoring jobs'},{label:overview.keycode}]} identity={identity} tabs={tabs} activeTab={tab} onTab={value=>setParams({tab:value})}>{operationResult&&<Alert tone="success" title="Thao tác đã được tiếp nhận">{operationResult}</Alert>}{error&&<Alert tone="danger" title="Có lỗi" action={<Button size="sm" variant="outline" icon={<RefreshCw/>} onClick={loadOverview}>Thử lại</Button>}>{error}</Alert>}{tabLoading?<Surface className="scoring-tab-loading"><Skeleton lines={8}/></Surface>:tab==='overview'?overviewContent:tab==='pipeline'?pipelineContent:tab==='plan'?planContent:tab==='questions'?questionsContent:tab==='timeline'?timelineContent:modelContent}</DetailTemplate><Drawer open={Boolean(selectedQuestion)} title={selectedQuestion?.source_question_id||selectedQuestion?.title||'Chi tiết câu hỏi'} description={selectedQuestion?.question_key} onClose={()=>setSelectedQuestion(null)}>{selectedQuestion?.loading?<Skeleton lines={6}/>:selectedQuestion?.error?<Alert tone="danger" title="Không thể tải">{selectedQuestion.error}</Alert>:selectedQuestion&&<QuestionDetail question={selectedQuestion}/>}</Drawer><Drawer open={Boolean(selectedStep)} title={selectedStep?.label||'Chi tiết step'} description={selectedStep?.type} onClose={()=>setSelectedStep(null)} footer={selectedStep?.retry.available?<Button icon={<RotateCcw/>} onClick={()=>setOperation({key:'stepRetry',step:selectedStep})}>Retry step</Button>:null}>{selectedStep&&<PipelineStepDetail step={selectedStep}/>}</Drawer><Modal open={Boolean(operation)} title={modalTitle} description={modalDescription} size="sm" onClose={()=>!operationLoading&&setOperation(null)} footer={<><Button variant="outline" disabled={operationLoading} onClick={()=>setOperation(null)}>Đóng</Button><Button variant={cancelling?'danger':'primary'} loading={operationLoading} disabled={reason.trim().length<3} onClick={submitOperation}>{cancelling?'Xác nhận hủy':rescoring?'Tạo run chấm lại':reconciling?'Chạy đối soát':retryingStep?'Retry step':'Tạo attempt retry'}</Button></>}><FormField label="Lý do" required><Textarea rows="4" autoFocus value={reason} onChange={event=>setReason(event.target.value)} placeholder={cancelling?'Nhập lý do hủy…':rescoring?'Nhập lý do chấm lại…':reconciling?'Nhập lý do đối soát…':retryingStep?'Nhập lý do retry step…':'Nhập lý do retry…'} maxLength={1000}/>{rescoring&&<small className="scoring-operation-warning">Thao tác này sẽ phát sinh model calls và chi phí mới.</small>}</FormField></Modal></div>;
}
