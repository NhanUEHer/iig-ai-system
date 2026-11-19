import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, Inbox, Search } from 'lucide-react';
import { Button, Modal } from '../../../design-system-v2';
import { buildTree, descendantIds, filterFolderTree, folderPathLabel } from '../../../utils/folderTree';
import './SecureLectureDialogs.css';

function FolderRows({ nodes, selectedId, expanded, onSelect, onToggle, depth = 0, excluded = new Set() }) {
  return nodes.map(node => {
    if (excluded.has(node.id)) return null;
    const hasChildren = node.children?.some(child => !excluded.has(child.id));
    const open = expanded.has(node.id);
    return <React.Fragment key={node.id}>
      <button type="button" className={`sl-picker-row${selectedId === node.id ? ' is-selected' : ''}`} style={{ '--sl-depth': depth }} onClick={() => onSelect(node.id)}>
        <span className="sl-picker-toggle" onClick={event => { event.stopPropagation(); if (hasChildren) onToggle(node.id); }}>{hasChildren ? (open ? <ChevronDown /> : <ChevronRight />) : null}</span>
        <Folder /><span>{node.name}</span><small>{node.lectureCount || 0}</small>
      </button>
      {hasChildren && open && <FolderRows nodes={node.children} selectedId={selectedId} expanded={expanded} onSelect={onSelect} onToggle={onToggle} depth={depth + 1} excluded={excluded} />}
    </React.Fragment>;
  });
}

export function FolderPickerDialog({ open, folders, currentId = null, excludeId = null, title = 'Chọn thư mục', confirmLabel = 'Chọn', onConfirm, onClose }) {
  const [selectedId, setSelectedId] = useState(currentId);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  useEffect(() => {
    if (!open) return;
    setSelectedId(currentId || null);
    setQuery('');
    setExpanded(new Set(folders.map(folder => folder.id)));
  }, [open, currentId, folders]);
  const tree = useMemo(() => filterFolderTree(buildTree(folders), query), [folders, query]);
  const excluded = useMemo(() => {
    if (!excludeId) return new Set();
    return new Set([excludeId, ...descendantIds(folders, excludeId)]);
  }, [excludeId, folders]);
  const label = selectedId ? folderPathLabel(folders, selectedId) : 'Chưa phân loại';
  const toggle = id => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <Modal open={open} title={title} size="sm" onClose={onClose} footer={<><span className="sl-picker-path"><Folder />{label}</span><Button variant="outline" onClick={onClose}>Huỷ</Button><Button onClick={() => onConfirm(selectedId)}>{confirmLabel}</Button></>}>
    <div className="sl-dialog-body sl-folder-picker">
      <label className="sl-dialog-search"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm thư mục…" /></label>
      <div className="sl-picker-tree">
        <button type="button" className={`sl-picker-row${selectedId === null ? ' is-selected' : ''}`} onClick={() => setSelectedId(null)}><span className="sl-picker-toggle" /><Inbox /><span>Chưa phân loại</span></button>
        <FolderRows nodes={tree} selectedId={selectedId} expanded={expanded} excluded={excluded} onSelect={setSelectedId} onToggle={toggle} />
      </div>
    </div>
  </Modal>;
}

export function FolderNameDialog({ open, mode = 'create', folder, parentLabel, busy, onSubmit, onClose }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(mode === 'rename' ? folder?.name || '' : ''); }, [open, mode, folder]);
  const submit = event => { event.preventDefault(); if (name.trim()) onSubmit(name.trim()); };
  const title = mode === 'rename' ? 'Đổi tên thư mục' : 'Tạo thư mục mới';
  return <Modal open={open} title={title} size="sm" onClose={onClose} footer={<><Button variant="outline" disabled={busy} onClick={onClose}>Huỷ</Button><Button loading={busy} disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>{mode === 'rename' ? 'Lưu thay đổi' : 'Tạo thư mục'}</Button></>}>
    <form className="sl-dialog-body" onSubmit={submit}>
      <label className="sl-dialog-field"><span>Tên thư mục</span><input autoFocus maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ví dụ: TOEIC LR 450+" /></label>
      <p className="sl-dialog-hint">Vị trí: <strong>{parentLabel || 'Thư mục gốc'}</strong></p>
    </form>
  </Modal>;
}
