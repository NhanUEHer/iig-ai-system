import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  Button, ColumnVisibilityMenu, ConfirmDialog, DataTable, DateTimeDisplay, FilterBar,
  ListPage, MultiSelectFilter, Pagination, StatusBadge, TableToolbar,
} from '../../../design-system-v2';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { deleteScoreScale, listScoreScales } from '../../../services/scoreScaleService';
import './ScoreScaleListPage.css';

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'ACTIVE', label: 'Đang sử dụng' },
  { value: 'INACTIVE', label: 'Ngừng sử dụng' },
];
const TYPE_OPTIONS = [{ value: 'LR_RAW_CORRECT', label: 'Theo số câu đúng (LR)' }];
const STATUS_META = {
  DRAFT: { label: 'Bản nháp', tone: 'draft' },
  ACTIVE: { label: 'Đang sử dụng', tone: 'active' },
  INACTIVE: { label: 'Ngừng sử dụng', tone: 'inactive' },
};
const ALL_COLUMN_KEYS = ['number', 'name', 'scaleType', 'questionCount', 'range', 'step', 'status', 'updatedAt'];
const formatNumber = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export default function ScoreScaleListPage({ navigate, showMsg, canManage = false }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [filters, setFilters] = useState({ search: '', scaleType: '', status: '', page: 1, limit: 10 });
  const [result, setResult] = useState({ items: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(ALL_COLUMN_KEYS);

  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key === 'page' ? {} : { page: 1 }) }));
  useEffect(() => setFilters(current => current.search === debouncedSearch.trim() ? current : { ...current, search: debouncedSearch.trim(), page: 1 }), [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setResult(await listScoreScales({ ...filters, search: filters.search || undefined, scaleType: filters.scaleType || undefined, status: filters.status || undefined })); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Không thể tải danh sách thang điểm.'); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteScoreScale(pendingDelete.id);
      setPendingDelete(null);
      showMsg?.('Đã xóa thang điểm.', 'success');
      await load();
    } catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể xóa thang điểm.', 'error'); }
    finally { setDeleting(false); }
  };

  const meta = result.meta || {};
  const allColumns = useMemo(() => [
    { key: 'number', label: 'STT', align: 'center', width: 64, render: (_row, index) => (Number(meta.page || 1) - 1) * Number(meta.limit || filters.limit) + index + 1 },
    { key: 'name', label: 'Tên thang điểm', sortable: true, width: 300, render: row => <span className="score-scale-list__identity"><strong>{row.name}</strong><small>Thang LR theo số câu đúng</small></span> },
    { key: 'scaleType', label: 'Loại thang', sortable: true, width: 220, render: () => 'Theo số câu đúng (LR)' },
    { key: 'questionCount', label: 'Số câu hỏi', sortable: true, sortType: 'number', align: 'center', width: 120, render: row => formatNumber(row.questionCount) },
    { key: 'range', label: 'Khoảng điểm', sortable: true, sortType: 'number', align: 'center', width: 150, sortValue: row => row.minScore, render: row => <strong>{formatNumber(row.minScore)}–{formatNumber(row.maxScore)}</strong> },
    { key: 'step', label: 'Khoảng cách', sortable: true, sortType: 'number', align: 'center', width: 130, sortValue: row => row.scoreStep, render: row => formatNumber(row.scoreStep) },
    { key: 'status', label: 'Trạng thái', sortable: true, align: 'center', width: 160, render: row => { const status = STATUS_META[row.status] || STATUS_META.DRAFT; return <StatusBadge status={status.tone} label={status.label} />; } },
    { key: 'updatedAt', label: 'Ngày cập nhật', sortable: true, sortType: 'date', width: 170, render: row => <DateTimeDisplay value={row.updatedAt} /> },
  ], [filters.limit, meta.limit, meta.page]);
  const columns = allColumns.filter(column => visibleColumnKeys.includes(column.key));
  const createButton = canManage ? <Button size="sm" icon={<Plus />} onClick={() => navigate('/score-scales/new')}>Thêm mới</Button> : null;
  const rowActions = row => {
    const editable = canManage && row.status === 'DRAFT';
    return [
      { label: editable ? 'Chỉnh sửa' : 'Xem chi tiết', icon: editable ? <Pencil /> : <Eye />, onClick: () => navigate(`/score-scales/${row.id}/edit`) },
      ...(editable ? [{ label: 'Xóa thang điểm', icon: <Trash2 />, danger: true, onClick: () => setPendingDelete(row) }] : []),
    ];
  };
  const appliedCount = Number(Boolean(filters.scaleType)) + Number(Boolean(filters.status));
  const clearFilters = () => {
    setSearch('');
    setFilters(current => ({ ...current, search: '', scaleType: '', status: '', page: 1 }));
  };

  return <div className="iig3-list-screen score-scale-list-page"><ListPage
    breadcrumb={[{ label: 'Quản lý thang điểm' }, { label: 'Danh sách thang điểm' }]}
    title="Danh sách thang điểm"
    toolbar={<>
      <TableToolbar title="Tất cả thang điểm" count={meta.total || 0} loading={loading} actions={createButton} view={<ColumnVisibilityMenu columns={allColumns} visibleKeys={visibleColumnKeys} requiredKeys={['name']} onChange={setVisibleColumnKeys} />} />
      <FilterBar
        search={search}
        onSearch={event => setSearch(event.target.value)}
        placeholder="Tìm tên hoặc mã thang điểm…"
        filters={<>
          <MultiSelectFilter label="Loại thang" options={TYPE_OPTIONS} value={filters.scaleType ? [filters.scaleType] : []} onChange={value => setFilter('scaleType', value.at(-1) || '')} placeholder="Tất cả loại thang" searchPlaceholder="Tìm loại thang…" />
          <MultiSelectFilter label="Trạng thái" options={STATUS_OPTIONS} value={filters.status ? [filters.status] : []} onChange={value => setFilter('status', value.at(-1) || '')} placeholder="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái…" />
        </>}
        appliedCount={appliedCount}
        onClear={clearFilters}
        loading={loading}
      />
    </>}
    table={<DataTable
      ariaLabel="Danh sách thang điểm"
      columns={columns}
      rows={result.items || []}
      rowKey="id"
      loading={loading}
      error={error}
      errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={load}>Thử lại</Button>}
      emptyTitle="Chưa có thang điểm"
      emptyDescription="Không có thang điểm phù hợp với bộ lọc hiện tại."
      emptyAction={appliedCount || search ? <Button variant="outline" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button> : createButton}
      onRowClick={row => navigate(`/score-scales/${row.id}/edit`)}
      getRowActions={rowActions}
    />}
    pagination={<Pagination page={meta.page || 1} pageCount={meta.totalPages || 1} pageSize={meta.limit || filters.limit} total={meta.total || 0} loading={loading} onPage={page => setFilter('page', page)} onPageSize={limit => setFilter('limit', limit)} />}
  />
  <ConfirmDialog open={Boolean(pendingDelete)} title="Xóa thang điểm?" description={pendingDelete ? `Thang điểm “${pendingDelete.name}” sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.` : ''} confirmLabel="Xóa thang điểm" danger loading={deleting} onConfirm={remove} onClose={() => !deleting && setPendingDelete(null)} />
  </div>;
}
