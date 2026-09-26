import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, FileQuestion, RefreshCw, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { EXAM_STATUS_OPTIONS, examStatusMeta } from '../../exams/examStatus';
import './ExamPickerModal.css';

const minutes = exam => Math.round(Number(exam.durationSeconds || 0) / 60);

export default function ExamPickerModal({ open, exams, selectedId, onClose, onConfirm }) {
  const [draftId, setDraftId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [duration, setDuration] = useState('all');
  useEffect(() => { if (open) { setDraftId(selectedId || ''); setSearch(''); setStatus('all'); setDuration('all'); } }, [open, selectedId]);
  useEffect(() => { if (!open) return undefined; const previous = document.body.style.overflow; const close = event => event.key === 'Escape' && onClose(); document.body.style.overflow = 'hidden'; window.addEventListener('keydown', close); return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); }; }, [open, onClose]);
  const rows = useMemo(() => { const query = search.trim().toLocaleLowerCase('vi'); return exams.filter(exam => (!query || `${exam.title || ''} ${exam.examCode || ''}`.toLocaleLowerCase('vi').includes(query)) && (status === 'all' || exam.status === status) && (duration === 'all' || minutes(exam) === Number(duration))); }, [duration, exams, search, status]);
  const selected = exams.find(exam => exam.id === draftId && exam.status === 'ACTIVE');
  if (!open) return null;
  return createPortal(<div className="exam-picker-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="exam-picker-modal" role="dialog" aria-modal="true" aria-labelledby="exam-picker-title">
    <header><div className="exam-picker-heading"><i><FileQuestion /></i><span><h3 id="exam-picker-title">Chọn đề thi áp dụng cho kỳ thi</h3><p>Tìm kiếm và lựa chọn đề thi phù hợp từ ngân hàng đề thi để gán cho kỳ thi này.</p></span></div><button type="button" onClick={onClose} title="Đóng"><X /></button></header>
    <div className="exam-picker-filters"><label className="exam-picker-search"><Search /><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm theo tên đề thi, mã đề thi..." /></label><label><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tất cả trạng thái</option>{EXAM_STATUS_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown /></label><label><select value={duration} onChange={event => setDuration(event.target.value)}><option value="all">Thời gian làm bài</option><option value="45">45 phút</option><option value="60">60 phút</option><option value="90">90 phút</option><option value="120">120 phút</option></select><ChevronDown /></label><button type="button" onClick={() => { setSearch(''); setStatus('all'); setDuration('all'); }}><RefreshCw />Đặt lại</button></div>
    <div className="exam-picker-table-wrap"><table><thead><tr><th /><th>Mã đề thi</th><th>Tên đề thi</th><th>Số phần</th><th>Tổng câu</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody>{rows.map(exam => { const meta = examStatusMeta(exam.status); const checked = draftId === exam.id; const selectable = exam.status === 'ACTIVE'; return <tr key={exam.id} className={`${checked ? 'selected ' : ''}${selectable ? '' : 'disabled'}`} onClick={() => selectable && setDraftId(exam.id)}><td><input type="radio" name="selected-exam" checked={checked} disabled={!selectable} onChange={() => selectable && setDraftId(exam.id)} /></td><td><code>{exam.examCode || '—'}</code></td><td><strong>{exam.title}</strong><small>{exam.description || 'Đề thi trong ngân hàng đề thi'}</small></td><td>{exam.partCount || 0} phần</td><td>{exam.subQuestionCount || exam.parentQuestionCount || 0} câu</td><td>{minutes(exam)} phút</td><td><em className={meta.tone}><i />{meta.label}</em></td></tr>; })}{rows.length === 0 && <tr className="empty"><td colSpan="7">Không tìm thấy đề thi phù hợp.</td></tr>}</tbody></table></div>
    <footer><div><span>Đã chọn:</span>{selected ? <strong><Check />{selected.title} ({selected.examCode})</strong> : <small>Chưa chọn đề thi sẵn sàng</small>}</div><aside><button type="button" onClick={onClose}>Hủy</button><button type="button" disabled={!selected} onClick={() => onConfirm(selected.id)}><Check />Xác nhận chọn đề</button></aside></footer>
  </section></div>, document.body);
}
