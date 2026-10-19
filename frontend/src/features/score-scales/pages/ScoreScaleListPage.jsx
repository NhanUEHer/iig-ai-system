import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteScoreScale, listScoreScales } from '../../../services/scoreScaleService';
import Button from '../../../components/ui/Button';
import { DataTable, Pagination } from '../../../components/ui/DataTable';
import { Breadcrumb } from '../../../components/ui/Layout';
import SearchInput from '../../../components/ui/SearchInput';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import { ConfirmDialog } from '../../../components/ui/Feedback';
import QuestionBankRowActions from '../../question-bank/components/QuestionBankRowActions';
import './ScoreScaleListPage.css';
import './ScoreScaleListPageActions.css';

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'ACTIVE', label: 'Đang sử dụng' },
  { value: 'INACTIVE', label: 'Ngừng sử dụng' },
];
const TYPE_OPTIONS = [{ value: 'LR_RAW_CORRECT', label: 'Theo số câu đúng (LR)' }];

const statusMeta = {
  DRAFT: { label: 'Bản nháp', tone: 'draft' },
  ACTIVE: { label: 'Đang sử dụng', tone: 'active' },
  INACTIVE: { label: 'Ngừng sử dụng', tone: 'inactive' },
};

const formatNumber = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const formatDate = value => value ? new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(',', '') : '—';

export default function ScoreScaleListPage({ navigate, showMsg, canManage = false }) {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', scaleType: '', status: '', page: 1, limit: 10 });
  const [result, setResult] = useState({ items: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const updateFilter = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setResult(await listScoreScales(filters)); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Không thể tải danh sách thang điểm.'); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(current => current.search === searchInput.trim() ? current : { ...current, search: searchInput.trim(), page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try { await deleteScoreScale(pendingDelete.id); setPendingDelete(null); showMsg?.('Đã xóa thang điểm.', 'success'); await load(); }
    catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể xóa thang điểm.', 'error'); }
    finally { setDeleting(false); }
  };

  const columns = [
    { key: 'number', label: 'STT', className: 'is-center', width: 64, render: (_row, index) => (Number(result.meta?.page || 1) - 1) * Number(result.meta?.limit || filters.limit) + index + 1 },
    { key: 'name', label: 'Tên thang điểm', render: row => <div className="score-scale-identity"><strong>{row.name}</strong><small>Thang LR theo số câu đúng</small></div> },
    { key: 'scaleType', label: 'Loại thang', render: () => <span className="score-scale-type">Theo số câu đúng</span> },
    { key: 'questionCount', label: 'Số câu hỏi', className: 'is-center', render: row => formatNumber(row.questionCount) },
    { key: 'range', label: 'Khoảng điểm', className: 'is-center', render: row => <span className="score-scale-range">{formatNumber(row.minScore)} – {formatNumber(row.maxScore)}</span> },
    { key: 'step', label: 'Khoảng cách', className: 'is-center', render: row => formatNumber(row.scoreStep) },
    { key: 'status', label: 'Trạng thái', className: 'is-center', render: row => { const meta = statusMeta[row.status] || statusMeta.DRAFT; return <span className={`score-scale-status is-${meta.tone}`}><i />{meta.label}</span>; } },
    { key: 'updatedAt', label: 'Ngày cập nhật', render: row => <span className="score-scale-date">{formatDate(row.updatedAt)}</span> },
    { key: 'actions', label: 'Thao tác', className: 'is-center', width: 82, render: row => {
      const editable = canManage && row.status === 'DRAFT';
      return <QuestionBankRowActions actions={[{ label: editable ? 'Chỉnh sửa' : 'Xem chi tiết', icon: editable ? <Pencil /> : <Eye />, onClick: () => navigate(`/score-scales/${row.id}/edit`) }, ...(editable ? [{ label: 'Xóa thang điểm', icon: <Trash2 />, danger: true, onClick: () => setPendingDelete(row) }] : [])]} />;
    } },
  ];
  return <section className="score-scale-list-page">
    <header className="score-scale-list-header"><Breadcrumb separator={<ChevronRight />} items={[{ label: 'Quản lý thang điểm' }, { label: 'Danh sách thang điểm', current: true }]} /></header>
    <main className="score-scale-list-main">
      <section className="score-scale-filter-card">
        <div className="score-scale-filters"><SearchInput value={searchInput} onChange={event => setSearchInput(event.target.value)} onClear={() => setSearchInput('')} placeholder="Tìm tên thang điểm..." /><MultiSelectFilter options={TYPE_OPTIONS} value={filters.scaleType ? [filters.scaleType] : []} onApply={value => updateFilter('scaleType', value[0] || '')} placeholder="Tất cả loại thang" selectedLabel="Loại thang" allLabel="Tất cả loại thang" /><MultiSelectFilter options={STATUS_OPTIONS} value={filters.status ? [filters.status] : []} onApply={value => updateFilter('status', value[0] || '')} placeholder="Tất cả trạng thái" selectedLabel="Trạng thái" allLabel="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái..." /></div>
        {canManage && <Button size="sm" className="score-scale-add" icon={<Plus />} onClick={() => navigate('/score-scales/new')}>Thêm thang điểm</Button>}
      </section>
      <section className="score-scale-table-card"><DataTable columns={columns} data={result.items || []} rowKey="id" loading={loading} error={error} /><Pagination summaryLabel="Tổng" page={result.meta?.page || 1} pageSize={result.meta?.limit || filters.limit} total={result.meta?.total || 0} onPageChange={page => updateFilter('page', page)} onPageSizeChange={limit => setFilters(current => ({ ...current, limit, page: 1 }))} /></section>
    </main>
    <ConfirmDialog
      open={Boolean(pendingDelete)}
      title="Xóa thang điểm?"
      message={pendingDelete ? `Thang điểm “${pendingDelete.name}” sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.` : ''}
      severity="danger"
      confirmText="Xóa thang điểm"
      onCancel={() => !deleting && setPendingDelete(null)}
      onConfirm={remove}
      loading={deleting}
    />
  </section>;
}
