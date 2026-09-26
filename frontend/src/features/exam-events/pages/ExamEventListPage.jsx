import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MoreVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { listExamEvents, listExamEventSchools, deleteExamEvent } from '../../../services/examEventService';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import { useDialog } from '../../../components/feedback/dialogContext';
import { EVENT_LIFECYCLE_OPTIONS, eventLifecycleMeta } from '../examEventStatus';
import './ExamEventListPage.css';
import './ExamEventStatus.css';
import './ExamEventListStitch.css';

const statusOptions = EVENT_LIFECYCLE_OPTIONS;

const dateTime = value => value ? new Date(value).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Chưa xác định';
const initials = name => String(name || 'KT').split(/\s+/).filter(Boolean).slice(-2).map(word => word[0]).join('').toUpperCase();

function EventActions({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => { if (!open) return undefined; const close = event => !root.current?.contains(event.target) && setOpen(false); document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, [open]);
  const act = callback => { setOpen(false); callback(); };
  return <div className="event-action-menu" ref={root}>
    <button type="button" className="event-action-trigger" title="Thao tác" onClick={() => setOpen(value => !value)}><MoreVertical /></button>
    {open && <div className="event-action-dropdown">
      <button type="button" onClick={() => act(onEdit)}><Pencil className="is-amber" />Chỉnh sửa</button>
      <button type="button" className="is-danger" onClick={() => act(onDelete)}><Trash2 />Xóa kỳ thi</button>
    </div>}
  </div>;
}

export default function ExamEventListPage({ navigate, showMsg }) {
  const { confirm } = useDialog();
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', statuses: [], schools: [], page: 1, limit: 10 });
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await listExamEvents({
        ...filters,
        status: filters.statuses.join(','),
        schoolName: filters.schools.join(',')
      }));
    } catch (error) {
      showMsg?.(error.response?.data?.error || 'Không thể tải danh sách kỳ thi.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, showMsg]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(current => ({ ...current, search: searchInput.trim(), page: 1 })), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => { listExamEventSchools().then(setSchools).catch(() => setSchools([])); }, []);

  const update = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
  const openForm = event => navigate(`/exam-events/${event.id}/edit`);
  const remove = async event => {
    if (!await confirm({ title: 'Xóa kỳ thi?', message: `Bạn có chắc muốn xóa “${event.name}”?`, confirmText: 'Xóa kỳ thi' })) return;
    try {
      await deleteExamEvent(event.id);
      showMsg?.('Đã xóa kỳ thi.', 'success');
      load();
    } catch (error) {
      showMsg?.(error.response?.data?.error || 'Không thể xóa kỳ thi.', 'error');
    }
  };

  const rows = result.data || [];
  const meta = result.meta || {};
  const all = rows.length > 0 && rows.every(row => selected.includes(row.id));

  const schoolOptions = schools.map(school => ({ value: school.name, label: school.name }));

  return <section className="event-page">
    <header className="event-header-breadcrumb">
      <div><span>Quản lý kỳ thi</span><i>/</i><strong>Danh sách kỳ thi</strong></div>
    </header>
    <main>
      <section className="event-toolbar">
        <div className="event-filter-group">
          <label className="event-search-box">
            <Search />
            <input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Tìm tên kỳ thi, mã kỳ thi, trường học..." />
          </label>
          <MultiSelectFilter
            options={statusOptions}
            value={filters.statuses}
            onApply={value => update('statuses', value)}
            placeholder="Tất cả trạng thái"
            selectedLabel="Trạng thái"
            allLabel="Tất cả trạng thái"
            searchPlaceholder="Tìm trạng thái..."
          />
          <MultiSelectFilter
            options={schoolOptions}
            value={filters.schools}
            onApply={value => update('schools', value)}
            placeholder="Tất cả trường / đơn vị"
            selectedLabel="Trường / Đơn vị"
            allLabel="Tất cả trường / đơn vị"
            searchPlaceholder="Tìm trường..."
          />
        </div>
        <button type="button" className="event-add-btn" onClick={() => navigate('/exam-events/new')}>
          <Plus />Thêm kỳ thi
        </button>
      </section>

      <section className="event-table-card">
        <div className="event-table-scroll">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : rows.map(row => row.id))} /></th>
                <th>KỲ THI</th>
                <th>ĐƠN VỊ / TRƯỜNG</th>
                <th>ĐỀ THI ÁP DỤNG</th>
                <th>THỜI GIAN DIỄN RA</th>
                <th className="center">SỐ THÍ SINH</th>
                <th className="center">TRẠNG THÁI</th>
                <th className="center">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="message">Đang tải danh sách kỳ thi...</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan="8" className="message"><CalendarDays />Chưa có kỳ thi phù hợp.</td></tr>
              ) : rows.map((row, index) => (
                <tr key={row.id}>
                  <td><input type="checkbox" checked={selected.includes(row.id)} onChange={() => setSelected(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])} /></td>
                  <td>
                    <div className={`event-name color-${index % 6}`}>
                      <i>{initials(row.name)}</i>
                      <span>
                        <button type="button" onClick={() => openForm(row)}>{row.name}</button>
                        <code>{row.eventCode}</code>
                      </span>
                    </div>
                  </td>
                  <td><strong>{row.schoolName || '—'}</strong></td>
                  <td>
                    <span className="event-exam">
                      <strong>{row.exam?.title || '—'}</strong>
                      <small>{row.exam ? `${Math.floor(row.exam.durationSeconds / 60)} phút • ${row.exam.totalQuestions} câu` : 'Chưa gắn đề thi'}</small>
                    </span>
                  </td>
                  <td>
                    <span className="event-time">
                      <strong>{dateTime(row.startAt)}</strong>
                      <small>đến {dateTime(row.endAt)}</small>
                    </span>
                  </td>
                  <td className="center"><b>{row.candidateCount?.toLocaleString('vi-VN') || 0}</b></td>
                  <td className="center">
                    <span className={`event-status is-${eventLifecycleMeta(row.lifecycleStatus).tone}`}>
                      <i />{eventLifecycleMeta(row.lifecycleStatus).label}
                    </span>
                  </td>
                  <td className="center action">
                    <EventActions onEdit={() => openForm(row)} onDelete={() => remove(row)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer>
          <strong>Tổng <b>{meta.total || 0}</b> bản ghi</strong>
          <div>
            <span>Hiển thị</span>
            <select value={meta.limit || filters.limit} onChange={event => update('limit', Number(event.target.value))}>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
            <span>/ trang</span>
            <button disabled={(meta.page || 1) <= 1} onClick={() => update('page', (meta.page || 1) - 1)}><ChevronLeft /></button>
            <b><i>{meta.page || 1}</i> / {meta.totalPages || 1}</b>
            <button disabled={(meta.page || 1) >= (meta.totalPages || 1)} onClick={() => update('page', (meta.page || 1) + 1)}><ChevronRight /></button>
          </div>
        </footer>
      </section>
    </main>
  </section>;
}
