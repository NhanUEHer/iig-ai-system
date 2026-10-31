import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RotateCcw } from 'lucide-react';
import {
  Button, CodeText, ColumnVisibilityMenu, DataTable, DateTimeDisplay, FilterBar,
  ListPage, MultiSelectFilter, Pagination, StatusBadge, TableToolbar,
} from '../../../design-system-v2';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { listExams } from '../../../services/examService';
import { EXAM_STATUS_OPTIONS, examStatusMeta } from '../examStatus';
import './ExamListPage.css';

const EXAM_TYPE_OPTIONS = [
  { value: 'LISTENING_READING', label: 'Đề Listening & Reading' },
  { value: 'READING', label: 'Đề Reading' },
  { value: 'LISTENING', label: 'Đề Listening' },
  { value: 'SPEAKING_WRITING', label: 'Đề Speaking & Writing' },
  { value: 'SPEAKING', label: 'Đề Speaking' },
  { value: 'WRITING', label: 'Đề Writing' },
];

const ALL_COLUMN_KEYS = ['stt', 'examCode', 'title', 'examType', 'sectionCount', 'subQuestionCount', 'status', 'updatedAt'];
const examTypeLabel = value => EXAM_TYPE_OPTIONS.find(option => option.value === value)?.label || 'Chưa phân loại';

export default function ExamListPage({ navigate, canManage = false }) {
  const [query, setQuery] = useState({ search: '', statuses: [], examTypes: [], page: 1, limit: 10 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(ALL_COLUMN_KEYS);

  const setFilter = (key, value) => setQuery(current => ({ ...current, [key]: value, ...(key === 'page' ? {} : { page: 1 }) }));
  useEffect(() => setQuery(current => current.search === debouncedSearch.trim() ? current : { ...current, search: debouncedSearch.trim(), page: 1 }), [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listExams({
        ...query,
        search: query.search || undefined,
        statuses: query.statuses.join(',') || undefined,
        examTypes: query.examTypes.join(',') || undefined,
      });
      setResult(response);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không thể tải danh sách đề thi.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const meta = result.meta || {};
  const allColumns = useMemo(() => [
    { key: 'stt', label: 'STT', align: 'center', width: 64, render: (_row, index) => ((meta.page || 1) - 1) * (meta.limit || 10) + index + 1 },
    { key: 'examCode', label: 'Mã đề', sortable: true, width: 130, render: row => <CodeText className="iig3-list-code">{row.examCode || '—'}</CodeText> },
    { key: 'title', label: 'Tên đề thi', sortable: true, width: 320, render: row => <strong className="exam-list__title">{row.title}</strong> },
    { key: 'examType', label: 'Kiểu đề thi', sortable: true, width: 220, render: row => examTypeLabel(row.examType) },
    { key: 'sectionCount', label: 'Số phần thi', sortable: true, sortType: 'number', align: 'center', width: 120, render: row => Number(row.sectionCount || 0) },
    { key: 'subQuestionCount', label: 'Tổng câu hỏi', sortable: true, sortType: 'number', align: 'center', width: 130, render: row => Number(row.subQuestionCount || 0) },
    { key: 'status', label: 'Trạng thái', sortable: true, align: 'center', width: 150, render: row => <StatusBadge status={row.status} label={examStatusMeta(row.status).label} /> },
    { key: 'updatedAt', label: 'Ngày cập nhật', sortable: true, sortType: 'date', width: 170, render: row => <DateTimeDisplay value={row.updatedAt} /> },
  ], [meta.limit, meta.page]);
  const columns = allColumns.filter(column => visibleColumnKeys.includes(column.key));
  const appliedCount = query.statuses.length + query.examTypes.length;
  const clearFilters = () => {
    setSearch('');
    setQuery(current => ({ ...current, search: '', statuses: [], examTypes: [], page: 1 }));
  };
  const createButton = canManage ? <Button size="sm" icon={<Plus />} onClick={() => navigate('/exams/new')}>Thêm mới</Button> : null;
  const rowActions = row => [{ label: 'Chỉnh sửa', icon: <Pencil />, onClick: () => navigate(`/exams/${row.id}/edit`) }];

  return <div className="iig3-list-screen exam-list-page"><ListPage
    breadcrumb={[{ label: 'Quản lý đề thi' }, { label: 'Danh sách đề thi' }]}
    title="Danh sách đề thi"
    toolbar={<>
      <TableToolbar title="Tất cả đề thi" count={meta.total || 0} loading={loading} actions={createButton} view={<ColumnVisibilityMenu columns={allColumns} visibleKeys={visibleColumnKeys} requiredKeys={['title']} onChange={setVisibleColumnKeys} />} />
      <FilterBar
        search={search}
        onSearch={event => setSearch(event.target.value)}
        placeholder="Tìm tên hoặc mã đề…"
        filters={<>
          <MultiSelectFilter label="Kiểu đề" options={EXAM_TYPE_OPTIONS} value={query.examTypes} onChange={value => setFilter('examTypes', value)} placeholder="Tất cả kiểu đề" searchPlaceholder="Tìm kiểu đề…" />
          <MultiSelectFilter label="Trạng thái" options={EXAM_STATUS_OPTIONS} value={query.statuses} onChange={value => setFilter('statuses', value)} placeholder="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái…" />
        </>}
        appliedCount={appliedCount}
        onClear={clearFilters}
        loading={loading}
      />
    </>}
    table={<DataTable
      ariaLabel="Danh sách đề thi"
      columns={columns}
      rows={result.data || []}
      rowKey="id"
      loading={loading}
      error={error}
      errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={load}>Thử lại</Button>}
      emptyTitle="Chưa có đề thi"
      emptyDescription="Không có đề thi phù hợp với bộ lọc hiện tại."
      emptyAction={appliedCount || search ? <Button variant="outline" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button> : createButton}
      onRowClick={canManage ? row => navigate(`/exams/${row.id}/edit`) : undefined}
      getRowActions={canManage ? rowActions : undefined}
    />}
    pagination={<Pagination page={meta.page || 1} pageCount={meta.totalPages || 1} pageSize={meta.limit || 10} total={meta.total || 0} loading={loading} onPage={page => setFilter('page', page)} onPageSize={limit => setQuery(current => ({ ...current, limit, page: 1 }))} />}
  /></div>;
}
