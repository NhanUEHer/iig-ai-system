import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { deleteExam, listExams } from '../../../services/examService';
import { ContextHeader } from '../../../components/ui/Layout';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import { useDialog } from '../../../components/feedback/dialogContext';
import { EXAM_STATUS_OPTIONS, examStatusMeta } from '../examStatus';
import './ExamPages.css';
import './ExamListPage.css';
import './ExamListPageOverrides.css';

const formatDuration = value => `${Math.floor(Number(value || 0) / 60)} phút`;
const formatDate = value => value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric', year: '2-digit', hour12: false }).format(new Date(value)) : '—';

function ActionMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => { if (!open) return undefined; const close = event => !root.current?.contains(event.target) && setOpen(false); document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, [open]);
  const act = callback => { setOpen(false); callback(); };
  return <div className="exam-list-actions" ref={root}>
    <button type="button" className="exam-list-actions__trigger" title="Thao tác" onClick={() => setOpen(value => !value)}><MoreHorizontal /></button>
    {open && <div className="exam-list-actions__menu">
      <button type="button" onClick={() => act(onEdit)}><Pencil className="is-amber" />Chỉnh sửa</button>
      <button type="button" className="is-danger" onClick={() => act(onDelete)}><Trash2 />Xóa đề thi</button>
    </div>}
  </div>;
}

export default function ExamListPage({ navigate, showMsg }) {
  const { confirm: requestConfirm } = useDialog();
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', statuses: [], page: 1, limit: 10 });
  const [result, setResult] = useState({ data: [], meta: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const load = useCallback(async () => { setLoading(true); setError(''); try { setResult(await listExams({ ...filters, statuses: filters.statuses.join(',') })); } catch (e) { setError(e.response?.data?.error || 'Không thể tải danh sách đề thi.'); } finally { setLoading(false); } }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters(current => ({ ...current, search: searchInput.trim(), page: 1 })), 300); return () => window.clearTimeout(timer); }, [searchInput]);
  const filter = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
  const remove = async row => { if (!await requestConfirm({ title: 'Xóa đề thi?', message: `Đề “${row.title}” và toàn bộ phần thi sẽ bị xóa.`, confirmText: 'Xóa đề' })) return; try { await deleteExam(row.id); showMsg?.('Đã xóa đề thi.', 'success'); setSelected(current => current.filter(id => id !== row.id)); load(); } catch (e) { showMsg?.(e.response?.data?.error || 'Không thể xóa đề thi.', 'error'); } };
  const rows = result.data || []; const meta = result.meta || {}; const allChecked = rows.length > 0 && rows.every(row => selected.includes(row.id));
  const toggleAll = event => setSelected(event.target.checked ? rows.map(row => row.id) : []);
  const toggleRow = id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);

  return <section className="exam-list-page">
    <ContextHeader className="exam-list-header" breadcrumb={[{ label: 'Quản lý đề thi' }, { label: 'Danh sách đề thi', current: true }]} />
    <main className="exam-list-main">
      <div className="exam-list-filter-card">
        <label className="exam-list-search"><Search /><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Tìm tên đề thi, mã đề..." /></label>
        <MultiSelectFilter options={EXAM_STATUS_OPTIONS} value={filters.statuses} onApply={value => filter('statuses', value)} placeholder="Tất cả trạng thái" selectedLabel="Trạng thái" allLabel="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái..." />
        <button type="button" className="exam-list-add" onClick={() => navigate('/exams/new')}><Plus />Thêm đề thi</button>
      </div>
      <div className="exam-list-table-card">
        <div className="exam-list-table-scroll"><table className="exam-list-table">
          <thead><tr><th className="is-check"><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Chọn tất cả" /></th><th>TÊN ĐỀ THI</th><th>TRẠNG THÁI</th><th>THỜI GIAN</th><th className="is-center">SỐ PHẦN</th><th className="is-center">SỐ CÂU HỎI</th><th className="is-center">TỔNG ĐIỂM</th><th>NGÀY CẬP NHẬT</th><th className="is-center">THAO TÁC</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan="9" className="exam-list-message">Đang tải dữ liệu...</td></tr> : error ? <tr><td colSpan="9" className="exam-list-message is-error">{error}</td></tr> : rows.length === 0 ? <tr><td colSpan="9" className="exam-list-message">Chưa có dữ liệu đề thi</td></tr> : rows.map((row, index) => <tr key={row.id} className={index % 2 ? 'is-alt' : ''}>
            <td className="is-check"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleRow(row.id)} aria-label={`Chọn ${row.title}`} /></td>
            <td className="exam-list-title" title={`${row.examCode} · ${row.title}`}>{row.title}</td><td><span className={`exam-list-status is-${examStatusMeta(row.status).tone}`}><i />{examStatusMeta(row.status).label}</span></td>
            <td>{formatDuration(row.durationSeconds)}</td><td className="is-center is-number">{row.partCount}</td><td className="is-center is-number">{row.subQuestionCount}</td><td className="is-center is-number">{row.totalPoints}</td><td className="exam-list-date">{formatDate(row.updatedAt)}</td>
            <td className="is-center"><ActionMenu onEdit={() => navigate(`/exams/${row.id}/edit`)} onDelete={() => remove(row)} /></td>
          </tr>)}</tbody>
        </table></div>
        <footer className="exam-list-pagination"><span>Tổng <strong>{meta.total || 0}</strong> bản ghi</span><div><label>Hiển thị <select value={meta.limit || filters.limit} onChange={event => filter('limit', Number(event.target.value))}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select> / trang</label><button type="button" disabled={(meta.page || 1) <= 1} onClick={() => filter('page', meta.page - 1)}><ChevronLeft /></button><b>{meta.page || 1} / {meta.totalPages || 1}</b><button type="button" disabled={(meta.page || 1) >= (meta.totalPages || 1)} onClick={() => filter('page', meta.page + 1)}><ChevronRight /></button></div></footer>
      </div>
    </main>
  </section>;
}
