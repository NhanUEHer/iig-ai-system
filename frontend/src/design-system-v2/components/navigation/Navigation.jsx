import React, { useMemo, useState } from 'react';
import {
  Check, ChevronLeft, ChevronRight, ChevronsUpDown, Clipboard, Command,
  GripVertical, MoreHorizontal, SlidersHorizontal, X,
} from 'lucide-react';
import { Button, EmptyState, ErrorState, IconButton, Menu, SearchInput, Select, Skeleton, Stack } from '../primitives/Primitives';
import './navigation.css';

const cx = (...names) => names.filter(Boolean).join(' ');

export function Badge({ children, tone = 'neutral', dot = false, icon, className = '' }) {
  return <span className={cx('iig3-badge', `is-${tone}`, className)}>{dot && <i />}{icon}{children}</span>;
}

export function StatusBadge({ status, label }) {
  const normalized = String(status || '').toLowerCase();
  const tones = { active: 'success', completed: 'success', healthy: 'success', processing: 'info', draft: 'warning', queued: 'warning', warning: 'warning', failed: 'danger', inactive: 'neutral', disabled: 'neutral' };
  return <Badge tone={tones[normalized] || 'neutral'} dot>{label || status}</Badge>;
}

export function Avatar({ name = '', src, size = 'md', status, className = '' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className={cx('iig3-avatar', `is-${size}`, className)} title={name}>{src ? <img src={src} alt="" /> : initials}{status && <i className={`is-${status}`} />}</span>;
}

export function AvatarGroup({ people = [], max = 3 }) {
  const visible = people.slice(0, max);
  return <span className="iig3-avatar-group">{visible.map(person => <Avatar key={person.name} {...person} size="sm" />)}{people.length > max && <span>+{people.length - max}</span>}</span>;
}

export function UserCell({ name, description, avatar, status }) {
  return <span className="iig3-user-cell"><Avatar name={name} src={avatar} size="sm" status={status} /><span><strong>{name}</strong>{description && <small>{description}</small>}</span></span>;
}

export function Breadcrumb({ items = [], LinkComponent, separator = '/' }) {
  return <nav className="iig3-breadcrumb" aria-label="Breadcrumb"><ol>{items.map((item, index) => {
    const entry = typeof item === 'string' ? { label: item } : item;
    const current = index === items.length - 1;
    let content = <span aria-current={current ? 'page' : undefined}>{entry.label}</span>;
    if (!current && entry.to && LinkComponent) content = <LinkComponent to={entry.to}>{entry.label}</LinkComponent>;
    else if (!current && entry.href) content = <a href={entry.href}>{entry.label}</a>;
    else if (!current && entry.onClick) content = <button type="button" onClick={entry.onClick}>{entry.label}</button>;
    return <li key={entry.key || entry.to || entry.href || entry.label}>{content}{!current && <span className="iig3-breadcrumb__separator" aria-hidden="true">{separator}</span>}</li>;
  })}</ol></nav>;
}

export function Tabs({ items = [], value, onChange, variant = 'underline' }) {
  const move = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange?.(items[next].value);
    event.currentTarget.parentElement.children[next]?.focus();
  };
  return <div className={cx('iig3-tabs', `is-${variant}`)} role="tablist">{items.map((item, index) => <button type="button" role="tab" id={`tab-${item.value}`} aria-controls={`panel-${item.value}`} aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} className={value === item.value ? 'is-active' : ''} key={item.value} onKeyDown={event => move(event, index)} onClick={() => onChange?.(item.value)}>{item.icon}{item.label}{item.count != null && <em>{item.count}</em>}</button>)}</div>;
}

export function PageHeader({ eyebrow, title, description, metadata, actions }) {
  return <header className="iig3-page-header"><div>{eyebrow && <span>{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}{metadata && <aside>{metadata}</aside>}</div>{actions && <nav>{actions}</nav>}</header>;
}

export function StatCard({ label, value, helper, delta, tone = 'neutral', icon, chart }) {
  return <article className={cx('iig3-stat-card', `is-${tone}`)}><header><span>{label}</span>{icon && <i>{icon}</i>}</header><strong>{value}</strong><footer>{delta && <Badge tone={tone === 'danger' ? 'danger' : 'success'}>{delta}</Badge>}{helper && <small>{helper}</small>}</footer>{chart && <div>{chart}</div>}</article>;
}

export function ProgressBar({ value = 0, max = 100, tone = 'accent', label, showValue = true }) {
  const percent = Math.max(0, Math.min(100, max ? value / max * 100 : 0));
  return <div className={cx('iig3-progress', `is-${tone}`)}>{(label || showValue) && <header>{label && <span>{label}</span>}{showValue && <small>{value}/{max}</small>}</header>}<div><i style={{ width: `${percent}%` }} /></div></div>;
}

export function DetailsList({ items = [], columns = 2 }) {
  return <dl className="iig3-details-list" style={{ '--iig3-detail-columns': columns }}>{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd className={item.mono ? 'is-mono' : ''}><span>{item.value ?? '—'}</span>{item.copyable && <button type="button" aria-label={`Copy ${item.label}`} onClick={() => navigator.clipboard?.writeText(String(item.value ?? ''))}><Clipboard /></button>}</dd></div>)}</dl>;
}

export function FilterChip({ label, value, onRemove }) {
  return <span className="iig3-filter-chip"><small>{label}</small><strong>{value}</strong>{onRemove && <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}><X /></button>}</span>;
}

export function FilterBar({ search = '', onSearch, placeholder = 'Tìm kiếm…', searchLabel = 'Tìm kiếm', filters, chips, actions, onClear, clearLabel = 'Xóa tất cả', appliedCount, loading = false }) {
  const chipItems = React.Children.toArray(chips);
  const count = appliedCount ?? chipItems.length;
  return <div className="iig3-filter-bar" aria-busy={loading}><div><SearchInput aria-label={searchLabel} value={search} onChange={onSearch} placeholder={placeholder} disabled={loading} /><Stack direction="horizontal" gap="sm">{filters}</Stack></div>{count > 0 && <div className="iig3-filter-bar__chips" aria-label={`${count} bộ lọc đang áp dụng`}>{chipItems}{onClear && <button type="button" disabled={loading} onClick={onClear}>{clearLabel}</button>}</div>}{actions && <aside>{actions}</aside>}</div>;
}

export function TableToolbar({ title, count, selection = 0, selectedLabel, actions, bulkActions, view, loading = false }) {
  const selectionText = selectedLabel?.(selection) || `Đã chọn ${selection}`;
  return <header className={cx('iig3-table-toolbar', selection > 0 && 'has-selection')} aria-busy={loading}><div><strong>{selection > 0 ? selectionText : title}</strong>{selection === 0 && count != null && <Badge>{count}</Badge>}</div><aside>{selection > 0 ? bulkActions : <>{view}{actions}</>}</aside></header>;
}

const defaultCompare = (left, right, type = 'string') => {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (type === 'number') return Number(left) - Number(right);
  if (type === 'date') return new Date(left).getTime() - new Date(right).getTime();
  return String(left).localeCompare(String(right), 'vi', { numeric: true, sensitivity: 'base' });
};

export function DataTable({
  columns = [], rows = [], rowKey = 'id', getRowId, selected = [], onSelected, onRowClick,
  sort, defaultSort = { key: null, direction: 'asc' }, onSort, manualSort = false,
  loading = false, loadingRows = 5, empty, emptyTitle = 'Chưa có dữ liệu',
  emptyDescription = 'Không có bản ghi phù hợp với điều kiện hiện tại.', emptyIcon, emptyAction,
  error, errorTitle = 'Không thể tải dữ liệu', errorDescription, errorAction,
  density = 'comfortable', getRowActions, renderActions, actionsLabel = 'Thao tác',
  ariaLabel = 'Danh sách dữ liệu', caption, reorderable = false, onReorder,
  isRowReorderable = () => true, reorderLabel = 'Sắp xếp hàng',
  isRowExpanded = () => false, renderExpandedRow,
}) {
  const [internalSort, setInternalSort] = useState(defaultSort);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const activeSort = sort ?? internalSort;
  const identify = row => getRowId?.(row) ?? row[rowKey];
  const hasActions = Boolean(renderActions || getRowActions || rows.some(row => (row.actions || []).length));
  const sortedRows = useMemo(() => {
    if (manualSort || !activeSort?.key) return rows;
    const column = columns.find(item => item.key === activeSort.key);
    if (!column) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = column.sortValue ? column.sortValue(left) : left[column.key];
      const rightValue = column.sortValue ? column.sortValue(right) : right[column.key];
      const result = column.compare ? column.compare(leftValue, rightValue, left, right) : defaultCompare(leftValue, rightValue, column.sortType);
      return result * (activeSort.direction === 'desc' ? -1 : 1);
    });
  }, [activeSort, columns, manualSort, rows]);
  const rowIds = rows.map(identify);
  const allSelected = rowIds.length > 0 && rowIds.every(id => selected.includes(id));
  const toggleAll = () => onSelected?.(allSelected ? selected.filter(id => !rowIds.includes(id)) : [...new Set([...selected, ...rowIds])]);
  const toggle = id => onSelected?.(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  const changeSort = column => {
    if (!column.sortable || loading) return;
    const next = { key: column.key, direction: activeSort?.key === column.key && activeSort.direction === 'asc' ? 'desc' : 'asc' };
    if (sort === undefined) setInternalSort(next);
    onSort?.(next);
  };
  const reorder = (sourceId, targetId) => {
    if (!reorderable || sourceId == null || targetId == null || sourceId === targetId) return;
    const sourceIndex = sortedRows.findIndex(row => identify(row) === sourceId);
    const targetIndex = sortedRows.findIndex(row => identify(row) === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const ordered = [...sortedRows];
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    onReorder?.({ sourceId, targetId, sourceIndex, targetIndex, orderedRows: ordered, orderedIds: ordered.map(identify) });
  };
  const moveWithKeyboard = (event, rowIndex, id) => {
    const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? sortedRows.length - 1 : rowIndex + (event.key === 'ArrowUp' ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= sortedRows.length) return;
    reorder(id, identify(sortedRows[targetIndex]));
  };
  const stopDragging = () => { setDraggingId(null); setDropTargetId(null); };
  const columnCount = columns.length + (reorderable ? 1 : 0) + (onSelected ? 1 : 0) + (hasActions ? 1 : 0);
  return <div className={cx('iig3-data-table', `is-${density}`, reorderable && 'is-reorderable')} aria-busy={loading}><table aria-label={ariaLabel}>{caption && <caption>{caption}</caption>}<thead><tr>{reorderable && <th className="is-reorder"><span className="iig3-sr-only">{reorderLabel}</span></th>}{onSelected && <th className="is-select"><label><input type="checkbox" aria-label="Chọn tất cả hàng" checked={allSelected} disabled={loading || rows.length === 0} onChange={toggleAll} /><i>{allSelected && <Check />}</i></label></th>}{columns.map(column => <th key={column.key} aria-sort={activeSort?.key === column.key ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : column.sortable ? 'none' : undefined} className={column.align ? `is-${column.align}` : ''} style={column.width ? { width: column.width } : undefined}><button type="button" disabled={!column.sortable || loading} onClick={() => changeSort(column)}>{column.label}{column.sortable && <ChevronsUpDown aria-hidden="true" />}</button></th>)}{hasActions && <th className="is-actions"><span className="iig3-sr-only">{actionsLabel}</span></th>}</tr></thead><tbody>{loading ? Array.from({ length: loadingRows }, (_, rowIndex) => <tr className="is-loading" key={rowIndex}>{reorderable && <td className="is-reorder"><Skeleton lines={1} /></td>}{onSelected && <td className="is-select"><Skeleton lines={1} /></td>}{columns.map((column, columnIndex) => <td key={column.key || columnIndex}><Skeleton lines={1} /></td>)}{hasActions && <td className="is-actions"><Skeleton lines={1} /></td>}</tr>) : !error && sortedRows.map((row, rowIndex) => {
    const id = identify(row); const actions = getRowActions?.(row) ?? row.actions ?? [];
    const canReorder = reorderable && !loading && isRowReorderable(row, rowIndex);
    const expanded = Boolean(renderExpandedRow && isRowExpanded(row, rowIndex));
    return <React.Fragment key={id}><tr tabIndex={onRowClick ? 0 : undefined} aria-expanded={renderExpandedRow ? expanded : undefined} className={cx(selected.includes(id) && 'is-selected', expanded && 'is-expanded', draggingId === id && 'is-dragging', dropTargetId === id && draggingId !== id && 'is-drop-target', canReorder && 'can-reorder')} onDragEnter={() => { if (draggingId != null && canReorder) setDropTargetId(id); }} onDragOver={event => { if (draggingId != null && canReorder) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => { event.preventDefault(); if (canReorder) reorder(draggingId, id); stopDragging(); }} onKeyDown={event => { if (event.target === event.currentTarget && onRowClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onRowClick(row); } }} onClick={() => onRowClick?.(row)}>{reorderable && <td className="is-reorder" onClick={event => event.stopPropagation()}><button type="button" draggable={canReorder} disabled={!canReorder} aria-label={`${reorderLabel}: ${id}`} title="Kéo hoặc dùng phím mũi tên để thay đổi thứ tự" onDragStart={event => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(id)); setDraggingId(id); setDropTargetId(id); }} onDragEnd={stopDragging} onKeyDown={event => moveWithKeyboard(event, rowIndex, id)}><GripVertical aria-hidden="true" /></button></td>}{onSelected && <td className="is-select" onClick={event => event.stopPropagation()}><label><input type="checkbox" aria-label={`Chọn hàng ${id}`} checked={selected.includes(id)} onChange={() => toggle(id)} /><i>{selected.includes(id) && <Check />}</i></label></td>}{columns.map(column => <td key={column.key} className={column.align ? `is-${column.align}` : ''}>{column.render ? column.render(row, rowIndex) : row[column.key]}</td>)}{hasActions && <td className="is-actions" onClick={event => event.stopPropagation()}>{renderActions ? renderActions(row) : actions.length > 0 ? <Menu trigger={<IconButton size="sm" label={`${actionsLabel}: ${id}`}><MoreHorizontal /></IconButton>} items={actions} /> : null}</td>}</tr>{expanded && <tr className="iig3-data-table__expanded"><td colSpan={columnCount}>{renderExpandedRow(row, rowIndex)}</td></tr>}</React.Fragment>;
  })}</tbody></table>{!loading && error && <div className="iig3-table-empty"><ErrorState title={errorTitle} description={errorDescription || (typeof error === 'string' ? error : undefined)} action={errorAction} /></div>}{!loading && !error && rows.length === 0 && <div className="iig3-table-empty">{empty || <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />}</div>}{loading && <span className="iig3-sr-only" role="status">Đang tải dữ liệu</span>}<span className="iig3-sr-only">{columnCount} cột</span></div>;
}

export function ReorderableDataTable(props) {
  return <DataTable {...props} reorderable />;
}

export function Pagination({ page = 1, pageCount = 1, pageSize = 10, pageSizeOptions = [10, 25, 50], total = 0, onPage, onPageSize, loading = false, hideWhenEmpty = true, showPageSize = true, rangeLabel, pageSizeLabel = 'Số hàng mỗi trang', previousLabel = 'Trang trước', nextLabel = 'Trang sau' }) {
  if (hideWhenEmpty && total === 0 && !loading) return null;
  const safePageCount = Math.max(1, pageCount); const safePage = Math.min(Math.max(1, page), safePageCount);
  const from = total ? (safePage - 1) * pageSize + 1 : 0; const to = Math.min(safePage * pageSize, total);
  const visibleRange = rangeLabel?.({ from, to, total }) || `${from}–${to} / ${total}`;
  return <footer className="iig3-pagination" aria-busy={loading}><span>{visibleRange}</span><div>{showPageSize && <label>{pageSizeLabel}<Select aria-label={pageSizeLabel} value={pageSize} disabled={loading} onChange={event => onPageSize?.(Number(event.target.value))}>{pageSizeOptions.map(option => <option value={option} key={option}>{option}</option>)}</Select></label>}<small>Trang {safePage} / {safePageCount}</small><IconButton size="sm" label={previousLabel} disabled={loading || safePage <= 1} onClick={() => onPage?.(safePage - 1)}><ChevronLeft /></IconButton><IconButton size="sm" label={nextLabel} disabled={loading || safePage >= safePageCount} onClick={() => onPage?.(safePage + 1)}><ChevronRight /></IconButton></div></footer>;
}

export function DataView({ title, count, toolbar, children, pagination }) {
  return <section className="iig3-data-view">{title && <header><strong>{title}</strong>{count != null && <Badge>{count}</Badge>}</header>}{toolbar}{children}{pagination}</section>;
}

export function ColumnButton({ onClick }) { return <Button variant="outline" icon={<SlidersHorizontal />} onClick={onClick}>Columns</Button>; }
export function ShortcutHint({ children = '⌘ K' }) { return <kbd className="iig3-shortcut"><Command />{children}</kbd>; }
