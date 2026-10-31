import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  Button, CodeText, ColumnVisibilityMenu, ConfirmDialog, DataTable, DateTimeDisplay,
  FilterBar, ListPage, MultiSelectFilter, Pagination, StatusBadge, TableToolbar,
} from '../../design-system-v2';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { deleteQuestion, getQuestionFilterOptions, listManagedQuestionGroups, listQuestions } from '../../services/questionBankService';
import { apiError, QUESTION_STATUSES, QUESTION_TYPES, statusLabel, typeLabel } from './constants';
import './question-list-page.css';

const SORT_FIELDS = {
  questionName: 'question_name',
  code: 'code',
  updatedAt: 'updated_at',
  status: 'status',
};

const ALL_COLUMN_KEYS = ['stt', 'questionName', 'code', 'questionType', 'groupName', 'subQuestionCount', 'updatedAt', 'status'];

export default function QuestionListPage({ navigate, showMsg, canManage = false }) {
  const [query, setQuery] = useState({ groupIds: [], questionTypes: [], statuses: [], page: 1, limit: 10, sortBy: 'updated_at', sortDirection: 'desc' });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [groups, setGroups] = useState([]);
  const [types, setTypes] = useState(QUESTION_TYPES);
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(ALL_COLUMN_KEYS);

  const setFilter = (key, value) => setQuery(current => ({ ...current, [key]: value, ...(key === 'page' ? {} : { page: 1 }) }));
  useEffect(() => setQuery(current => current.search === debouncedSearch ? current : { ...current, search: debouncedSearch, page: 1 }), [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await listQuestions({
        ...query,
        search: query.search || undefined,
        groupIds: query.groupIds.join(',') || undefined,
        questionTypes: query.questionTypes.join(',') || undefined,
        statuses: query.statuses.join(',') || undefined,
      });
      setResult(response);
    } catch (requestError) {
      setError(apiError(requestError, 'Không thể tải danh sách câu hỏi.'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listManagedQuestionGroups({ page: 1, limit: 100, statuses: 'ACTIVE,INACTIVE,DRAFT' }).then(response => setGroups(response.data || [])).catch(() => {});
    getQuestionFilterOptions().then(response => setTypes(response.data?.questionTypes || QUESTION_TYPES)).catch(() => {});
  }, []);

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteQuestion(pendingDelete.id);
      showMsg?.('Đã xóa câu hỏi.', 'success');
      setPendingDelete(null);
      await load();
    } catch (requestError) {
      showMsg?.(apiError(requestError, 'Không thể xóa câu hỏi.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const meta = result.meta || {};
  const allColumns = useMemo(() => [
    { key: 'stt', label: 'STT', align: 'center', width: 64, render: (_row, index) => ((meta.page || 1) - 1) * (meta.limit || 10) + index + 1 },
    { key: 'questionName', label: 'Tên câu hỏi', sortable: true, width: 260, render: row => <strong className="question-list__name">{row.questionName}</strong> },
    { key: 'code', label: 'Mã câu hỏi', sortable: true, width: 128, render: row => <CodeText className="iig3-list-code">{row.code}</CodeText> },
    { key: 'questionType', label: 'Dạng câu hỏi', width: 145, render: row => typeLabel(row.questionType) },
    { key: 'groupName', label: 'Nhóm câu hỏi', width: 220, render: row => row.groupName || '—' },
    { key: 'subQuestionCount', label: 'Số câu hỏi', align: 'center', width: 110, render: row => row.subQuestionCount || 0 },
    { key: 'updatedAt', label: 'Ngày cập nhật', sortable: true, sortType: 'date', width: 150, render: row => <DateTimeDisplay value={row.updatedAt} /> },
    { key: 'status', label: 'Trạng thái', sortable: true, align: 'center', width: 145, render: row => <StatusBadge status={row.status} label={statusLabel(row.status)} /> },
  ], [meta.limit, meta.page]);
  const columns = allColumns.filter(column => visibleColumnKeys.includes(column.key));
  const activeSortKey = Object.entries(SORT_FIELDS).find(([, apiKey]) => apiKey === query.sortBy)?.[0] || null;
  const sort = { key: activeSortKey, direction: query.sortDirection };
  const changeSort = next => setQuery(current => ({ ...current, sortBy: SORT_FIELDS[next.key] || 'updated_at', sortDirection: next.direction, page: 1 }));
  const rowActions = row => [
    { label: 'Chỉnh sửa', icon: <Pencil />, onClick: () => navigate(`/question-bank/${row.id}/edit`) },
    { label: 'Xóa câu hỏi', icon: <Trash2 />, danger: true, onClick: () => setPendingDelete(row) },
  ];
  const clearFilters = () => { setSearch(''); setQuery(current => ({ ...current, search: '', groupIds: [], questionTypes: [], statuses: [], page: 1 })); };
  const appliedCount = query.groupIds.length + query.questionTypes.length + query.statuses.length;

  const filters = <>
    <MultiSelectFilter label="Dạng câu hỏi" options={types} value={query.questionTypes} onChange={value => setFilter('questionTypes', value)} placeholder="Tất cả dạng câu hỏi" searchPlaceholder="Tìm dạng câu hỏi…" />
    <MultiSelectFilter label="Nhóm câu hỏi" options={groups.map(group => ({ value: group.id, label: group.name }))} value={query.groupIds} onChange={value => setFilter('groupIds', value)} placeholder="Tất cả nhóm câu hỏi" searchPlaceholder="Tìm nhóm câu hỏi…" />
    <MultiSelectFilter label="Trạng thái" options={QUESTION_STATUSES} value={query.statuses} onChange={value => setFilter('statuses', value)} placeholder="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái…" />
  </>;
  const createButton = canManage ? <Button size="sm" icon={<Plus />} onClick={() => navigate('/question-bank/new')}>Thêm mới</Button> : null;

  return <div className="iig3-list-screen question-list-page"><ListPage
    breadcrumb={[{ label: 'Ngân hàng câu hỏi', onClick: () => navigate('/question-bank') }, { label: 'Danh sách câu hỏi' }]}
    title="Danh sách câu hỏi"
    toolbar={<>
      <TableToolbar
        title="Tất cả câu hỏi"
        count={meta.total || 0}
        loading={loading}
        actions={createButton}
        view={<ColumnVisibilityMenu columns={allColumns} visibleKeys={visibleColumnKeys} requiredKeys={['questionName']} onChange={setVisibleColumnKeys} />}
      />
      <FilterBar search={search} onSearch={event => setSearch(event.target.value)} placeholder="Tìm tên hoặc mã câu hỏi…" filters={filters} appliedCount={appliedCount} onClear={clearFilters} loading={loading} />
    </>}
    table={<DataTable
      ariaLabel="Danh sách câu hỏi"
      columns={columns}
      rows={result.data || []}
      rowKey="id"
      selected={selected}
      onSelected={setSelected}
      loading={loading}
      error={error}
      errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={load}>Thử lại</Button>}
      emptyTitle="Chưa có câu hỏi"
      emptyDescription="Không có câu hỏi phù hợp với bộ lọc hiện tại."
      emptyAction={appliedCount || search ? <Button variant="outline" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button> : createButton}
      sort={sort}
      onSort={changeSort}
      manualSort
      onRowClick={canManage ? row => navigate(`/question-bank/${row.id}/edit`) : undefined}
      getRowActions={canManage ? rowActions : undefined}
    />}
    pagination={<Pagination page={meta.page || 1} pageCount={meta.totalPages || 1} pageSize={meta.limit || 10} total={meta.total || 0} loading={loading} onPage={page => setFilter('page', page)} onPageSize={limit => setQuery(current => ({ ...current, limit, page: 1 }))} />}
  />
  <ConfirmDialog open={Boolean(pendingDelete)} title="Xóa câu hỏi?" description={pendingDelete ? `Câu hỏi “${pendingDelete.questionName}” sẽ bị xóa cùng nội dung liên quan.` : ''} confirmLabel="Xóa câu hỏi" danger loading={deleting} onConfirm={remove} onClose={() => setPendingDelete(null)} />
  </div>;
}
