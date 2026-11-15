import React, { useMemo, useState } from 'react';
import { Folder, FolderOpen, FolderPlus, Inbox, Library, Pencil, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, FormField, IconButton, Input, Modal, Select, Surface, TreeView } from '../../../design-system-v2';
import { createFolder, deleteFolder, errorMessage, updateFolder } from '../../../services/contentStudioService';

import { ALL_FOLDERS, UNFILED, buildTree, flattenFolders } from '../folderTree';

const subtreeCount = node => node.itemCount + node.children.reduce((sum, child) => sum + subtreeCount(child), 0);
const toTreeItems = nodes => nodes.map(node => ({
  id: node.id, label: node.name, count: subtreeCount(node), icon: node.children.length ? <FolderOpen /> : <Folder />,
  children: toTreeItems(node.children),
}));

export default function FolderPanel({ folders, unfiledCount, selected, onSelect, canManage, onChanged, showMsg }) {
  const [dialog, setDialog] = useState(null); // { mode: 'create'|'rename', name, parentId }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const tree = useMemo(() => buildTree(folders), [folders]);
  const total = useMemo(() => folders.reduce((sum, folder) => sum + folder.itemCount, 0) + unfiledCount, [folders, unfiledCount]);
  const items = useMemo(() => [
    { id: ALL_FOLDERS, label: 'Tất cả', icon: <Library />, count: total },
    ...toTreeItems(tree),
    { id: UNFILED, label: 'Chưa phân loại', icon: <Inbox />, count: unfiledCount },
  ], [tree, total, unfiledCount]);
  const current = folders.find(folder => folder.id === selected);
  const options = useMemo(() => flattenFolders(folders), [folders]);
  const blockedParents = useMemo(() => {
    if (dialog?.mode !== 'rename' || !current) return new Set();
    const blocked = new Set([current.id]);
    let grew = true;
    while (grew) { grew = false; for (const folder of folders) if (blocked.has(folder.parentId) && !blocked.has(folder.id)) { blocked.add(folder.id); grew = true; } }
    return blocked;
  }, [dialog, current, folders]);

  const submit = async () => {
    const name = dialog.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (dialog.mode === 'create') {
        const created = await createFolder({ name, parentId: dialog.parentId || null });
        await onChanged(); onSelect(created.id);
      } else {
        await updateFolder(current.id, { name, parentId: dialog.parentId || null });
        await onChanged();
      }
      setDialog(null);
    } catch (error) { showMsg?.(errorMessage(error, 'Không thể lưu thư mục.'), 'error'); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteFolder(current.id);
      setConfirmDelete(false); onSelect(ALL_FOLDERS); await onChanged();
      showMsg?.('Đã xoá thư mục. Học liệu bên trong được chuyển về "Chưa phân loại".', 'success');
    } catch (error) { showMsg?.(errorMessage(error, 'Không thể xoá thư mục.'), 'error'); }
    finally { setBusy(false); }
  };

  return <Surface className="cs-folders" padding="none" aria-label="Thư mục">
    <div className="cs-folders__head">
      <strong>Thư mục</strong>
      {canManage && <IconButton size="sm" variant="ghost" label="Thư mục mới" onClick={() => setDialog({ mode: 'create', name: '', parentId: current?.id || '' })}><FolderPlus /></IconButton>}
    </div>
    <div className="cs-folders__tree"><TreeView items={items} selected={selected} onSelect={onSelect} /></div>
    {canManage && current && <div className="cs-folders__actions">
      <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => setDialog({ mode: 'rename', name: current.name, parentId: current.parentId || '' })}>Sửa</Button>
      <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>Xoá</Button>
    </div>}

    <Modal
      open={Boolean(dialog)}
      size="sm"
      title={dialog?.mode === 'create' ? 'Thư mục mới' : 'Sửa thư mục'}
      onClose={busy ? undefined : () => setDialog(null)}
      footer={<><Button variant="outline" disabled={busy} onClick={() => setDialog(null)}>Huỷ</Button><Button loading={busy} disabled={!dialog?.name.trim()} onClick={submit}>Lưu</Button></>}
    >
      {dialog && <div className="cs-folder-form">
        <FormField label="Tên thư mục" required>
          <Input autoFocus value={dialog.name} maxLength={160} placeholder="VD: TOEIC LR 650+, Unit 3, Lesson 2" onChange={event => setDialog({ ...dialog, name: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') submit(); }} />
        </FormField>
        <FormField label="Thư mục cha">
          <Select value={dialog.parentId} onChange={event => setDialog({ ...dialog, parentId: event.target.value })}>
            <option value="">— Cấp gốc —</option>
            {options.filter(option => !blockedParents.has(option.id)).map(option => <option key={option.id} value={option.id}>{`${'— '.repeat(option.depth)}${option.name}`}</option>)}
          </Select>
        </FormField>
      </div>}
    </Modal>

    <ConfirmDialog
      open={confirmDelete}
      danger
      loading={busy}
      title={`Xoá thư mục "${current?.name || ''}"?`}
      description="Các thư mục con cũng bị xoá. Học liệu bên trong không bị xoá mà chuyển về “Chưa phân loại”."
      confirmLabel="Xoá thư mục"
      onConfirm={remove}
      onClose={() => setConfirmDelete(false)}
    />
  </Surface>;
}
