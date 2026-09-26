import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleAlert, FileText, MoreVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { createManagedQuestionGroup, deleteManagedQuestionGroup, listManagedQuestionGroups, previewManagedQuestionGroupCode, updateManagedQuestionGroup } from '../../../services/questionBankService';
import SearchInput from '../../../components/ui/SearchInput';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import { useDialog } from '../../../components/feedback/dialogContext';
import './QuestionGroupManagementPage.css';
import './QuestionGroupManagementFilterOverrides.css';
import './QuestionGroupManagementModal.css';

const emptyForm = { name: '', description: '', status: 'ACTIVE' };
const labels = { ACTIVE: 'Hoạt động', INACTIVE: 'Dừng hoạt động', DRAFT: 'Bản nháp' };
const statusOptions = [{ value: 'ACTIVE', label: 'Hoạt động' }, { value: 'INACTIVE', label: 'Dừng hoạt động' }, { value: 'DRAFT', label: 'Bản nháp' }];
const formatDate = value => value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric', year: '2-digit', hour12: false }).format(new Date(value)).replace(',', '') : '—';

function GroupModal({ group, onClose, onSaved, onDelete, showMsg }) {
  const editing = Boolean(group?.id);
  const [form, setForm] = useState(group ? { name: group.name, description: group.description || '', status: group.status } : emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState(group?.code || '');
  useEffect(() => { if (!editing) { setCode(''); previewManagedQuestionGroupCode().then(result => setCode(result.data?.code || '')).catch(() => setCode('GRP-01')); } }, [editing]);
  const submit = async event => {
    event.preventDefault(); setError('');
    if (!form.name.trim()) { setError('Vui lòng nhập tên nhóm câu hỏi.'); return; }
    try { setSaving(true); const result = editing ? await updateManagedQuestionGroup(group.id, form) : await createManagedQuestionGroup(form); showMsg?.(editing ? 'Đã cập nhật nhóm câu hỏi.' : 'Đã tạo nhóm câu hỏi.', 'success'); onSaved(result.data); } catch (requestError) { setError(requestError.response?.data?.error || 'Không thể lưu nhóm câu hỏi.'); } finally { setSaving(false); }
  };
  return <div className="question-group-editor-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className={`question-group-editor-modal${editing ? ' is-editing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="question-group-editor-title"><header><div><h2 id="question-group-editor-title">{editing ? 'Cập nhật nhóm câu hỏi' : 'Thêm mới nhóm câu hỏi'}</h2><p>{editing ? `Chỉnh sửa thông tin phân loại cho nhóm câu hỏi ${group.code}.` : 'Tạo nhóm danh mục mới để phân loại câu hỏi trong hệ thống.'}</p></div><button type="button" onClick={onClose} aria-label="Đóng"><X /></button></header><form id="question-group-form" onSubmit={submit}><div className="question-group-editor-body"><div className="question-group-code-field"><div><label>Mã nhóm câu hỏi</label>{!editing && <span>Tự động sinh</span>}</div><input value={code || 'Đang tải mã…'} readOnly />{editing && <small>Mã nhóm được tạo tự động và không thể thay đổi</small>}</div><label><span className="question-group-field-label">Tên nhóm câu hỏi <em className="question-group-required">*</em></span><input value={form.name} maxLength="240" onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Nhập tên nhóm câu hỏi (VD: Luyện thi IELTS - Listening Section 1)..." autoFocus required /></label><label><span className="question-group-field-label">Mô tả nhóm</span><textarea value={form.description} maxLength="2000" onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Mô tả ngắn gọn về mục đích sử dụng của nhóm câu hỏi này..." rows="3" /></label><label><span className="question-group-field-label">Trạng thái {editing ? '' : 'ban đầu'} <em className="question-group-required">*</em></span><select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}><option value="ACTIVE">Hoạt động</option><option value="DRAFT">Bản nháp</option><option value="INACTIVE">Dừng hoạt động</option></select></label>{editing && <div className="question-group-linked"><CircleAlert /><span>Đang liên kết với <strong>{group.questionCount} câu hỏi</strong> trong ngân hàng đề thi</span></div>}{error && <p className="question-group-form-error">{error}</p>}</div><footer>{editing && <button type="button" className="question-group-delete-button" onClick={onDelete}><Trash2 />Xóa nhóm</button>}<div className="question-group-editor-footer-actions"><button type="button" onClick={onClose}>Hủy</button><button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : <><Check />{editing ? 'Lưu thay đổi' : 'Tạo nhóm'}</>}</button></div></footer></form></section></div>;
}

function GroupActions({ group, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return <div className="question-group-row-menu"><button type="button" onClick={() => setOpen(current => !current)} title="Thao tác" aria-label="Thao tác"><MoreVertical /></button>{open && <div><button type="button" onClick={() => { setOpen(false); onEdit(); }}><Pencil />Chỉnh sửa</button><button type="button" className="danger" disabled={group.questionCount > 0} title={group.questionCount > 0 ? 'Không thể xóa nhóm đang có câu hỏi' : undefined} onClick={() => { setOpen(false); onDelete(); }}><Trash2 />Xóa nhóm</button></div>}</div>;
}

export default function QuestionGroupManagementPage({ showMsg, canManage = false }) {
  const { confirm } = useDialog();
  const [query, setQuery] = useState({ search: '', statuses: [], page: 1, limit: 10 });
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false); const [modal, setModal] = useState(null); const [selected, setSelected] = useState([]);
  const load = useCallback(async () => { try { setLoading(true); setResult(await listManagedQuestionGroups({ ...query, statuses: query.statuses.join(',') })); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể tải danh sách nhóm câu hỏi.', 'error'); } finally { setLoading(false); } }, [query, showMsg]);
  useEffect(() => { load(); }, [load]);
  const updateQuery = (key, value) => setQuery(current => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
  const remove = async group => { if (!await confirm({ title: 'Xóa nhóm câu hỏi?', message: `Nhóm “${group.name}” sẽ bị xóa vĩnh viễn.`, confirmText: 'Xóa nhóm' })) return; try { await deleteManagedQuestionGroup(group.id); showMsg?.('Đã xóa nhóm câu hỏi.', 'success'); load(); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xóa nhóm câu hỏi.', 'error'); } };
  const meta = result.meta || {};
  const rows = result.data || [];
  const toggleAll = () => setSelected(current => current.length === rows.length ? [] : rows.map(group => group.id));
  return <section className="question-group-page">
    <header className="question-group-topbar"><nav><span>Ngân hàng câu hỏi</span><ChevronRight /><strong>Quản lý nhóm câu hỏi</strong></nav></header>
    <main className="question-group-workspace"><section className="question-group-filter-card"><div className="question-group-toolbar"><div className="question-group-toolbar__filters"><SearchInput value={query.search} onChange={event => updateQuery('search', event.target.value)} onClear={() => updateQuery('search', '')} placeholder="Tìm kiếm theo tên nhóm..." /><MultiSelectFilter options={statusOptions} value={query.statuses} onApply={value => updateQuery('statuses', value)} placeholder="Tất cả trạng thái" selectedLabel="Trạng thái" allLabel="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái..." /></div>{canManage && <button type="button" className="question-group-button primary" onClick={() => setModal({})}><Plus />Thêm nhóm câu hỏi</button>}</div></section>
      <section className="question-group-card"><div className="question-group-table-wrap"><table><thead><tr>{canManage && <th className="select"><input type="checkbox" checked={rows.length > 0 && selected.length === rows.length} onChange={toggleAll} aria-label="Chọn tất cả" /></th>}<th>Mã nhóm</th><th>Tên nhóm câu hỏi</th><th className="center">Số lượng câu hỏi</th><th>Ngày cập nhật</th><th className="center">Trạng thái</th>{canManage && <th className="action">Thao tác</th>}</tr></thead><tbody>{loading ? <tr><td colSpan={canManage ? 7 : 5} className="question-group-empty">Đang tải…</td></tr> : rows.length ? rows.map(group => <tr key={group.id} className={selected.includes(group.id) ? 'selected' : ''}>{canManage && <td className="select"><input type="checkbox" checked={selected.includes(group.id)} onChange={() => setSelected(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id])} aria-label={`Chọn ${group.name}`} /></td>}<td><code>{group.code}</code></td><td><strong>{group.name}</strong></td><td className="center"><span className="question-group-count">{group.questionCount} câu hỏi</span></td><td>{formatDate(group.updatedAt)}</td><td className="center"><span className={`question-group-status ${group.status.toLowerCase()}`}><i />{group.status === 'DRAFT' ? 'Nháp' : labels[group.status]}</span></td>{canManage && <td className="action"><GroupActions group={group} onEdit={() => setModal(group)} onDelete={() => remove(group)} /></td>}</tr>) : <tr><td colSpan={canManage ? 7 : 5} className="question-group-empty"><FileText /><strong>Chưa có dữ liệu</strong><span>Thêm nhóm câu hỏi đầu tiên để bắt đầu phân loại.</span></td></tr>}</tbody></table></div>
        <footer className="question-group-pagination"><span>Tổng <b>{meta.total || 0}</b> nhóm câu hỏi</span><div><label>Hiển thị <select value={query.limit} onChange={event => updateQuery('limit', Number(event.target.value))}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select> / trang</label><button type="button" disabled={(meta.page || 1) <= 1} onClick={() => updateQuery('page', (meta.page || 1) - 1)}><ChevronLeft /></button><b><em>{meta.page || 1}</em> / {meta.totalPages || 1}</b><button type="button" disabled={(meta.page || 1) >= (meta.totalPages || 1)} onClick={() => updateQuery('page', (meta.page || 1) + 1)}><ChevronRight /></button></div></footer>
      </section>
    </main>
    {modal && <GroupModal group={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} onDelete={() => { const group = modal; setModal(null); remove(group); }} showMsg={showMsg} />}
  </section>;
}
