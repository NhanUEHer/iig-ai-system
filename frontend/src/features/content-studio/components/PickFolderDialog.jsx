import React, { useEffect, useMemo, useState } from 'react';
import { Folder, Inbox, Plus, Search } from 'lucide-react';
import { Button, Modal } from '../../../design-system-v2';
import { errorMessage, listFolders } from '../../../services/contentStudioService';
import { buildTree, filterFolderTree, folderPathLabel } from '../folderTree';
import CreateFolderDialog from './CreateFolderDialog';
import FolderDialogTree from './FolderDialogTree';
import './FolderDialogs.css';

const STORAGE_KEY = 'content_studio_recent_folders';
const readRecent = () => { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value.slice(0, 3) : []; } catch { return []; } };
const remember = id => { try { if (!id) return; localStorage.setItem(STORAGE_KEY, JSON.stringify([id, ...readRecent().filter(value => value !== id)].slice(0, 3))); } catch { /* Storage may be unavailable. */ } };

export default function PickFolderDialog({ open, title = 'Chọn thư mục lưu học liệu', currentFolderId = null, confirmLabel = 'Chọn', onConfirm, onClose }) {
  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [selectedId, setSelectedId] = useState(currentFolderId || null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [recentIds, setRecentIds] = useState([]);
  const [createParentId, setCreateParentId] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setSelectedId(currentFolderId || null); setQuery(''); setError(''); setRecentIds(readRecent());
    listFolders().then(result => {
      if (!active) return;
      const nextFolders = result.folders || [];
      setFolders(nextFolders); setUnfiledCount(result.unfiledCount || 0); setExpanded(new Set(nextFolders.map(folder => folder.id)));
    }).catch(fetchError => { if (active) setError(errorMessage(fetchError, 'Không thể tải danh sách thư mục.')); });
    return () => { active = false; };
  }, [open, currentFolderId]);

  const tree = useMemo(() => filterFolderTree(buildTree(folders), query), [folders, query]);
  const recents = recentIds.map(id => folders.find(folder => folder.id === id)).filter(Boolean);
  const selectedPath = selectedId ? folderPathLabel(folders, selectedId) : 'Chưa phân loại';
  const currentPath = currentFolderId ? folderPathLabel(folders, currentFolderId) : 'Chưa phân loại';
  const choose = () => { remember(selectedId); onConfirm?.(selectedId || null); onClose?.(); };
  const selectedFolder = folders.find(folder => folder.id === selectedId);

  return <>
    <Modal
      open={open}
      title={title}
      description={`Đang ở: ${currentPath}`}
      onClose={onClose}
      footer={<><div className="cs-pick-folder-dialog__footer-path"><Folder /><span>{selectedPath}</span></div><Button variant="outline" onClick={onClose}>Huỷ</Button><Button onClick={choose}>{confirmLabel}</Button></>}
    >
      <div className="cs-folder-dialog cs-pick-folder-dialog" onKeyDown={event => { if (event.key === 'Enter' && event.target.tagName === 'INPUT') { event.preventDefault(); choose(); } }}>
        <label className="cs-pick-folder-dialog__search"><Search /><input autoFocus aria-label="Tìm thư mục" placeholder="Tìm thư mục…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {recents.length > 0 && <div className="cs-pick-folder-dialog__recent"><span>Gần đây:</span>{recents.map(folder => <button type="button" key={folder.id} onClick={() => setSelectedId(folder.id)}>{folderPathLabel(folders, folder.id)}</button>)}</div>}
        <FolderDialogTree
          nodes={tree}
          selectedId={selectedId}
          expanded={query ? new Set(folders.map(folder => folder.id)) : expanded}
          onToggle={id => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
          onSelect={setSelectedId}
        >
          {!query && <li><button type="button" className={`cs-folder-tree__row${selectedId === null ? ' is-selected' : ''}`} onClick={() => setSelectedId(null)}><span className="cs-folder-tree__toggle" /><Inbox className="cs-folder-tree__icon" /><span className="cs-folder-tree__name">Chưa phân loại</span><span className="cs-folder-tree__count">{unfiledCount} bài</span></button></li>}
          {selectedFolder && !query && <li><button type="button" className="cs-pick-folder-dialog__create" style={{ '--cs-tree-depth': selectedFolder.parentId ? 2 : 1 }} onClick={() => setCreateParentId(selectedFolder.id)}><Plus />Thư mục mới trong {selectedFolder.name}</button></li>}
        </FolderDialogTree>
        {error && <p className="cs-folder-dialog__error" role="alert">{error}</p>}
      </div>
    </Modal>
    <CreateFolderDialog
      open={createParentId !== undefined}
      defaultParentId={createParentId || null}
      onClose={() => setCreateParentId(undefined)}
      onCreated={folder => { setFolders(current => [...current, folder]); setSelectedId(folder.id); setExpanded(current => new Set(current).add(folder.parentId)); setCreateParentId(undefined); }}
    />
  </>;
}
