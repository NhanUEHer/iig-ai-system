import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search, Users } from 'lucide-react';
import { Button, Combobox, IconButton } from '../../../components/ui';
import { exportExamCandidates, getExamCandidateFilterOptions, listExamCandidates } from '../../../services/examCandidateService';
import './ExamCandidateListPage.css';
import './ExamCandidateListState.css';

const statusLabels = {
  REGISTERED: 'Chưa làm bài', IN_PROGRESS: 'Đang làm bài', SUBMITTED: 'Đã nộp bài',
  EXPIRED: 'Hết giờ', CANCELLED: 'Đã hủy',
};
const date = value => value ? new Date(value).toLocaleString('vi-VN', {
  hour12: false, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
}) : '—';
const initials = name => String(name || 'TS').split(/\s+/).filter(Boolean).slice(-2).map(word => word[0]).join('').toUpperCase();
const duration = seconds => {
  if (seconds == null) return '—';
  const value = Math.max(0, Number(seconds));
  return `${Math.floor(value / 60)} phút ${value % 60} giây`;
};
const range = activity => activity.scoreRangeMin == null
  ? '—'
  : `${activity.scoreRangeMin} – ${activity.scoreRangeMax ?? activity.scoreRangeMin}`;

export default function ExamCandidateListPage({ showMsg, canExport = false }) {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', examIds: '', attemptStatuses: '', schools: '', page: 1, limit: 10 });
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [options, setOptions] = useState({ exams: [], schools: [], attemptStatuses: [] });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const showMsgRef = useRef(showMsg);
  useEffect(() => { showMsgRef.current = showMsg; }, [showMsg]);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { setResult(await listExamCandidates(filters)); }
    catch (error) {
      const message = error.response?.data?.error || 'Không thể tải hoạt động thí sinh.';
      setLoadError(message); showMsgRef.current?.(message, 'error');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getExamCandidateFilterOptions().then(setOptions).catch(() => setOptions({ exams: [], schools: [], attemptStatuses: [] }));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setFilters(current => ({ ...current, search: searchInput.trim(), page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const update = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
  const reset = () => {
    setSearchInput('');
    setFilters(current => ({ ...current, search: '', examIds: '', attemptStatuses: '', schools: '', page: 1 }));
  };
  const download = async () => {
    try {
      setExporting(true);
      const blob = await exportExamCandidates(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `hoat-dong-thi-sinh-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click();
      URL.revokeObjectURL(url);
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xuất dữ liệu thí sinh.', 'error'); }
    finally { setExporting(false); }
  };

  const meta = result.meta || {};
  const rows = result.data || [];
  const withAll = (label, items) => [{ value: '', label }, ...(items || [])];

  return <section className="candidate-list-page">
    <header className="candidate-list-header"><nav><span>Quản lý nội dung</span><i>/</i><strong>Hoạt động thí sinh</strong></nav></header>
    <main className="candidate-list-main">
      <section className="candidate-list-toolbar">
        <label className="candidate-list-search"><Search /><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Tìm tên, SBD, email, số điện thoại hoặc đề thi..." /></label>
        <Combobox value={filters.examIds} onChange={value => update('examIds', value)} options={withAll('Tất cả đề thi', options.exams)} placeholder="Tất cả đề thi" searchable loading={loading && !options.exams.length} />
        <Combobox value={filters.attemptStatuses} onChange={value => update('attemptStatuses', value)} options={withAll('Tất cả trạng thái', options.attemptStatuses)} placeholder="Tất cả trạng thái" searchable={false} />
        <Combobox value={filters.schools} onChange={value => update('schools', value)} options={withAll('Tất cả trường / đơn vị', options.schools)} placeholder="Trường / Đơn vị" searchable loading={loading && !options.schools.length} />
        <div className="candidate-list-actions">
          <IconButton size="sm" className="refresh" onClick={reset} title="Làm mới bộ lọc" aria-label="Làm mới bộ lọc"><RefreshCw /></IconButton>
          {canExport && <Button size="sm" variant="outline" className="export" icon={<Download />} onClick={download} loading={exporting}>{exporting ? 'Đang xuất...' : 'Xuất Excel'}</Button>}
        </div>
      </section>

      <section className="candidate-list-card"><div className="candidate-list-scroll"><table><thead><tr>
        <th>THÍ SINH</th><th>LIÊN HỆ</th><th>TRƯỜNG / ĐƠN VỊ</th><th>ĐỀ THI</th><th>TRẠNG THÁI</th>
        <th>BẮT ĐẦU</th><th>NỘP BÀI</th><th>THỜI GIAN LÀM</th><th>KẾT QUẢ</th><th className="right">ĐIỂM</th>
      </tr></thead><tbody>{loading
        ? <tr><td colSpan="10" className="candidate-list-empty"><span className="candidate-loading" /><strong>Đang tải hoạt động...</strong></td></tr>
        : loadError
          ? <tr><td colSpan="10" className="candidate-list-empty candidate-list-error"><Users /><strong>Không tải được hoạt động thí sinh</strong><small>{loadError}</small><Button size="sm" variant="secondary" icon={<RefreshCw />} onClick={load}>Thử lại</Button></td></tr>
          : rows.length === 0
            ? <tr><td colSpan="10" className="candidate-list-empty"><Users /><strong>Chưa có hoạt động phù hợp</strong></td></tr>
            : rows.map((row, index) => <tr key={row.id}>
              <td><div className={`candidate-name color-${index % 6}`}><i>{initials(row.candidate.fullName)}</i><span><strong>{row.candidate.fullName}</strong><small>SBD: {row.candidate.candidateNumber}</small></span></div></td>
              <td><div className="candidate-event"><strong>{row.candidate.phone || '—'}</strong><small>{row.candidate.email || '—'}</small></div></td>
              <td>{row.candidate.schoolName || '—'}</td>
              <td><div className="candidate-event"><strong>{row.exam?.title || 'Chưa chọn đề'}</strong><small>{row.exam?.code || '—'}</small></div></td>
              <td><div className="candidate-attempt"><strong className={`is-${String(row.activity.status).toLowerCase()}`}>{statusLabels[row.activity.status] || row.activity.status}</strong><small>{row.activity.answeredCount == null ? 'Chưa có dữ liệu' : `${row.activity.answeredCount}/${row.activity.totalQuestions} câu đã làm`}</small></div></td>
              <td>{date(row.activity.startedAt)}</td><td>{date(row.activity.submittedAt)}</td><td>{duration(row.activity.durationSeconds)}</td>
              <td><div className="candidate-attempt"><strong>{row.activity.correctCount ?? '—'} đúng · {row.activity.incorrectCount ?? '—'} sai</strong><small>Dãy điểm: {range(row.activity)}</small></div></td>
              <td className="right"><b>{row.activity.totalScore ?? '—'}{row.activity.maxScore != null ? ` / ${row.activity.maxScore}` : ''}</b></td>
            </tr>)}</tbody></table></div>
        <footer><span>Tổng số: <b>{meta.total || 0}</b> hoạt động</span><div><label>Hiển thị <select value={filters.limit} onChange={event => update('limit', Number(event.target.value))}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select> / trang</label><IconButton size="sm" aria-label="Trang trước" disabled={(meta.page || 1) <= 1} onClick={() => update('page', (meta.page || 1) - 1)}><ChevronLeft /></IconButton><b>{meta.page || 1} / {meta.totalPages || 1}</b><IconButton size="sm" aria-label="Trang sau" disabled={(meta.page || 1) >= (meta.totalPages || 1)} onClick={() => update('page', (meta.page || 1) + 1)}><ChevronRight /></IconButton></div></footer>
      </section>
    </main>
  </section>;
}
