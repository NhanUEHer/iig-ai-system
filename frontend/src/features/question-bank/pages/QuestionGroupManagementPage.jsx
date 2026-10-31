import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  Button, CodeText, ColumnVisibilityMenu, ConfirmDialog, DataTable, DateTimeDisplay,
  FilterBar, FormField, Input, ListPage, Modal, MultiSelectFilter, Pagination,
  Select, StatusBadge, TableToolbar, Textarea,
} from '../../../design-system-v2';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import {
  createManagedQuestionGroup, deleteManagedQuestionGroup,
  listManagedQuestionGroups, updateManagedQuestionGroup,
} from '../../../services/questionBankService';
import { apiError, QUESTION_STATUSES, statusLabel } from '../../question-management/constants';
import './QuestionGroupManagementPage.css';

const EMPTY_FORM = { name: '', description: '', status: 'ACTIVE' };
const ALL_COLUMN_KEYS = ['stt', 'code', 'name', 'questionCount', 'updatedAt', 'status'];

function GroupModal({ group, onClose, onSaved, onRequestDelete, showMsg }) {
  const editing = Boolean(group?.id);
  const [form, setForm] = useState(group ? { name: group.name, description: group.description || '', status: group.status } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Vui lòng nhập tên nhóm câu hỏi.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), description: form.description.trim() };
      const response = editing ? await updateManagedQuestionGroup(group.id, payload) : await createManagedQuestionGroup(payload);
      showMsg?.(editing ? 'Đã cập nhật nhóm câu hỏi.' : 'Đã tạo nhóm câu hỏi.', 'success');
      onSaved(response.data);
    } catch (requestError) {
      setError(apiError(requestError, 'Không thể lưu nhóm câu hỏi.'));
    } finally {
      setSaving(false);
    }
  };

  const footer = <>
    {editing && <Button variant="ghost" icon={<Trash2 />} disabled={saving} onClick={() => onRequestDelete(group)}>Xóa nhóm</Button>}
    <span className="question-group-modal__spacer" />
    <Button variant="outline" disabled={saving} onClick={onClose}>Hủy</Button>
    <Button form="question-group-form" type="submit" loading={saving} icon={<Check />}>{editing ? 'Lưu thay đổi' : 'Tạo nhóm'}</Button>
  </>;

  return <Modal open title={editing ? 'Cập nhật nhóm câu hỏi' : 'Thêm nhóm câu hỏi'} description={editing ? 'Chỉnh sửa thông tin phân loại của nhóm câu hỏi.' : 'Tạo nhóm phân loại mới cho ngân hàng câu hỏi.'} footer={footer} onClose={saving ? undefined : onClose}>
    <form id="question-group-form" className="question-group-form" onSubmit={submit}>
      <FormField label="Tên nhóm câu hỏi" required error={error}>
        <Input value={form.name} maxLength={240} onChange={event => set('name', event.target.value)} placeholder="Nhập tên nhóm câu hỏi…" autoFocus />
      </FormField>
      <FormField label="Mô tả nhóm" description={`${form.description.length}/2.000 ký tự`}>
        <Textarea value={form.description} maxLength={2000} onChange={event => set('description', event.target.value)} placeholder="Mô tả ngắn gọn mục đích sử dụng…" rows={4} />
      </FormField>
      <FormField label={editing ? 'Trạng thái' : 'Trạng thái ban đầu'} required>
        <Select value={form.status} onChange={event => set('status', event.target.value)}>
          {QUESTION_STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </FormField>
      {editing && <p className="question-group-form__linked">Đang liên kết với <strong>{group.questionCount || 0} câu hỏi</strong>.</p>}
    </form>
  </Modal>;
}

export default function QuestionGroupManagementPage({ showMsg, canManage = false }) {
  const [query, setQuery] = useState({ search: '', statuses: [], page: 1, limit: 10 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalGroup, setModalGroup] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(ALL_COLUMN_KEYS);

  const setFilter = (key, value) => setQuery(current => ({ ...current, [key]: value, ...(key === 'page' ? {} : { page: 1 }) }));
  useEffect(() => setQuery(current => current.search === debouncedSearch ? current : { ...current, search: debouncedSearch, page: 1 }), [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listManagedQuestionGroups({ ...query, search: query.search || undefined, statuses: query.statuses.join(',') || undefined });
      setResult(response);
    } catch (requestError) {
      setError(apiError(requestError, 'Không thể tải danh sách nhóm câu hỏi.'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteManagedQuestionGroup(pendingDelete.id);
      showMsg?.('Đã xóa nhóm câu hỏi.', 'success');
      setPendingDelete(null);
      await load();
    } catch (requestError) {
      showMsg?.(apiError(requestError, 'Không thể xóa nhóm câu hỏi.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const meta = result.meta || {};
  const allColumns = useMemo(() => [
    { key: 'stt', label: 'STT', align: 'center', width: 64, render: (_row, index) => ((meta.page || 1) - 1) * (meta.limit || 10) + index + 1 },
    { key: 'code', label: 'Mã nhóm', width: 140, render: row => <CodeText className="iig3-list-code">{row.code}</CodeText> },
    { key: 'name', label: 'Tên nhóm câu hỏi', sortable: true, width: 320, render: row => <strong className="question-group-list__name">{row.name}</strong> },
    { key: 'questionCount', label: 'Số câu hỏi', sortable: true, sortType: 'number', align: 'center', width: 130, render: row => row.questionCount || 0 },
    { key: 'updatedAt', label: 'Ngày cập nhật', sortable: true, sortType: 'date', width: 170, render: row => <DateTimeDisplay value={row.updatedAt} /> },
    { key: 'status', label: 'Trạng thái', sortable: true, align: 'center', width: 150, render: row => <StatusBadge status={row.status} label={statusLabel(row.status)} /> },
  ], [meta.limit, meta.page]);
  const columns = allColumns.filter(column => visibleColumnKeys.includes(column.key));
  const createButton = canManage ? <Button size="sm" icon={<Plus />} onClick={() => setModalGroup({})}>Thêm mới</Button> : null;
  const rowActions = row => [
    { label: 'Chỉnh sửa', icon: <Pencil />, onClick: () => setModalGroup(row) },
    { label: 'Xóa nhóm', icon: <Trash2 />, danger: true, onClick: () => setPendingDelete(row) },
  ];
  const clearFilters = () => { setSearch(''); setQuery(current => ({ ...current, search: '', statuses: [], page: 1 })); };

  return <div className="iig3-list-screen question-group-list-page"><ListPage
    breadcrumb={[{ label: 'Ngân hàng câu hỏi', href: '/question-bank' }, { label: 'Danh sách nhóm câu hỏi' }]}
    title="Danh sách nhóm câu hỏi"
    toolbar={<>
      <TableToolbar title="Tất cả nhóm câu hỏi" count={meta.total || 0} loading={loading} actions={createButton} view={<ColumnVisibilityMenu columns={allColumns} visibleKeys={visibleColumnKeys} requiredKeys={['name']} onChange={setVisibleColumnKeys} />} />
      <FilterBar search={search} onSearch={event => setSearch(event.target.value)} placeholder="Tìm tên hoặc mã nhóm…" filters={<MultiSelectFilter label="Trạng thái" options={QUESTION_STATUSES} value={query.statuses} onChange={value => setFilter('statuses', value)} placeholder="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái…" />} appliedCount={query.statuses.length} onClear={clearFilters} loading={loading} />
    </>}
    table={<DataTable
      ariaLabel="Danh sách nhóm câu hỏi"
      columns={columns}
      rows={result.data || []}
      rowKey="id"
      loading={loading}
      error={error}
      errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={load}>Thử lại</Button>}
      emptyTitle="Chưa có nhóm câu hỏi"
      emptyDescription="Không có nhóm câu hỏi phù hợp với bộ lọc hiện tại."
      emptyAction={query.statuses.length || search ? <Button variant="outline" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button> : createButton}
      onRowClick={canManage ? row => setModalGroup(row) : undefined}
      getRowActions={canManage ? rowActions : undefined}
    />}
    pagination={<Pagination page={meta.page || 1} pageCount={meta.totalPages || 1} pageSize={meta.limit || 10} total={meta.total || 0} loading={loading} onPage={page => setFilter('page', page)} onPageSize={limit => setQuery(current => ({ ...current, limit, page: 1 }))} />}
  />
  {modalGroup && <GroupModal group={modalGroup.id ? modalGroup : null} showMsg={showMsg} onClose={() => setModalGroup(null)} onSaved={() => { setModalGroup(null); load(); }} onRequestDelete={group => { setModalGroup(null); setPendingDelete(group); }} />}
  <ConfirmDialog open={Boolean(pendingDelete)} title="Xóa nhóm câu hỏi?" description={pendingDelete ? `Nhóm “${pendingDelete.name}” sẽ bị xóa vĩnh viễn. Nhóm đang liên kết với câu hỏi sẽ không thể xóa.` : ''} confirmLabel="Xóa nhóm" danger loading={deleting} onConfirm={remove} onClose={() => setPendingDelete(null)} />
  </div>;
}
