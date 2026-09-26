import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, LoaderCircle, Inbox } from 'lucide-react';
import './data.css';
import './data-overrides.css';

export function DataTable({ columns = [], data = [], rowKey = 'id', loading = false, error, selectable = false, selectedRowKeys = [], onSelectionChange, emptyState, className = '', children, sortable = false, onSort, bulkActions }) {
  const [sort, setSort] = useState({ key: '', direction: 'asc' });
  const sortedData = useMemo(() => { if (!sortable || !sort.key) return data; return [...data].sort((a, b) => String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), undefined, { numeric: true }) * (sort.direction === 'asc' ? 1 : -1)); }, [data, sort, sortable]);
  const allSelected = data.length > 0 && data.every(row => selectedRowKeys.includes(row[rowKey]));
  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : data.map(row => row[rowKey]));
  };
  const toggleSort = key => { const next = { key, direction: sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc' }; setSort(next); onSort?.(next); };
  return <div className={['ui-table-wrap', className].filter(Boolean).join(' ')}>
    {bulkActions && selectedRowKeys.length > 0 && <div className="ui-table-bulkbar"><strong>{selectedRowKeys.length} dòng đã chọn</strong><div>{bulkActions.map(action => <button type="button" key={action.label} className={action.danger ? 'is-danger' : ''} onClick={() => action.onClick?.(selectedRowKeys)}>{action.icon}{action.label}</button>)}</div></div>}
    <table className="ui-table">
      <thead><tr>
        {selectable && <th className="ui-table__select"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Chọn tất cả" /></th>}
        {columns.map(column => <th key={column.key} className={column.className} style={column.width ? { width: column.width } : undefined}><button type="button" className={sortable && column.sortable !== false ? 'ui-table__sort' : 'ui-table__sort is-static'} onClick={() => sortable && column.sortable !== false && toggleSort(column.key)}>{column.label}{sortable && column.sortable !== false && <span aria-hidden="true">{sort.key === column.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>}</button></th>)}
      </tr></thead>
      <tbody>
        {loading ? <TableSkeleton rows={5} columns={columns.length + (selectable ? 1 : 0)} /> : error ? <tr><td colSpan={columns.length + (selectable ? 1 : 0)}><ErrorState message={error} /></td></tr> : sortedData.length === 0 ? (emptyState === false ? <tr className="ui-table__empty-row"><td colSpan={columns.length + (selectable ? 1 : 0)} aria-label="Không có dữ liệu" /></tr> : <tr><td colSpan={columns.length + (selectable ? 1 : 0)}>{emptyState || <EmptyState />}</td></tr>) : sortedData.map(row => {
          const key = row[rowKey];
          const selected = selectedRowKeys.includes(key);
          return <tr key={key} className={selected ? 'is-selected' : ''}>
            {selectable && <td className="ui-table__select"><input type="checkbox" checked={selected} onChange={() => onSelectionChange?.(selected ? selectedRowKeys.filter(value => value !== key) : [...selectedRowKeys, key])} aria-label={`Chọn dòng ${key}`} /></td>}
            {columns.map(column => <td key={column.key} className={column.className}>{column.render ? column.render(row) : row[column.key]}</td>)}
          </tr>;
        })}
      </tbody>
    </table>
    {children}
  </div>;
}

export function TableActions({ actions = [], overflow = false }) {
  return <div className="ui-table-actions">{actions.slice(0, overflow ? 2 : actions.length).map(action => <button key={action.label} type="button" className={action.danger ? 'is-danger' : ''} onClick={action.onClick} disabled={action.disabled} aria-label={action.label} title={action.label}>{action.icon}</button>)}{overflow && actions.length > 2 && <button type="button" aria-label="Thêm thao tác"><MoreHorizontal /></button>}</div>;
}

export function BulkActions({ actions = [] }) { return <div className="ui-table-bulkbar__actions">{actions.map(action => <button type="button" key={action.label} className={action.danger ? 'is-danger' : ''} onClick={action.onClick}>{action.icon}{action.label}</button>)}</div>; }

export function Pagination({ page = 1, pageSize = 10, total = 0, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50], summaryLabel, className = '' }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const go = next => onPageChange?.(Math.min(pageCount, Math.max(1, next)));
  return <div className={['ui-pagination', className].filter(Boolean).join(' ')}>
    <span className="ui-pagination__summary">{summaryLabel ? (total === 0 ? `${summaryLabel} 0 bản ghi` : `${summaryLabel} ${total} bản ghi`) : (total === 0 ? 'Không có dữ liệu' : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} / ${total}`)}</span>
    <label className="ui-pagination__size">Hiển thị <select value={pageSize} onChange={event => onPageSizeChange?.(Number(event.target.value))}>{pageSizeOptions.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    <div className="ui-pagination__controls"><button type="button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Trang trước"><ChevronLeft /></button><span>{page} / {pageCount}</span><button type="button" onClick={() => go(page + 1)} disabled={page >= pageCount} aria-label="Trang sau"><ChevronRight /></button></div>
  </div>;
}

export function EmptyState({ title = 'Chưa có dữ liệu', description, action, icon }) {
  return <div className="ui-empty-state">{icon || <Inbox aria-hidden="true" />}<strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}

export function ErrorState({ message = 'Không thể tải dữ liệu', onRetry }) {
  return <div className="ui-error-state"><strong>{message}</strong>{onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}</div>;
}

export function TableSkeleton({ rows = 5, columns = 5 }) {
  return Array.from({ length: rows }, (_, row) => <tr key={`skeleton-${row}`} className="ui-table-skeleton">{Array.from({ length: columns }, (_, column) => <td key={column}><span /></td>)}</tr>);
}

export function LoadingOverlay({ loading, children, text = 'Đang tải...' }) {
  return <div className="ui-loading-container">{children}{loading && <div className="ui-loading-overlay"><LoaderCircle className="ui-loading-spinner" /><span>{text}</span></div>}</div>;
}
