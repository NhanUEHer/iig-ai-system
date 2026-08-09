import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  AlertCircle, ArrowLeft, BookOpenText, Bot, Check, CheckCircle2, ChevronLeft,
  ChevronRight, Clock3, Headphones, LoaderCircle, Mail, Mic2,
  Phone, RefreshCw, Save, Sparkles, WandSparkles
} from 'lucide-react';
import UnifiedAudioPlayer from '../../../components/audio/UnifiedAudioPlayer';
import AudioReviewPlayer from '../../../components/audio/AudioReviewPlayer';
import { getQuestionType } from '../utils/questionType';
import './SubmissionDetailPage.css';
import './SubmissionDetailRefinements.css';
import './SubmissionActionTools.css';

const API_BASE = '/api/submissions';
const terminalJobs = ['completed', 'completed_with_errors', 'failed'];
const formatDate = value => value ? new Date(value).toLocaleString('vi-VN') : '—';
const statusMeta = {
  pending: ['Chờ chấm', 'pending'], scoring: ['Đang chấm', 'processing'],
  scored: ['Đã chấm', 'success'], error: ['Có lỗi', 'error']
};
const criterionLabels = {
  pronunciation: 'Phát âm', intonation: 'Ngữ điệu', cohesion: 'Mạch lạc', grammar: 'Ngữ pháp',
  vocabulary: 'Từ vựng', completeness: 'Hoàn thành', relevance: 'Phù hợp'
};

function answerStatus(status) {
  const [label, tone] = statusMeta[status] || [status || 'Chờ chấm', 'pending'];
  return <span className={`detail-status ${tone}`}>{status === 'scoring' && <LoaderCircle className="spin" />}{label}</span>;
}

function scoreMaximum(answer) {
  const q = Number(answer.question_no);
  if (answer.section === 'Writing') return q <= 5 ? 3 : q <= 7 ? 4 : 5;
  return q === 11 ? 5 : 3;
}

function EvaluationPanel({ answer }) {
  const maximum = scoreMaximum(answer);
  const criteria = Object.entries(criterionLabels).map(([key, label]) => ({
    key, label, score: answer[`${key}_score`], rationale: answer[`${key}_rationale`]
  })).filter(item => item.score !== null && item.score !== undefined && item.score !== '');
  const hasEvaluation = answer.final_score !== null && answer.final_score !== undefined;
  return <section className="detail-card evaluation-panel">
    <header><div><span className="card-kicker">AI EVALUATION</span><h2>Đánh giá điểm</h2></div>{hasEvaluation && <div className="final-score"><strong>{Math.round(Number(answer.final_score))}</strong><span>/ {maximum}</span></div>}</header>
    {!hasEvaluation && !criteria.length ? <div className="evaluation-empty"><Bot /><strong>Chưa có kết quả AI</strong><span>Chọn “Chấm bằng AI” để tạo đánh giá theo rubric của dạng câu này.</span></div> : <>
      <div className="criteria-grid">{criteria.map(item => <article key={item.key}><div><span>{item.label}</span><strong>{Math.round(Number(item.score))}/{maximum}</strong></div><div className="criterion-track"><i style={{ width: `${Math.min(100, Number(item.score) / maximum * 100)}%` }} /></div>{item.rationale && <p>{item.rationale}</p>}</article>)}</div>
      {(answer.strength || answer.weakness || answer.improvement) && <div className="evaluation-notes">{answer.strength && <article className="positive"><strong>Điểm mạnh</strong><p>{answer.strength}</p></article>}{answer.weakness && <article className="negative"><strong>Cần cải thiện</strong><p>{answer.weakness}</p></article>}{answer.improvement && <article className="suggestion"><strong>Gợi ý luyện tập</strong><p>{answer.improvement}</p></article>}</div>}
    </>}
  </section>;
}

export default function SubmissionDetailPage({ showMsg, addLiveLog }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeAnswer, setActiveAnswer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [section, setSection] = useState('all');
  const [note, setNote] = useState('');
  const [bulkJob, setBulkJob] = useState(null);

  const notify = (text, type = 'success') => showMsg?.(text, type);
  const loadPage = async (keepActive = true) => {
    const [submissionResult, answersResult] = await Promise.all([
      axios.get(`${API_BASE}/${id}`), axios.get(`${API_BASE}/${id}/answers`)
    ]);
    const nextAnswers = answersResult.data.data || [];
    setSubmission(submissionResult.data.data);
    setAnswers(nextAnswers);
    setActiveId(current => keepActive && nextAnswers.some(item => item.id === current) ? current : nextAnswers[0]?.id || null);
  };

  useEffect(() => {
    setLoading(true);
    loadPage(false).catch(error => notify(error.response?.data?.error || 'Không thể tải chi tiết bài thi.', 'error')).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!activeId) return;
    setQuestionLoading(true);
    axios.get(`${API_BASE}/${id}/answers/${activeId}`).then(response => {
      setActiveAnswer(response.data.data);
      setNote(response.data.data.teacher_note || '');
    }).catch(error => notify(error.response?.data?.error || 'Không thể tải chi tiết câu.', 'error')).finally(() => setQuestionLoading(false));
  }, [id, activeId]);

  useEffect(() => {
    if (!bulkJob?.id || terminalJobs.includes(bulkJob.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await axios.get(`${API_BASE}/grading-jobs/${bulkJob.id}`);
        const job = response.data.data;
        setBulkJob(job);
        if (terminalJobs.includes(job.status)) await loadPage();
      } catch (error) { setBulkJob(current => ({ ...current, status: 'failed', pollError: error.message })); }
    }, 2000);
    return () => clearInterval(timer);
  }, [bulkJob?.id, bulkJob?.status]);

  const visibleAnswers = useMemo(() => answers.filter(item => section === 'all' || item.section === section), [answers, section]);
  const stats = useMemo(() => ({
    total: answers.length, scored: answers.filter(item => item.status === 'scored').length,
    pending: answers.filter(item => item.status === 'pending').length,
    errors: answers.filter(item => item.status === 'error').length
  }), [answers]);
  const activeIndex = visibleAnswers.findIndex(item => item.id === activeId);

  const refreshActive = async () => {
    await loadPage();
    if (activeId) {
      const response = await axios.get(`${API_BASE}/${id}/answers/${activeId}`);
      setActiveAnswer(response.data.data);
    }
  };

  const runAction = async (type, endpoint, payload, successMessage) => {
    if (!activeAnswer) return;
    setBusyAction(type);
    try {
      await axios.post(`${API_BASE}/${endpoint}`, { answerId: activeAnswer.id, ...payload });
      notify(successMessage);
      addLiveLog?.(`${successMessage} · ${activeAnswer.section} Q${activeAnswer.question_no}`, 'success');
      await refreshActive();
    } catch (error) { notify(error.response?.data?.error || 'Không thể thực hiện thao tác.', 'error'); }
    finally { setBusyAction(''); }
  };

  const saveNote = async () => {
    setBusyAction('note');
    try { await axios.put(`${API_BASE}/teacher-note`, { answer_id: activeAnswer.id, teacher_note: note }); notify('Đã lưu nhận xét giáo viên.'); await refreshActive(); }
    catch (error) { notify(error.response?.data?.error || 'Không thể lưu nhận xét.', 'error'); }
    finally { setBusyAction(''); }
  };

  const bulkGrade = async () => {
    const targets = selectedIds.filter(answerId => answers.find(item => item.id === answerId)?.status !== 'scored');
    if (!targets.length) return notify('Các câu đã chọn đều đã được chấm.', 'error');
    setBusyAction('bulk-grade');
    try { const response = await axios.post(`${API_BASE}/bulk-grade`, { answerIds: targets }); setBulkJob(response.data.data); notify('Đã đưa các câu vào hàng đợi chấm AI.', 'info'); }
    catch (error) { notify(error.response?.data?.error || 'Không thể tạo hàng đợi chấm.', 'error'); }
    finally { setBusyAction(''); }
  };

  const bulkClean = async () => {
    const targets = selectedIds.filter(answerId => answers.find(item => item.id === answerId)?.student_audio_file_id);
    if (!targets.length) return notify('Các câu đã chọn không có audio cần làm sạch.', 'error');
    setBusyAction('bulk-clean');
    try { const response = await axios.post(`${API_BASE}/bulk-clean-audio`, { answerIds: targets, method: 'ai' }); notify(response.data.message, response.data.data.failed ? 'warning' : 'success'); await loadPage(); }
    catch (error) { notify(error.response?.data?.error || 'Không thể làm sạch audio hàng loạt.', 'error'); }
    finally { setBusyAction(''); }
  };

  if (loading) return <div className="detail-loading"><LoaderCircle className="spin" /><strong>Đang tải không gian chấm bài…</strong></div>;
  if (!submission) return <div className="detail-loading"><AlertCircle /><strong>Không tìm thấy bài thi.</strong><button onClick={() => navigate('/submissions')}>Quay lại</button></div>;

  return <div className="submission-detail-page">
    <header className="detail-page-header compact">
      <div className="detail-title-row"><button className="detail-back compact" onClick={() => navigate('/submissions')} aria-label="Quay lại danh sách"><ArrowLeft /></button><div className="detail-avatar compact">{String(submission.student_name || 'HV').slice(0, 2).toUpperCase()}</div><div className="detail-title"><div><span className="detail-keycode">{submission.keycode}</span>{answerStatus(String(submission.status) === '3' ? 'scored' : String(submission.status) === '2' ? 'scoring' : 'pending')}<span className="detail-test-inline">{submission.test_name}</span></div><h1>{submission.student_name || 'Chưa có tên học viên'}</h1><div className="detail-meta inline"><span><Mail />{submission.student_email || 'Chưa có email'}</span><span><Phone />{submission.student_phone || 'Chưa có SĐT'}</span><span><Clock3 />{formatDate(submission.submitted_date)}</span></div></div><div className="detail-compact-progress"><span>Tiến độ chấm</span><strong>{stats.scored}/{stats.total} <small>· {stats.total ? Math.round(stats.scored / stats.total * 100) : 0}%</small></strong><div><i style={{ width: `${stats.total ? stats.scored / stats.total * 100 : 0}%` }} /></div></div><div className="detail-stat-pills"><span className="success"><b>{stats.scored}</b> Đã chấm</span><span className="pending"><b>{stats.pending}</b> Chờ</span>{stats.errors > 0 && <span className="error"><b>{stats.errors}</b> Lỗi</span>}</div><button className="detail-refresh icon" onClick={() => loadPage()} title="Làm mới"><RefreshCw /></button></div>
    </header>

    <main className="detail-workspace">
      <aside className="question-navigator detail-card">
        <header><div><span className="card-kicker">QUESTION MAP</span><h2>Danh sách câu</h2></div><span>{visibleAnswers.length}</span></header>
        <div className="question-filter"><button className={section === 'all' ? 'active' : ''} onClick={() => setSection('all')}>Tất cả</button><button className={section === 'Speaking' ? 'active' : ''} onClick={() => setSection('Speaking')}>Speaking</button><button className={section === 'Writing' ? 'active' : ''} onClick={() => setSection('Writing')}>Writing</button></div>
        <div className="question-list">{visibleAnswers.map(answer => <button key={answer.id} className={`question-list-item ${answer.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(answer.id)}><input type="checkbox" checked={selectedIds.includes(answer.id)} onClick={event => event.stopPropagation()} onChange={event => setSelectedIds(current => event.target.checked ? [...new Set([...current, answer.id])] : current.filter(idValue => idValue !== answer.id))} /><span className={`question-number ${statusMeta[answer.status]?.[1] || 'pending'}`}>{answer.question_no}</span><span><strong>{answer.section} · Câu {answer.question_no}</strong><small>{getQuestionType(answer).replaceAll('_', ' ')}</small></span>{answer.status === 'scored' ? <CheckCircle2 /> : answer.status === 'error' ? <AlertCircle /> : <Clock3 />}</button>)}</div>
        <footer><button onClick={() => setSelectedIds(visibleAnswers.map(item => item.id))}>Chọn tất cả</button><button onClick={() => setSelectedIds([])}>Bỏ chọn</button></footer>
      </aside>

      <section className="question-workspace">
        {questionLoading || !activeAnswer ? <div className="detail-card question-loading"><LoaderCircle className="spin" />Đang tải nội dung câu…</div> : <>
          <section className="detail-card question-content-card">
            <header><div><span className="card-kicker">{activeAnswer.section.toUpperCase()}</span><h2>Câu {activeAnswer.question_no}</h2></div>{answerStatus(activeAnswer.status)}</header>
            <div className="question-prompt"><BookOpenText /><div><span>Nội dung yêu cầu</span><p>{activeAnswer.prompt_text || activeAnswer.question_title || 'Chưa có nội dung yêu cầu.'}</p></div></div>
            {activeAnswer.image_url && <div className="question-image"><img src={activeAnswer.image_url} alt={`Minh họa câu ${activeAnswer.question_no}`} /></div>}
            {activeAnswer.context_text && <div className="question-text-block"><span>Bối cảnh</span><p>{activeAnswer.context_text}</p></div>}
            {activeAnswer.question_name && <div className="question-text-block accent"><span>Câu hỏi</span><p>{activeAnswer.question_name}</p></div>}
            {(activeAnswer.context_audio_file_id || activeAnswer.question_audio_file_id) && <div className="source-audio-grid">{activeAnswer.context_audio_file_id && <div><span>Audio bối cảnh</span><UnifiedAudioPlayer fileId={activeAnswer.context_audio_file_id} /></div>}{activeAnswer.question_audio_file_id && <div><span>Audio câu hỏi</span><UnifiedAudioPlayer fileId={activeAnswer.question_audio_file_id} /></div>}</div>}
          </section>

          <section className="detail-card student-answer-card"><header><div><span className="card-kicker">STUDENT RESPONSE</span><h2>Bài làm học viên</h2></div></header>
            {activeAnswer.section === 'Writing' ? <div className="writing-response">{activeAnswer.student_writing || 'Học viên chưa có nội dung trả lời.'}</div> : <div className="audio-review-compare"><AudioReviewPlayer fileId={activeAnswer.student_audio_file_id} variant="original" label="Bản ghi gốc" /><AudioReviewPlayer src={activeAnswer.cleaned_audio_url} variant="cleaned" label="Audio sau làm sạch" cleaning={busyAction === 'clean'} onClean={() => runAction('clean', 'clean-audio', { method: 'ai' }, 'Làm sạch audio thành công.')} /></div>}
            {activeAnswer.transcribe && <div className="transcript"><span>Nội dung nhận dạng</span><p>{activeAnswer.transcribe}</p></div>}
            <div className="question-tools"><article className="clean"><span><WandSparkles /></span><div><strong>Làm sạch audio</strong><small>{activeAnswer.cleaned_audio_url ? 'Tạo lại và thay thế audio clean hiện tại' : 'Lọc nhiễu và chuẩn hóa giọng nói'}</small></div><button disabled={!!busyAction || !activeAnswer.student_audio_file_id} onClick={() => runAction('clean', 'clean-audio', { method: 'ai' }, 'Làm sạch audio thành công.')}>{busyAction === 'clean' ? <LoaderCircle className="spin" /> : <WandSparkles />}{busyAction === 'clean' ? 'Đang xử lý' : activeAnswer.cleaned_audio_url ? 'Tạo lại' : 'Làm sạch'}</button></article><article className="stt"><span><Mic2 /></span><div><strong>STT bài nói</strong><small>{activeAnswer.cleaned_audio_url ? 'Đang ưu tiên audio đã làm sạch' : 'Sử dụng audio gốc của học viên'}</small></div><button disabled={!!busyAction || !activeAnswer.student_audio_file_id} onClick={() => runAction('stt', 'transcribe-ai', { targetType: 'student_answer' }, 'Nhận dạng bài nói hoàn tất.')}>{busyAction === 'stt' ? <LoaderCircle className="spin" /> : <Mic2 />}{busyAction === 'stt' ? 'Đang nhận dạng' : 'Chạy STT'}</button></article><article className="grade"><span><Sparkles /></span><div><strong>Chấm điểm AI</strong><small>{activeAnswer.transcribe ? 'Đã có transcript · Sẵn sàng đánh giá' : 'AI tự chuẩn bị dữ liệu trước khi chấm'}</small></div><button disabled={!!busyAction} onClick={() => runAction('grade', 'grade-ai', {}, 'Chấm điểm AI hoàn tất.')}>{busyAction === 'grade' ? <LoaderCircle className="spin" /> : <Sparkles />}{busyAction === 'grade' ? 'Đang chấm' : activeAnswer.final_score !== null && activeAnswer.final_score !== undefined ? 'Chấm lại' : 'Bắt đầu chấm'}</button></article></div>
            {activeAnswer.question_audio_file_id && <div className="secondary-stt-action"><Headphones /><span>Cần lấy lại nội dung audio câu hỏi?</span><button disabled={!!busyAction} onClick={() => runAction('stt-question', 'transcribe-ai', { targetType: 'question' }, 'Nhận dạng câu hỏi hoàn tất.')}>STT câu hỏi</button></div>}
          </section>
          <EvaluationPanel answer={activeAnswer} />
          <section className="detail-card teacher-note"><header><div><span className="card-kicker">HUMAN REVIEW</span><h2>Nhận xét giáo viên</h2></div></header><textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Bổ sung nhận xét, lưu ý hoặc kết luận sau khi kiểm tra kết quả AI…" /><button onClick={saveNote} disabled={busyAction === 'note'}><Save />{busyAction === 'note' ? 'Đang lưu…' : 'Lưu nhận xét'}</button></section>
          <div className="question-pager"><button disabled={activeIndex <= 0} onClick={() => setActiveId(visibleAnswers[activeIndex - 1]?.id)}><ChevronLeft /> Câu trước</button><span>{activeIndex + 1} / {visibleAnswers.length}</span><button disabled={activeIndex < 0 || activeIndex >= visibleAnswers.length - 1} onClick={() => setActiveId(visibleAnswers[activeIndex + 1]?.id)}>Câu sau <ChevronRight /></button></div>
        </>}
      </section>
    </main>

    {selectedIds.length > 0 && <div className="detail-bulk-bar"><div><strong>{selectedIds.length}</strong><span>câu đã chọn</span><button onClick={() => setSelectedIds([])}>Bỏ chọn</button></div><div><button className="clean" disabled={!!busyAction} onClick={bulkClean}><WandSparkles /> Làm sạch audio</button><button className="grade" disabled={!!busyAction} onClick={bulkGrade}><Sparkles /> Chấm AI hàng loạt</button></div></div>}
    {bulkJob && <button className="detail-job-toast" onClick={() => terminalJobs.includes(bulkJob.status) && setBulkJob(null)}><span className={terminalJobs.includes(bulkJob.status) ? 'done' : ''}>{terminalJobs.includes(bulkJob.status) ? <Check /> : <LoaderCircle className="spin" />}</span><div><strong>{terminalJobs.includes(bulkJob.status) ? 'Chấm hàng loạt hoàn tất' : 'Đang chấm hàng loạt'}</strong><small>{Number(bulkJob.completed_items || 0) + Number(bulkJob.failed_items || 0)} / {bulkJob.total_items} câu · {bulkJob.failed_items || 0} lỗi</small><i><b style={{ width: `${bulkJob.total_items ? (Number(bulkJob.completed_items || 0) + Number(bulkJob.failed_items || 0)) / bulkJob.total_items * 100 : 0}%` }} /></i></div></button>}
  </div>;
}
