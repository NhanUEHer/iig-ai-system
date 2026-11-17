import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Folder, Plus } from 'lucide-react';
import { Button, Input, Modal } from '../../../design-system-v2';
import { createFolder, errorMessage, listFolders } from '../../../services/contentStudioService';
import { buildTree, folderPathLabel } from '../folderTree';
import FolderDialogTree from './FolderDialogTree';
import './FolderDialogs.css';

const allExpanded = folders => new Set(folders.map(folder => folder.id));

export default function CreateFolderDialog({ open, defaultParentId = null, onCreated, onClose }) {
  const [folders, setFolders] = useState([]);
  const [name, setName] = useState('');
  const [location, setLocation] = useState(defaultParentId ? 'nested' : 'root');
  const [parentId, setParentId] = useState(defaultParentId || null);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setName(''); setError(''); setLocation(defaultParentId ? 'nested' : 'root'); setParentId(defaultParentId || null);
    listFolders().then(result => {
      if (!active) return;
      setFolders(result.folders || []);
      setExpanded(allExpanded(result.folders || []));
    }).catch(fetchError => { if (active) setError(errorMessage(fetchError, 'Không thể tải danh sách thư mục.')); });
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector('input')?.focus());
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [open, defaultParentId]);

  const tree = useMemo(() => buildTree(folders), [folders]);
  const trimmedName = name.trim();
  const validation = !trimmedName ? 'Vui lòng nhập tên thư mục.' : name.length > 160 ? 'Tên thư mục tối đa 160 ký tự.' : '';
  const effectiveParent = location === 'nested' ? parentId : null;
  const parentPath = effectiveParent ? folderPathLabel(folders, effectiveParent, '') : '';

  const submit = async () => {
    if (loading || validation || (location === 'nested' && !parentId)) return;
    setLoading(true); setError('');
    try {
      const folder = await createFolder({ name: trimmedName, parentId: effectiveParent });
      onCreated?.(folder);
      onClose?.();
    } catch (submitError) { setError(errorMessage(submitError, 'Không thể tạo thư mục.')); }
    finally { setLoading(false); }
  };

  return <Modal
    open={open}
    title={<span className="cs-create-folder-dialog__title"><i><Folder /></i><span><strong>Tạo thư mục mới</strong><small>Tổ chức học liệu theo Khoá › Unit › Lesson</small></span></span>}
    onClose={loading ? undefined : onClose}
    footer={<><Button variant="outline" disabled={loading} onClick={onClose}>Huỷ</Button><Button icon={<Plus />} loading={loading} disabled={Boolean(validation) || (location === 'nested' && !parentId)} onClick={submit}>Tạo thư mục</Button></>}
  >
    <div ref={dialogRef} className="cs-folder-dialog cs-create-folder-dialog" onKeyDown={event => { if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') { event.preventDefault(); submit(); } }}>
      <label className="cs-folder-dialog__field">
        <strong>Tên thư mục</strong>
        <Input value={name} maxLength={161} invalid={Boolean(error || (name && validation))} onChange={event => { setName(event.target.value); setError(''); }} />
        <small>VD: TOEIC LR 650+, Unit 3, Lesson 2 · tối đa 160 ký tự</small>
      </label>
      <fieldset className="cs-folder-dialog__location">
        <legend>Nằm trong</legend>
        <div>
          <label className={location === 'root' ? 'is-selected' : ''}><input type="radio" name="cs-folder-location" checked={location === 'root'} onChange={() => setLocation('root')} /> Cấp gốc (khoá học mới)</label>
          <label className={location === 'nested' ? 'is-selected' : ''}><input type="radio" name="cs-folder-location" checked={location === 'nested'} onChange={() => setLocation('nested')} /> Trong thư mục khác</label>
        </div>
      </fieldset>
      {location === 'nested' && <FolderDialogTree
        nodes={tree}
        selectedId={parentId}
        expanded={expanded}
        onToggle={id => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
        onSelect={setParentId}
      />}
      {(error || (name && validation)) && <p className="cs-folder-dialog__error" role="alert">{error || validation}</p>}
      <div className="cs-folder-dialog__preview"><Folder /> <span>Sẽ tạo: {parentPath && `${parentPath} › `}<strong>{trimmedName || 'Tên thư mục'}</strong></span></div>
    </div>
  </Modal>;
}
