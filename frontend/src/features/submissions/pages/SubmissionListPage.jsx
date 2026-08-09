import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Clock3, Download,
  Eye, FileSpreadsheet, FileText, RefreshCw, Search, Sparkles, Trash2, UploadCloud, X
} from 'lucide-react';
import './SubmissionListPage.css';
import './SubmissionListDark.css';
import './SubmissionGrading.css';
import './SubmissionSync.css';

const API_BASE = '/api/submissions';
const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: '1', label: 'Chưa chấm' },
  { value: '2', label: 'Đang chấm' },
  { value: '3', label: 'Đã chấm' },
  { value: '4', label: 'Lỗi' }
];

const formatDate = value => value
  ? new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—';

export default function SubmissionListPage({
  submissions = [], meta = { page: 1, limit: 10, total: 0, totalPages: 1 }, loading, statusFilter, setStatusFilter,
  getStatusBadge, navigate, onRefresh, onStartSync
}) {
  const [searchKey, setSearchKey] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [keycode, setKeycode] = useState('');
  const [syncValidation, setSyncValidation] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [gradingJob, setGradingJob] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => onRefresh?.({ page: currentPage, limit: pageSize, search: searchKey.trim() || undefined, status: statusFilter === 'all' ? undefined : statusFilter }), 250);
    return () => clearTimeout(timer);
  }, [currentPage, pageSize, searchKey, statusFilter]);

  useEffect(() => {
    if (!gradingJob?.id || ['completed', 'completed_with_errors', 'failed'].includes(gradingJob.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await axios.get(`${API_BASE}/grading-jobs/${gradingJob.id}`);
        const job = response.data.data;
        setGradingJob(job);
        if (['completed', 'completed_with_errors', 'failed'].includes(job.status)) {
          setSelectedIds([]);
          onRefresh?.();
        }
      } catch (error) {
        setGradingJob(current => ({ ...current, status: 'failed', pollError: error.response?.data?.error || 'Mất kết nối theo dõi job.' }));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [gradingJob?.id, gradingJob?.status, onRefresh]);

  const counts = useMemo(() => ({
    total: meta.total,
    pending: submissions.filter(item => Number(item.status) === 1).length,
    grading: submissions.filter(item => Number(item.status) === 2).length,
    graded: submissions.filter(item => Number(item.status) === 3).length,
    error: submissions.filter(item => Number(item.status) === 4).length
  }), [submissions, meta.total]);

  const displayList = submissions;
  const totalPages = meta.totalPages || 1;
  const normalizedStatus = statusFilter === 'all' ? '' : String(statusFilter || '');
  const safePage = Math.min(meta.page || currentPage, totalPages);
  const pageItems = displayList;
  const pageIds = pageItems.map(item => item.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.includes(id));

  const chooseStatus = value => {
    setStatusFilter(value || 'all');
    setCurrentPage(1);
    setSelectedIds([]);
  };

  const togglePage = checked => setSelectedIds(current => checked
    ? [...new Set([...current, ...pageIds])]
    : current.filter(id => !pageIds.includes(id)));

  const parsedKeycodes = useMemo(() => [...new Set(keycode.split(/[\n,]+/).map(value => value.trim().toUpperCase()).filter(Boolean))], [keycode]);
  const syncSubmission = () => {
    if (!parsedKeycodes.length) return setSyncValidation('Vui lòng nhập ít nhất một keycode.');
    const invalid = parsedKeycodes.filter(value => !/^[A-Z0-9-]{3,20}$/.test(value));
    if (invalid.length) return setSyncValidation(`Keycode không hợp lệ: ${invalid.join(', ')}`);
    setSyncValidation('');
    setShowSyncModal(false);
    onStartSync?.(parsedKeycodes);
  };

  const removeOne = async item => {
    if (Number(item.status) !== 1 || !window.confirm(`Xóa bài ${item.keycode}?`)) return;
    try { await axios.delete(`${API_BASE}/${item.id}`); await onRefresh?.(); }
    catch (error) { window.alert(error.response?.data?.error || 'Không thể xóa bài.'); }
  };

  const removeSelected = async () => {
    if (!selectedIds.length || !window.confirm(`Xóa các bài chưa chấm trong ${selectedIds.length} bài đã chọn?`)) return;
    setActionBusy(true);
    try {
      await axios.post(`${API_BASE}/bulk-delete`, { ids: selectedIds });
      setSelectedIds([]);
      await onRefresh?.();
    } catch (error) { window.alert(error.response?.data?.error || 'Không thể xóa các bài đã chọn.'); }
    finally { setActionBusy(false); }
  };

  const exportSelected = async () => {
    if (!selectedIds.length) return;
    setActionBusy(true);
    try {
      const response = await axios.post(`${API_BASE}/export`, { submissionIds: selectedIds }, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `iig-scoring-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { window.alert(error.response?.data?.error || 'Không thể xuất dữ liệu.'); }
    finally { setActionBusy(false); }
  };

  const gradeSelected = async () => {
    if (!selectedIds.length) return;
    setActionBusy(true);
    try {
      const response = await axios.post(`${API_BASE}/bulk-grade`, { submissionIds: selectedIds });
      setGradingJob(response.data.data);
    } catch (error) { window.alert(error.response?.data?.error || 'Không thể tạo job chấm hàng loạt.'); }
    finally { setActionBusy(false); }
  };

  return (
    <div className="submission-workspace">
      <header className="submission-page-header">
        <div>
          <div className="submission-eyebrow">AI SCORING · QUẢN LÝ BÀI THI</div>
          <h1>Danh sách bài chấm</h1>
          <p>Theo dõi, đồng bộ và xử lý các bài thi Speaking & Writing trên một màn hình.</p>
        </div>
        <div className="submission-header-actions">
          <button className="submission-button secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Làm mới</button>
          <button className="submission-button primary" onClick={() => { setKeycode(''); setSyncValidation(''); setShowSyncModal(true); }}><UploadCloud size={17} /> Đồng bộ bài thi</button>
        </div>
      </header>

      <section className="submission-metrics">
        <article className="submission-metric total"><div className="metric-icon"><FileText /></div><div><span>Tổng bài thi</span><strong>{counts.total}</strong></div></article>
        <article className="submission-metric success"><div className="metric-icon"><CheckCircle2 /></div><div><span>Đã chấm</span><strong>{counts.graded}</strong><small>{counts.total ? Math.round(counts.graded / counts.total * 100) : 0}% tổng số bài</small></div></article>
        <article className="submission-metric pending"><div className="metric-icon"><Clock3 /></div><div><span>Chờ xử lý</span><strong>{counts.pending}</strong><small>Sẵn sàng để chấm</small></div></article>
        <article className="submission-metric active"><div className="metric-icon"><RefreshCw className={counts.grading ? 'spin' : ''} /></div><div><span>Đang xử lý</span><strong>{counts.grading}</strong><small>{counts.error ? `${counts.error} bài cần kiểm tra` : 'Không có lỗi'}</small></div>{counts.error > 0 && <AlertCircle className="metric-alert" size={17} />}</article>
      </section>

      <section className="submission-data-card">
        <div className="submission-data-top">
          <div className="submission-status-tabs">
            {STATUS_OPTIONS.map(option => <button key={option.value} className={normalizedStatus === option.value ? 'active' : ''} onClick={() => chooseStatus(option.value)}>{option.label}<span>{option.value ? counts[{ 1: 'pending', 2: 'grading', 3: 'graded', 4: 'error' }[option.value]] : counts.total}</span></button>)}
          </div>
          <div className="submission-search"><Search size={17} /><input value={searchKey} onChange={event => { setSearchKey(event.target.value); setCurrentPage(1); }} placeholder="Tìm keycode, học viên hoặc tên đề…" /></div>
        </div>

        {selectedIds.length > 0 && <div className="submission-selection-bar"><div><strong>{selectedIds.length}</strong> bài đã chọn<button onClick={() => setSelectedIds([])}>Bỏ chọn</button></div><div><button className="grade" onClick={gradeSelected} disabled={actionBusy}><Sparkles size={15} /> Chấm bằng AI</button><button onClick={exportSelected} disabled={actionBusy}><FileSpreadsheet size={15} /> Xuất Excel</button><button className="danger" onClick={removeSelected} disabled={actionBusy}><Trash2 size={15} /> Xóa bài chưa chấm</button></div></div>}

        <div className="submission-table-wrap">
          {loading && !submissions.length ? <div className="submission-empty"><RefreshCw className="spin" /><strong>Đang tải dữ liệu…</strong></div>
            : !displayList.length ? <div className="submission-empty"><FileText /><strong>Không có bài thi phù hợp</strong><span>Thử đổi từ khóa hoặc bộ lọc trạng thái.</span></div>
              : <table className="submission-table">
                <thead><tr><th className="checkbox-cell"><input type="checkbox" checked={allPageSelected} onChange={event => togglePage(event.target.checked)} /></th><th>Keycode / Học viên</th><th>Đề thi</th><th>Ngày nộp</th><th>Đồng bộ gần nhất</th><th>Trạng thái</th><th aria-label="Hành động" /></tr></thead>
                <tbody>{pageItems.map(item => <tr key={item.id} className={selectedIds.includes(item.id) ? 'selected' : ''} onClick={() => navigate(`/submissions/${item.id}`)}>
                  <td className="checkbox-cell" onClick={event => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} /></td>
                  <td><div className="candidate-cell"><span className="candidate-avatar">{String(item.student_name || 'HV').trim().slice(0, 2).toUpperCase()}</span><div><strong>{item.student_name || 'Chưa có tên'}</strong><span><b>{item.keycode}</b>{item.student_email ? ` · ${item.student_email}` : ''}</span></div></div></td>
                  <td><div className="test-name" title={item.test_name}>{item.test_name || '—'}</div></td>
                  <td><time>{formatDate(item.submitted_date)}</time></td>
                  <td><time>{formatDate(item.synced_at || item.updated_at)}</time></td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td onClick={event => event.stopPropagation()}><div className="row-actions"><button title="Xem chi tiết" onClick={() => navigate(`/submissions/${item.id}`)}><Eye size={16} /></button><button className="danger" disabled={Number(item.status) !== 1} title={Number(item.status) === 1 ? 'Xóa bài' : 'Chỉ xóa được bài chưa chấm'} onClick={() => removeOne(item)}><Trash2 size={15} /></button></div></td>
                </tr>)}</tbody>
              </table>}
        </div>

        {!!displayList.length && <footer className="submission-pagination"><div>Hiển thị <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setCurrentPage(1); }}><option>10</option><option>20</option><option>40</option><option>100</option></select> / {meta.total} bài</div><div className="page-controls"><span>Trang {safePage} / {totalPages}</span><button disabled={safePage === 1} onClick={() => setCurrentPage(page => page - 1)}><ArrowLeft size={16} /></button><button disabled={safePage === totalPages} onClick={() => setCurrentPage(page => page + 1)}><ArrowRight size={16} /></button></div></footer>}
      </section>

      {showSyncModal && <div className="submission-modal-backdrop"><div className="submission-modal sync-entry-modal"><button className="sync-entry-close" onClick={() => setShowSyncModal(false)} title="Đóng"><X /></button><div className="submission-modal-icon"><Download size={21} /></div><h2>Đồng bộ bài thi</h2><p>Nhập một hoặc nhiều keycode để lấy bài làm mới nhất từ IIG Elearning.</p><label>Danh sách keycode<textarea autoFocus value={keycode} onChange={event => { setKeycode(event.target.value.toUpperCase()); setSyncValidation(''); }} placeholder={'Ví dụ:\nQETUVZ, ABC123\nKLM456'} /></label><div className="sync-entry-help"><span>Mỗi keycode cách nhau bằng dấu phẩy hoặc xuống dòng.</span><strong>{parsedKeycodes.length} keycode</strong></div>{syncValidation && <div className="submission-modal-message error">{syncValidation}</div>}<div className="sync-entry-note"><UploadCloud size={16} /><span>Tiến trình có thể thu nhỏ và tiếp tục chạy khi bạn làm việc ở tính năng khác.</span></div><div className="submission-modal-actions"><button className="submission-button secondary" onClick={() => setShowSyncModal(false)}>Hủy</button><button className="submission-button primary" onClick={syncSubmission} disabled={!parsedKeycodes.length}><Download size={16} /> Bắt đầu đồng bộ</button></div></div></div>}

      {gradingJob && <div className="submission-modal-backdrop"><div className="submission-modal grading-progress-modal"><div className="submission-modal-icon"><Sparkles size={21} /></div><h2>Chấm bài hàng loạt</h2><p>Job tiếp tục chạy trên server kể cả khi đóng cửa sổ này.</p><div className="grading-progress-numbers"><strong>{Number(gradingJob.completed_items || 0) + Number(gradingJob.failed_items || 0)} / {gradingJob.total_items}</strong><span>{gradingJob.status === 'queued' ? 'Đang chờ' : gradingJob.status === 'processing' ? 'Đang chấm' : gradingJob.status === 'completed' ? 'Hoàn tất' : gradingJob.status === 'completed_with_errors' ? 'Hoàn tất, có lỗi' : 'Job lỗi'}</span></div><div className="grading-progress-track"><div style={{ width: `${gradingJob.total_items ? ((Number(gradingJob.completed_items || 0) + Number(gradingJob.failed_items || 0)) / gradingJob.total_items) * 100 : 0}%` }} /></div><div className="grading-progress-stats"><span className="success">{gradingJob.completed_items || 0} thành công</span><span className="error">{gradingJob.failed_items || 0} lỗi</span></div>{gradingJob.pollError && <div className="submission-modal-message error">{gradingJob.pollError}</div>}<div className="submission-modal-actions"><button className="submission-button secondary" onClick={() => setGradingJob(null)}>Đóng</button></div></div></div>}
    </div>
  );
}
