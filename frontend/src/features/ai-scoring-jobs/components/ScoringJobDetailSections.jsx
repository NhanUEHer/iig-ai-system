import React from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Cpu, Layers3, LoaderCircle, RotateCcw } from 'lucide-react';
import {
  Badge, Button, CodeBlock, DataTable, EmptyState, ProgressBar, StatusBadge, Surface,
} from '../../../design-system-v2';
import { statusLabel, statusTone } from '../utils/scoringJobStatus';

export function AttemptPicker({ attempts, value, onChange }) {
  if (attempts.length < 2) return null;
  return <div className="scoring-attempt-picker" aria-label="Chọn lần chấm">
    <span>Lần chấm</span>
    <div>{attempts.map(attempt => <button type="button" className={value === attempt.id ? 'is-active' : ''} key={attempt.id} onClick={() => onChange(attempt.id)}>
      <strong>#{attempt.run_number}</strong><small>{attempt.run_type}</small>
    </button>)}</div>
  </div>;
}

export function PlanSection({ data }) {
  if (!data?.run) return <Surface><EmptyState icon={<Layers3 />} title="Chưa có kế hoạch chấm" description="Attempt này chưa tạo scoring plan." /></Surface>;
  const run = data.run; const groups = data.groups || [];
  return <Surface className="scoring-plan-section">
    <header className="scoring-section-head">
      <div><h2>Kế hoạch chấm</h2><p>Attempt #{run.run_number} · {run.scoring_policy_version || 'Chưa có policy'}</p></div>
      <div><StatusBadge status={statusTone(run.status)} label={statusLabel(run.status)} /><Badge>{groups.length} nhóm</Badge></div>
    </header>
    <div className="scoring-plan-progress"><ProgressBar value={run.completed_questions || 0} max={run.total_questions || 1} label="Tiến độ xử lý câu" /></div>
    {groups.length ? <div className="scoring-group-list">{groups.map(group => {
      const questionCount = group.applied_question_ids?.length || 0;
      const score = group.final_score == null ? '—' : `${group.final_score}${group.max_score != null ? ` / ${group.max_score}` : ''}`;
      return <article key={group.id}>
        <span className={`scoring-group-list__state is-${statusTone(group.status)}`}>{group.status === 'COMPLETED' ? <CheckCircle2 /> : group.error_code ? <AlertCircle /> : <Clock3 />}</span>
        <div><strong>{group.name || group.group_key}</strong><small>{questionCount} câu áp dụng · {group.aggregation_version || 'Chưa có phiên bản tổng hợp'}</small></div>
        <StatusBadge status={statusTone(group.status)} label={statusLabel(group.status)} />
        <b>{score}</b>
      </article>;
    })}</div> : <EmptyState title="Chưa có nhóm điểm" description="Plan đã tạo nhưng chưa sinh group result." />}
  </Surface>;
}

const timelineKey = event => [event.event_type, event.from_status, event.to_status, event.created_at].join('|');
const formatDateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : '—';

export function TimelineSection({ events }) {
  const unique = [...new Map((events || []).map(event => [timelineKey(event), event])).values()];
  const compact = unique.reduce((result, event) => {
    const transition = [event.event_type, event.from_status, event.to_status, event.details?.reason, event.details?.errorCode].join('|');
    const previous = result[result.length - 1];
    if (previous?._transition === transition) {
      previous._count += 1; previous.created_at = event.created_at; return result;
    }
    return [...result, { ...event, _transition: transition, _count: 1 }];
  }, []);
  if (!compact.length) return <Surface><EmptyState icon={<Clock3 />} title="Chưa có sự kiện xử lý" description="Timeline sẽ xuất hiện khi job bắt đầu chạy." /></Surface>;
  return <Surface className="scoring-timeline-section">
    <header className="scoring-section-head"><div><h2>Timeline xử lý</h2><p>{unique.length} sự kiện · hiển thị {compact.length} mốc vận hành</p></div></header>
    <ol>{compact.map(event => {
      const failed = String(event.to_status).includes('FAILED');
      const detail = event.from_status && event.to_status ? `${statusLabel(event.from_status)} → ${statusLabel(event.to_status)}` : statusLabel(event.to_status || event.event_type);
      return <li className={failed ? 'is-danger' : event.to_status === 'COMPLETED' ? 'is-success' : ''} key={`${event.source}-${event.id}`}>
        <i>{failed ? <AlertCircle /> : event.to_status === 'COMPLETED' ? <CheckCircle2 /> : <span />}</i>
        <div><strong>{statusLabel(event.to_status || event.event_type)}{event._count > 1 && <Badge>{event._count} sự kiện</Badge>}</strong><p>{detail}</p>{(event.details?.reason || event.details?.errorCode) && <small>{event.details.reason || event.details.errorCode}</small>}</div>
        <time>{formatDateTime(event.created_at)}</time>
      </li>;
    })}</ol>
  </Surface>;
}

const traceTone={DONE:'completed',RUNNING:'processing',WAITING:'queued',ERROR:'failed'};
const traceLabel={DONE:'Hoàn tất',RUNNING:'Đang chạy',WAITING:'Đang chờ',ERROR:'Lỗi'};
const traceIcon={DONE:<CheckCircle2/>,RUNNING:<LoaderCircle/>,WAITING:<Clock3/>,ERROR:<AlertCircle/>};

export function PipelineExecutionSection({ data, selectedStepId, onSelect, onRetry }) {
  const steps=data?.steps||[];
  if(!steps.length)return <Surface><EmptyState icon={<Layers3/>} title="Chưa có dữ liệu pipeline" description="Work item sẽ xuất hiện khi job được tiếp nhận."/></Surface>;
  return <Surface className="scoring-pipeline-section">
    <header className="scoring-section-head"><div><h2>Pipeline execution</h2><p>Trạng thái lấy trực tiếp từ durable work item của ingestion và scoring.</p></div><div><Badge>{data.summary?.done||0}/{data.summary?.total||0} hoàn tất</Badge>{data.summary?.error>0&&<Badge tone="danger">{data.summary.error} lỗi</Badge>}</div></header>
    <ol className="scoring-pipeline-trace">{steps.map((step,index)=><li className={`is-${traceTone[step.status]||'queued'}${selectedStepId===step.id?' is-selected':''}`} key={step.id}>
      <button type="button" onClick={()=>onSelect(step)}>
        <i>{traceIcon[step.status]||<Clock3/>}</i><span className="scoring-pipeline-trace__index">{index+1}</span>
        <span className="scoring-pipeline-trace__body"><strong>{step.label}</strong><small>{step.source==='INGESTION'?'Ingestion':`Scoring run #${step.runNumber||'—'}`} · {step.attempts} lượt xử lý</small>{step.error?.message&&<em>{step.error.message}</em>}</span>
        <StatusBadge status={traceTone[step.status]||'queued'} label={traceLabel[step.status]||step.status}/><ChevronRight/>
      </button>
      {step.retry.available&&<Button className="scoring-pipeline-trace__retry" size="sm" variant="outline" icon={<RotateCcw/>} onClick={()=>onRetry(step)}>Retry step</Button>}
    </li>)}</ol>
  </Surface>;
}

export function PipelineStepDetail({ step }) {
  if(!step)return null;
  return <div className="scoring-pipeline-detail">
    <section className="scoring-question-summary"><div><span>Trạng thái</span><StatusBadge status={traceTone[step.status]||'queued'} label={traceLabel[step.status]||step.status}/></div><div><span>Số lượt xử lý</span><strong>{step.attempts}</strong></div><div><span>Loại work item</span><strong>{step.source}</strong></div></section>
    {step.error&&<section className="scoring-question-error"><AlertCircle/><div><strong>Step xử lý lỗi</strong><p>{step.error.message}</p></div></section>}
    <section><h3>Dữ liệu đầu vào</h3><CodeBlock title="Input đã loại bỏ dữ liệu nhạy cảm" value={step.input||{}}/></section>
    <section><h3>Kết quả xử lý</h3><CodeBlock title="Output đã loại bỏ dữ liệu nhạy cảm" value={step.output||{}}/></section>
    {!step.retry.available&&step.retry.reason&&<section><h3>Khả năng retry</h3><p>{step.retry.reason}</p></section>}
  </div>;
}

export function ModelLineageSection({ rows, canView }) {
  if (!canView) return <Surface><EmptyState icon={<Cpu />} title="Không có quyền xem model lineage" description="Cần quyền ai_scoring.jobs.view_model_lineage." /></Surface>;
  return <Surface className="scoring-model-section">
    <header className="scoring-section-head"><div><h2>Model lineage</h2><p>Thông tin kỹ thuật đã loại bỏ prompt và dữ liệu đầu vào nhạy cảm.</p></div><Badge>{rows.length} lượt gọi</Badge></header>
    <DataTable density="compact" ariaLabel="Model lineage" rowKey="id" rows={rows} emptyTitle="Chưa có model execution" columns={[
      { key: 'stage', label: 'Công đoạn', width: 190, render: row => <strong>{statusLabel(row.stage)}</strong> },
      { key: 'model', label: 'Model', render: row => <span className="scoring-model-cell"><strong>{row.model_name || '—'}</strong><small>{row.provider || '—'}{row.model_version ? ` · ${row.model_version}` : ''}</small></span> },
      { key: 'prompt', label: 'Phiên bản', width: 150, render: row => row.prompt_version || '—' },
      { key: 'status', label: 'Trạng thái', width: 150, render: row => <StatusBadge status={statusTone(row.status)} label={statusLabel(row.status)} /> },
      { key: 'latency', label: 'Độ trễ', width: 110, render: row => row.latency_ms == null ? '—' : `${row.latency_ms} ms` },
    ]} />
  </Surface>;
}

export function QuestionDetail({ question }) {
  const criteria = question.criteria_scores && typeof question.criteria_scores === 'object' ? Object.entries(question.criteria_scores).filter(([name, value]) => /score/i.test(name) && (typeof value === 'number' || Number.isFinite(Number(value)) || value?.score != null)) : [];
  return <div className="scoring-question-detail">
    <section className="scoring-question-summary">
      <div><span>Điểm</span><strong>{question.llm_score ?? '—'}</strong></div>
      <div><span>Độ tin cậy</span><strong>{question.llm_confidence == null ? '—' : `${Math.round(Number(question.llm_confidence) * 100)}%`}</strong></div>
      <div><span>Trạng thái</span><StatusBadge status={statusTone(question.status)} label={statusLabel(question.status)} /></div>
    </section>
    {criteria.length > 0 && <section><h3>Điểm thành phần</h3><div className="scoring-criteria-list">{criteria.map(([name, score]) => <span key={name}><small>{name}</small><strong>{score && typeof score === 'object' ? score.score ?? '—' : score ?? '—'}</strong></span>)}</div></section>}
    {question.prompt_text && <section><h3>Đề bài</h3><p>{question.prompt_text}</p></section>}
    <section><h3>Transcript</h3><p>{question.transcript || 'Chưa có transcript.'}</p><small>{question.transcription_provider && `${question.transcription_provider} · ${question.transcription_model || ''}`}</small></section>
    {question.error_code && <section className="scoring-question-error"><AlertCircle /><div><strong>{question.error_code}</strong><p>{question.error_message}</p></div></section>}
  </div>;
}

export function RetryBadge({ count }) {
  if (!count) return '—';
  return <Badge tone="warning" icon={<RotateCcw />}>{count}</Badge>;
}
