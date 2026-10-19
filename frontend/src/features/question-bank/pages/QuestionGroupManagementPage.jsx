import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronRight, CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react';
import { createManagedQuestionGroup, deleteManagedQuestionGroup, listManagedQuestionGroups, updateManagedQuestionGroup } from '../../../services/questionBankService';
import { Breadcrumb, Button, DataTable, DateDisplay, FormField, Input, Modal, Pagination, Select, Textarea } from '../../../components/ui';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import SearchInput from '../../../components/ui/SearchInput';
import { useDialog } from '../../../components/feedback/dialogContext';
import QuestionBankRowActions from '../components/QuestionBankRowActions';
import './QuestionBankListPage.css';
import './QuestionBankRowMenu.css';
import './QuestionBankStitchOverrides.css';
import './QuestionBankToolbar.css';
import './QuestionBankTopbar.css';
import './QuestionBankFilterCompact.css';
import './QuestionGroupManagementPage.css';
import './QuestionGroupManagementFilterOverrides.css';
import './QuestionGroupManagementModal.css';

const emptyForm = { name: '', description: '', status: 'ACTIVE' };
const labels = { ACTIVE: 'Hoạt động', INACTIVE: 'Dừng hoạt động', DRAFT: 'Bản nháp' };
const statusOptions = [{ value: 'ACTIVE', label: 'Hoạt động' }, { value: 'INACTIVE', label: 'Dừng hoạt động' }, { value: 'DRAFT', label: 'Bản nháp' }];

function GroupModal({ group, onClose, onSaved, onDelete, showMsg }) {
  const editing = Boolean(group?.id);
  const [form, setForm] = useState(group ? { name: group.name, description: group.description || '', status: group.status } : emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Vui lòng nhập tên nhóm câu hỏi.'); return; }
    try {
      setSaving(true);
      const result = editing ? await updateManagedQuestionGroup(group.id, form) : await createManagedQuestionGroup(form);
      showMsg?.(editing ? 'Đã cập nhật nhóm câu hỏi.' : 'Đã tạo nhóm câu hỏi.', 'success');
      onSaved(result.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không thể lưu nhóm câu hỏi.');
    } finally {
      setSaving(false);
    }
  };
  const footer = <>
    {editing && <Button type="button" size="sm" variant="danger" className="question-group-delete-button" icon={<Trash2 />} onClick={onDelete}>Xóa nhóm</Button>}
    <div className="question-group-editor-footer-actions">
      <Button type="button" size="sm" variant="secondary" onClick={onClose}>Hủy</Button>
      <Button type="submit" form="question-group-form" size="sm" loading={saving} icon={<Check />}>{editing ? 'Lưu thay đổi' : 'Tạo nhóm'}</Button>
    </div>
  </>;
  return <Modal open title={editing ? 'Cập nhật nhóm câu hỏi' : 'Thêm mới nhóm câu hỏi'} onClose={onClose} footer={footer} className="question-group-modal">
    <form id="question-group-form" className="question-group-form-grid" onSubmit={submit}>
      <FormField id="question-group-name" label="Tên nhóm câu hỏi" required className="full"><Input id="question-group-name" value={form.name} maxLength="240" onChange={event => set('name', event.target.value)} placeholder="Nhập tên nhóm câu hỏi (VD: Luyện thi IELTS - Listening Section 1)..." autoFocus /></FormField>
      <FormField id="question-group-description" label="Mô tả nhóm" className="full"><Textarea id="question-group-description" value={form.description} maxLength="2000" onChange={event => set('description', event.target.value)} placeholder="Mô tả ngắn gọn về mục đích sử dụng của nhóm câu hỏi này..." rows="3" /></FormField>
      <FormField id="question-group-status" label={editing ? 'Trạng thái' : 'Trạng thái ban đầu'} required className="full"><Select id="question-group-status" value={form.status} onChange={event => set('status', event.target.value)}>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></FormField>
      {editing && <div className="question-group-linked full"><CircleAlert /><span>Đang liên kết với <strong>{group.questionCount} câu hỏi</strong> trong ngân hàng đề thi</span></div>}
      {error && <p className="question-group-form-error full" role="alert">{error}</p>}
    </form>
  </Modal>;
}

export default function QuestionGroupManagementPage({ showMsg, canManage = false }) {
  const { confirm } = useDialog();
  const [query, setQuery] = useState({ search: '', statuses: [], page: 1, limit: 10 });
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState([]);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setResult(await listManagedQuestionGroups({ ...query, statuses: query.statuses.join(',') }));
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Không thể tải danh sách nhóm câu hỏi.';
      setError(message);
      showMsg?.(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [query, showMsg]);
  useEffect(() => { load(); }, [load]);
  const updateQuery = (key, value) => setQuery(current => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
  const remove = async group => {
    if (!await confirm({ title: 'Xóa nhóm câu hỏi?', message: `Nhóm “${group.name}” sẽ bị xóa vĩnh viễn.`, confirmText: 'Xóa nhóm' })) return;
    try {
      await deleteManagedQuestionGroup(group.id);
      showMsg?.('Đã xóa nhóm câu hỏi.', 'success');
      load();
    } catch (requestError) {
      showMsg?.(requestError.response?.data?.error || 'Không thể xóa nhóm câu hỏi.', 'error');
    }
  };
  const meta = result.meta || {};
  const rows = result.data || [];
  const columns = [
    { key: 'rowNumber', label: 'STT', className: 'is-center', width: 64, render: (_group, index) => ((meta.page || 1) - 1) * (meta.limit || 10) + index + 1 },
    { key: 'code', label: 'Mã nhóm', render: group => <code>{group.code}</code> },
    { key: 'name', label: 'Tên nhóm câu hỏi', render: group => <strong>{group.name}</strong> },
    { key: 'questionCount', label: 'Số lượng câu hỏi', className: 'is-center', render: group => `${group.questionCount} câu hỏi` },
    { key: 'updatedAt', label: 'Ngày cập nhật', render: group => <DateDisplay value={group.updatedAt} includeTime /> },
    { key: 'status', label: 'Trạng thái', className: 'is-center', render: group => <span className={`question-bank-status is-${String(group.status).toLowerCase()}`}><i />{labels[group.status] || group.status}</span> },
    ...(canManage ? [{ key: 'actions', label: 'Thao tác', className: 'question-bank-actions is-center', render: group => <QuestionBankRowActions actions={[{ label: 'Chỉnh sửa', icon: <Pencil />, onClick: () => setModal(group) }, { label: 'Xóa nhóm', icon: <Trash2 />, danger: true, onClick: () => remove(group) }]} /> }] : []),
  ];
  return <section className="question-bank-page question-group-list-page">
    <header className="question-bank-topbar"><Breadcrumb separator={<ChevronRight />} items={[{ label: 'Ngân hàng câu hỏi' }, { label: 'Quản lý nhóm câu hỏi', current: true }]} /></header>
    <main className="question-bank-workspace">
      <section className="question-bank-filter-card"><div className="question-bank-filter-row"><div className="question-bank-filters"><SearchInput value={query.search} onChange={event => updateQuery('search', event.target.value)} onClear={() => updateQuery('search', '')} placeholder="Tìm kiếm theo tên nhóm..." /><MultiSelectFilter options={statusOptions} value={query.statuses} onApply={value => updateQuery('statuses', value)} placeholder="Tất cả trạng thái" selectedLabel="Trạng thái" allLabel="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái..." /></div>{canManage && <Button type="button" size="sm" className="question-bank-create-button" icon={<Plus />} onClick={() => setModal({})}>Thêm nhóm câu hỏi</Button>}</div></section>
      <section className="question-bank-table-card">
        <DataTable columns={columns} data={rows} rowKey="id" loading={loading} error={error} selectable={canManage} selectedRowKeys={selected} onSelectionChange={setSelected} />
        <Pagination summaryLabel="Tổng" page={meta.page || 1} pageSize={meta.limit || 10} total={meta.total || 0} onPageChange={page => updateQuery('page', page)} onPageSizeChange={limit => setQuery(current => ({ ...current, limit, page: 1 }))} />
      </section>
    </main>
    {modal && <GroupModal group={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} onDelete={() => { const group = modal; setModal(null); remove(group); }} showMsg={showMsg} />}
  </section>;
}
