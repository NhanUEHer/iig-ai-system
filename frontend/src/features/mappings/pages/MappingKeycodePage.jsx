import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, Database, Edit3, Link2, Plus, RefreshCw, Search, Trash2, UploadCloud, X } from 'lucide-react';
import {useDialog} from '../../../components/feedback/dialogContext';
import './MappingKeycodePage.css';

const API_BASE = '/api/submissions';
const formatDate = value => value ? new Date(value).toLocaleString('vi-VN') : '—';

export default function MappingKeycodePage({ mappings = [], meta = { page: 1, limit: 10, total: 0, totalPages: 1 }, loadingMappings = false, onRefresh, showMsg, currentUser }) {
  const {confirm:confirmDialog}=useDialog();
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [formModal, setFormModal] = useState(null);
  const [form, setForm] = useState({ keycode: '', course_scoring_id: '', student_name: '', test_name: '' });
  const [saving, setSaving] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncForm, setSyncForm] = useState({ keyword: '', fromSubmittedDate: '', toSubmittedDate: '', pageSize: 1000 });
  const [syncResult, setSyncResult] = useState({ status: 'idle', count: 0, error: '' });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [schedule, setSchedule] = useState({ enabled: false, runTime: '01:00', pageSize: 1000, lastStatus: 'idle', lastRunAt: null, lastCount: 0, lastError: '' });
  const canManage = currentUser?.permissions?.includes('mappings.manage');
  const canSync = currentUser?.permissions?.includes('submissions.sync');
  const canSchedule = currentUser?.permissions?.includes('mappings.schedule');

  useEffect(() => {
    const timer = setTimeout(() => onRefresh?.({ page, limit: pageSize, search: search.trim() || undefined }), 250);
    return () => clearTimeout(timer);
  }, [page, pageSize, search]);

  const loadSchedule = async () => {
    try {
      const response = await axios.get(`${API_BASE}/mapping-sync-schedule`);
      const data = response.data.data || {};
      setSchedule({ enabled: Boolean(data.enabled), runTime: String(data.run_time || '01:00').slice(0, 5), pageSize: Number(data.page_size || 1000), lastStatus: data.last_status || 'idle', lastRunAt: data.last_run_at, lastCount: Number(data.last_count || 0), lastError: data.last_error || '' });
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể tải lịch đồng bộ.', 'error'); }
  };
  const openSchedule = async () => { await loadSchedule(); setScheduleOpen(true); };
  const saveSchedule = async event => {
    event.preventDefault(); setScheduleSaving(true);
    try {
      await axios.put(`${API_BASE}/mapping-sync-schedule`, { enabled: schedule.enabled, runTime: schedule.runTime, pageSize: schedule.pageSize });
      showMsg?.('Đã cập nhật lịch đồng bộ tự động.', 'success'); setScheduleOpen(false);
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu lịch đồng bộ.', 'error'); }
    finally { setScheduleSaving(false); }
  };

  const filtered = mappings;
  const totalPages = meta.totalPages || 1;
  const safePage = Math.min(meta.page || page, totalPages);
  const pageItems = mappings;
  const completed = mappings.filter(item => item.student_name && item.test_name).length;

  const openCreate = () => { setForm({ keycode: '', course_scoring_id: '', student_name: '', test_name: '' }); setFormModal('create'); };
  const openEdit = item => { setForm({ keycode: item.keycode, course_scoring_id: item.course_scoring_id, student_name: item.student_name || '', test_name: item.test_name || '' }); setFormModal('edit'); };
  const save = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const endpoint = formModal === 'edit' ? `${API_BASE}/mappings/${form.keycode}` : `${API_BASE}/mappings`;
      await axios[formModal === 'edit' ? 'put' : 'post'](endpoint, form);
      showMsg?.(formModal === 'edit' ? 'Đã cập nhật mapping.' : 'Đã thêm mapping.', 'success');
      setFormModal(null);
      await onRefresh?.();
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu mapping.', 'error'); }
    finally { setSaving(false); }
  };
  const remove = async item => {
    if (!await confirmDialog({title:'Xóa mapping?',message:`Mapping của keycode ${item.keycode} sẽ bị xóa.`,confirmText:'Xóa mapping'})) return;
    try { await axios.delete(`${API_BASE}/mappings/${item.keycode}`); showMsg?.('Đã xóa mapping.', 'success'); await onRefresh?.(); }
    catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xóa mapping.', 'error'); }
  };
  const sync = async () => {
    setSyncResult({ status: 'loading', count: 0, error: '' });
    try {
      const response = await axios.post(`${API_BASE}/sync-mappings`, {
        ...syncForm,
        keyword: syncForm.keyword.trim() || null,
        fromSubmittedDate: syncForm.fromSubmittedDate || null,
        toSubmittedDate: syncForm.toSubmittedDate || null
      });
      setSyncResult({ status: 'success', count: response.data.count || 0, error: '' });
      await onRefresh?.();
    } catch (error) { setSyncResult({ status: 'error', count: 0, error: error.response?.data?.error || 'Không thể đồng bộ Elearning.' }); }
  };

  return <div className="mapping-page">
    <header className="mapping-header"><div><span className="mapping-eyebrow">AI SCORING · DATA MAPPING</span><h1>Đồng bộ Keycode</h1><p>Quản lý liên kết giữa mã bài thi và Course Scoring ID trên IIG Elearning.</p></div><div><button className="mapping-button secondary" onClick={onRefresh}><RefreshCw className={loadingMappings ? 'spin' : ''} /> Làm mới</button><button className="mapping-button secondary" onClick={openSchedule}><CalendarClock /> Lịch tự động</button>{canSync && <button className="mapping-button sync" onClick={() => { setSyncResult({ status: 'idle', count: 0, error: '' }); setSyncOpen(true); }}><UploadCloud /> Đồng bộ Elearning</button>}{canManage && <button className="mapping-button primary" onClick={openCreate}><Plus /> Thêm mapping</button>}</div></header>
    <section className="mapping-metrics"><article><span className="mapping-metric-icon blue"><Database /></span><div><span>Tổng mapping</span><strong>{mappings.length}</strong></div></article><article><span className="mapping-metric-icon green"><CheckCircle2 /></span><div><span>Đủ thông tin</span><strong>{completed}</strong><small>{mappings.length ? Math.round(completed / mappings.length * 100) : 0}% dữ liệu</small></div></article><article><span className="mapping-metric-icon purple"><Link2 /></span><div><span>Cần bổ sung</span><strong>{mappings.length - completed}</strong><small>Thiếu học viên hoặc tên đề</small></div></article></section>
    <section className="mapping-card"><div className="mapping-toolbar"><div><h2>Danh sách liên kết</h2><span>{filtered.length} kết quả</span></div><label><Search /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm keycode, học viên, tên đề hoặc ID…" /></label></div>
      <div className="mapping-table-wrap">{loadingMappings ? <div className="mapping-empty"><RefreshCw className="spin" /><strong>Đang tải mapping…</strong></div> : !pageItems.length ? <div className="mapping-empty"><Link2 /><strong>Không tìm thấy mapping</strong><span>Thử thay đổi từ khóa hoặc đồng bộ dữ liệu mới.</span></div> : <table className="mapping-table"><thead><tr><th>Keycode</th><th>Học viên</th><th>Tên đề thi</th><th>Course Scoring ID</th><th>Cập nhật</th><th /></tr></thead><tbody>{pageItems.map(item => <tr key={item.keycode}><td><strong>{item.keycode}</strong></td><td>{item.student_name || <em>Chưa có dữ liệu</em>}</td><td><span className="mapping-test-name" title={item.test_name}>{item.test_name || 'Chưa có dữ liệu'}</span></td><td><code>{item.course_scoring_id}</code></td><td><time>{formatDate(item.updated_at || item.created_at)}</time></td><td>{canManage && <div className="mapping-row-actions"><button onClick={() => openEdit(item)} title="Chỉnh sửa"><Edit3 /></button><button className="danger" onClick={() => remove(item)} title="Xóa mapping"><Trash2 /></button></div>}</td></tr>)}</tbody></table>}</div>
      {!!filtered.length && <footer className="mapping-pagination"><div>Hiển thị <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option>10</option><option>20</option><option>40</option><option>100</option></select> / {meta.total} mapping</div><div><span>Trang {safePage}/{totalPages}</span><button disabled={safePage === 1} onClick={() => setPage(value => value - 1)}><ArrowLeft /></button><button disabled={safePage === totalPages} onClick={() => setPage(value => value + 1)}><ArrowRight /></button></div></footer>}
    </section>

    {formModal && <div className="mapping-modal-backdrop"><form className="mapping-modal" onSubmit={save}><button type="button" className="mapping-modal-close" onClick={() => setFormModal(null)}><X /></button><span className="mapping-modal-icon"><Link2 /></span><h2>{formModal === 'edit' ? 'Cập nhật mapping' : 'Thêm mapping thủ công'}</h2><p>Liên kết keycode với bản ghi Course Scoring trên Elearning.</p><div className="mapping-form-grid"><label>Keycode<input value={form.keycode} disabled={formModal === 'edit'} onChange={event => setForm(value => ({ ...value, keycode: event.target.value.toUpperCase() }))} placeholder="QETUVZ" required /></label><label>Course Scoring ID<input value={form.course_scoring_id} onChange={event => setForm(value => ({ ...value, course_scoring_id: event.target.value }))} placeholder="UUID từ Elearning" required /></label><label>Họ tên học viên<input value={form.student_name} onChange={event => setForm(value => ({ ...value, student_name: event.target.value }))} placeholder="Không bắt buộc" /></label><label>Tên đề thi<input value={form.test_name} onChange={event => setForm(value => ({ ...value, test_name: event.target.value }))} placeholder="Không bắt buộc" /></label></div><footer><button type="button" className="mapping-button secondary" onClick={() => setFormModal(null)}>Hủy</button><button className="mapping-button primary" disabled={saving}>{saving ? <RefreshCw className="spin" /> : <CheckCircle2 />}{saving ? 'Đang lưu…' : 'Lưu mapping'}</button></footer></form></div>}
    {syncOpen && <div className="mapping-modal-backdrop"><div className="mapping-modal sync-modal"><button className="mapping-modal-close" onClick={() => syncResult.status !== 'loading' && setSyncOpen(false)}><X /></button><span className="mapping-modal-icon green"><UploadCloud /></span><h2>Đồng bộ từ Elearning</h2><p>Lấy danh sách keycode và cập nhật mapping đã tồn tại. Có thể giới hạn dữ liệu bằng bộ lọc bên dưới.</p><div className="mapping-form-grid"><label className="full">Từ khóa<input value={syncForm.keyword} onChange={event => setSyncForm(value => ({ ...value, keyword: event.target.value }))} placeholder="Keycode, tên học viên hoặc tên đề" /></label><label>Từ ngày nộp<input type="date" value={syncForm.fromSubmittedDate} onChange={event => setSyncForm(value => ({ ...value, fromSubmittedDate: event.target.value }))} /></label><label>Đến ngày nộp<input type="date" value={syncForm.toSubmittedDate} onChange={event => setSyncForm(value => ({ ...value, toSubmittedDate: event.target.value }))} /></label></div>{syncResult.status === 'loading' && <div className="mapping-sync-state loading"><RefreshCw className="spin" /><div><strong>Đang đồng bộ dữ liệu…</strong><span>Đang kết nối IIG Elearning và cập nhật database.</span></div><i /></div>}{syncResult.status === 'success' && <div className="mapping-sync-state success"><CheckCircle2 /><div><strong>Đồng bộ hoàn tất</strong><span>Đã cập nhật {syncResult.count} mapping keycode.</span></div></div>}{syncResult.status === 'error' && <div className="mapping-sync-state error"><X /><div><strong>Đồng bộ thất bại</strong><span>{syncResult.error}</span></div></div>}<footer><button className="mapping-button secondary" disabled={syncResult.status === 'loading'} onClick={() => setSyncOpen(false)}>Đóng</button><button className="mapping-button sync" disabled={syncResult.status === 'loading'} onClick={sync}>{syncResult.status === 'loading' ? <RefreshCw className="spin" /> : <UploadCloud />}{syncResult.status === 'loading' ? 'Đang đồng bộ…' : 'Bắt đầu đồng bộ'}</button></footer></div></div>}
    {scheduleOpen && <div className="mapping-modal-backdrop"><form className="mapping-modal schedule-modal" onSubmit={saveSchedule}><button type="button" className="mapping-modal-close" onClick={() => setScheduleOpen(false)}><X /></button><span className="mapping-modal-icon"><CalendarClock /></span><h2>Đồng bộ tự động hằng ngày</h2><p>Job sử dụng múi giờ Việt Nam, lấy dữ liệu từ ngày hôm trước đến ngày hiện tại.</p><label className="schedule-switch"><input type="checkbox" checked={schedule.enabled} disabled={!canSchedule} onChange={event => setSchedule(value => ({...value,enabled:event.target.checked}))} /><span><strong>Bật job đồng bộ</strong><small>{schedule.enabled ? 'Job sẽ tự chạy theo lịch bên dưới.' : 'Job đang tạm dừng.'}</small></span></label><div className="mapping-form-grid"><label>Thời gian chạy<input type="time" value={schedule.runTime} disabled={!canSchedule} onChange={event => setSchedule(value => ({...value,runTime:event.target.value}))} required /></label><label>Số lượng bản ghi<input type="number" min="1" max="5000" value={schedule.pageSize} disabled={!canSchedule} onChange={event => setSchedule(value => ({...value,pageSize:Number(event.target.value)}))} required /></label></div><div className={`schedule-status ${schedule.lastStatus}`}><strong>Lần chạy gần nhất</strong><span>{schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString('vi-VN') : 'Chưa chạy'} · {schedule.lastCount} bản ghi</span>{schedule.lastError && <small>{schedule.lastError}</small>}</div><footer><button type="button" className="mapping-button secondary" onClick={() => setScheduleOpen(false)}>Đóng</button>{canSchedule && <button className="mapping-button primary" disabled={scheduleSaving}>{scheduleSaving ? <RefreshCw className="spin" /> : <CheckCircle2 />}{scheduleSaving ? 'Đang lưu…' : 'Lưu lịch'}</button>}</footer></form></div>}
  </div>;
}
