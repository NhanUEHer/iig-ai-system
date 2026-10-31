import React, { useMemo } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import { Badge, Button, CodeText, ReorderableDataTable, StatusBadge } from '../../../../design-system-v2';

export default function DetailRowSection({ section, team, loading, error, onRetry, onEdit, onReorder, busy }) {
  const activeIndex = useMemo(() => new Map(section.rows.filter(item => item.is_active).map((item, index) => [item.id, index + 1])), [section.rows]);
  const showGroup = team === 'REV' || team === 'ADS';
  const columns = [
    { key: 'order', label: 'STT', align: 'center', width: 64, render: row => activeIndex.get(row.id) || '—' },
    { key: 'name', label: 'Tên dòng', width: 340, render: row => <strong className="kpi-config__name">{row.row_name}</strong> },
    { key: 'code', label: 'Mã dòng', width: 210, render: row => <CodeText className="iig3-list-code">{row.row_code}</CodeText> },
    ...(showGroup ? [{ key: 'group', label: 'Nhóm sản phẩm', width: 190, render: row => row.row_group || '—' }] : []),
    { key: 'required', label: 'Bắt buộc', align: 'center', width: 110, render: row => <Badge tone={row.is_required ? 'warning' : 'neutral'}>{row.is_required ? 'Có' : 'Không'}</Badge> },
    { key: 'status', label: 'Trạng thái', width: 140, render: row => <StatusBadge status={row.is_active ? 'active' : 'inactive'} label={row.is_active ? 'Đang dùng' : 'Đã ngừng'} /> },
  ];
  return <section className="kpi-detail-section">
    {section.title && <header><div><strong>{section.title}</strong><small>{section.description}</small></div><Badge tone="info">{section.rows.filter(item => item.is_active).length} dòng đang dùng</Badge></header>}
    <ReorderableDataTable
      ariaLabel={section.title || 'Danh sách dòng mẫu'}
      columns={columns}
      rows={section.rows}
      loading={loading}
      error={error}
      errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={onRetry}>Thử lại</Button>}
      emptyTitle="Chưa có dòng mẫu"
      emptyDescription="Thêm dòng mẫu để cấu hình dữ liệu chi tiết."
      isRowReorderable={row => row.is_active && !busy}
      reorderLabel="Sắp xếp dòng mẫu"
      onReorder={payload => onReorder(section.key, payload)}
      getRowActions={row => [{ label: 'Chỉnh sửa dòng', icon: <Pencil />, onClick: () => onEdit(row) }]}
    />
  </section>;
}
