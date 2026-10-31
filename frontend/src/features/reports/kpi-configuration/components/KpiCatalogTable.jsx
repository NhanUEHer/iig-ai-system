import React, { useMemo } from 'react';
import { Pencil, Power, RotateCcw } from 'lucide-react';
import { Badge, Button, CodeText, ReorderableDataTable, StatusBadge } from '../../../../design-system-v2';
import { EVALUATION_DIRECTIONS, SOURCE_LABELS } from '../constants';

export default function KpiCatalogTable({ items, loading, error, onRetry, onEdit, onToggle, onReorder, busy }) {
  const activeIndex = useMemo(() => new Map(items.filter(item => item.is_active).map((item, index) => [item.id, index + 1])), [items]);
  const columns = [
    { key: 'order', label: 'STT', align: 'center', width: 64, render: row => activeIndex.get(row.id) || '—' },
    { key: 'code', label: 'Mã KPI', width: 110, render: row => <CodeText className="iig3-list-code">{row.code}</CodeText> },
    { key: 'name', label: 'Tên chỉ số', width: 320, render: row => <strong className="kpi-config__name">{row.name}</strong> },
    { key: 'unit', label: 'Đơn vị', width: 130 },
    { key: 'evaluationDirection', label: 'Chiều đánh giá', width: 150, render: row => EVALUATION_DIRECTIONS.find(item => item.value === row.evaluation_direction)?.label || row.evaluation_direction },
    { key: 'source', label: 'Nguồn dữ liệu', width: 140, render: row => <Badge tone={row.input_mode === 'derived' ? 'info' : 'neutral'}>{SOURCE_LABELS[row.input_mode] || 'Nhập tay'}</Badge> },
    { key: 'status', label: 'Trạng thái', width: 140, render: row => <StatusBadge status={row.is_active ? 'active' : 'inactive'} label={row.is_active ? 'Đang dùng' : 'Đã ngừng'} /> },
  ];
  const actions = row => [
    { label: 'Chỉnh sửa KPI', icon: <Pencil />, onClick: () => onEdit(row) },
    { label: row.is_active ? 'Ngừng sử dụng' : 'Kích hoạt lại', icon: row.is_active ? <Power /> : <RotateCcw />, danger: row.is_active, disabled: busy, onClick: () => onToggle(row) },
  ];
  return <ReorderableDataTable
    ariaLabel="Danh mục chỉ số KPI"
    columns={columns}
    rows={items}
    loading={loading}
    error={error}
    errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={onRetry}>Thử lại</Button>}
    emptyTitle="Chưa có KPI cho bộ phận này"
    emptyDescription="Chọn “Thêm KPI” để bắt đầu cấu hình bộ chỉ số."
    isRowReorderable={row => row.is_active && !busy}
    reorderLabel="Sắp xếp KPI"
    onReorder={onReorder}
    getRowActions={actions}
  />;
}
