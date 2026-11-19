import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ChevronDown, ChevronRight, FileClock, FileCode2, Folder, FolderInput,
  FolderPlus, Inbox, Link2, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, Upload,
} from 'lucide-react';
import {
  Badge, Button, CodeText, ConfirmDialog, DataTable, FilterBar, ListPage, Select, TableToolbar,
} from '../../../design-system-v2';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import {
  archiveSecureLecture, createSecureLectureFolder, deleteSecureLectureFolder,
  listSecureLectureFolders, listSecureLectures,
  listSecureLectureVersions, moveSecureLectures, secureLectureError, updateSecureLectureFolder,
} from '../../../services/secureLecturesApi';
import { buildFolderPath, buildTree, folderPathLabel, subtreeItemCount } from '../../../utils/folderTree';
import { FolderNameDialog, FolderPickerDialog } from '../components/FolderDialogs';
import ShareCreatedDialog from '../components/ShareCreatedDialog';
import ShareDialog from '../components/ShareDialog';
import UploadDialog from '../components/UploadDialog';
import './LibraryPage.css';

const formatSize = value => value < 1024 * 1024 ? `${Math.ceil(Number(value || 0) / 1024)} KB` : `${(Number(value || 0) / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
const relativeDate = value => {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'Vừa xong';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ trước`;
  if (diff < 172_800_000) return 'Hôm qua';
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} ngày trước`;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
};

function LectureStatus({ lecture }) {
  const primary = lecture.activeShareCount > 0 ? <Badge tone="success" dot>Đang chia sẻ</Badge>
    : lecture.shareStatusSummary?.expired > 0 ? <Badge tone="warning" dot>Đã hết hạn</Badge>
      : lecture.shareStatusSummary?.revoked > 0 ? <Badge dot>Không còn link</Badge>
        : <Badge dot>Chưa chia sẻ</Badge>;
  return <span className="sl-status-badges">{primary}{lecture.expiringShareCount > 0 && <Badge tone="warning">Sắp hết hạn</Badge>}{lecture.attention && <Badge tone="danger">Cần chú ý</Badge>}</span>;
}

function FolderNode({ node, depth, selectedId, expanded, canManage, menuId, onToggle, onSelect, onMenu, onAction, onLectureDrop }) {
  const hasChildren = Boolean(node.children?.length);
  const open = expanded.has(node.id);
  return <>
    <div className={`sl-tree-row${selectedId === node.id ? ' is-selected' : ''}`} style={{ '--sl-tree-depth': depth }} onDragOver={event => { if (canManage) event.preventDefault(); }} onDrop={event => { event.preventDefault(); onLectureDrop(event, node.id); }}>
      <button type="button" className="sl-tree-main" onClick={() => onSelect(node.id)}>
        <span className="sl-tree-toggle" onClick={event => { event.stopPropagation(); if (hasChildren) onToggle(node.id); }}>{hasChildren ? (open ? <ChevronDown /> : <ChevronRight />) : null}</span>
        <Folder /><span>{node.name}</span><small>{subtreeItemCount(node)}</small>
      </button>
      {canManage && <div className="sl-row-menu"><button type="button" aria-label={`Tác vụ thư mục ${node.name}`} onClick={() => onMenu(menuId === node.id ? null : node.id)}><MoreHorizontal /></button>{menuId === node.id && <div className="sl-popover">
        <button type="button" onClick={() => onAction('create-child', node)}><FolderPlus />Tạo thư mục con</button>
        <button type="button" onClick={() => onAction('rename', node)}><Pencil />Đổi tên</button>
        <button type="button" onClick={() => onAction('move-folder', node)}><FolderInput />Di chuyển</button>
        <button type="button" className="is-danger" onClick={() => onAction('delete-folder', node)}><Trash2 />Xoá</button>
      </div>}</div>}
    </div>
    {hasChildren && open && node.children.map(child => <FolderNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} expanded={expanded} canManage={canManage} menuId={menuId} onToggle={onToggle} onSelect={onSelect} onMenu={onMenu} onAction={onAction} onLectureDrop={onLectureDrop} />)}
  </>;
}

export default function LibraryPage({ currentUser, showMsg }) {
  const navigate = useNavigate();
  const { folderId: routeFolderId } = useParams();
  const folderId = routeFolderId || 'all';
  const canManage = currentUser?.permissions?.includes('secure_lectures.manage');
  const canShare = currentUser?.permissions?.includes('secure_lectures.share');
  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [lectures, setLectures] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('updated_desc');
  const [expanded, setExpanded] = useState(new Set());
  const [menuId, setMenuId] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null);
  const [folderPicker, setFolderPicker] = useState(null);
  const [uploadState, setUploadState] = useState(null);
  const [shareState, setShareState] = useState(null);
  const [createdShare, setCreatedShare] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const dropRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { folderId, q: debouncedQuery || undefined, status: status || undefined, sort, limit: 50 };
      const [folderResult, lectureResult] = await Promise.all([
        listSecureLectureFolders(), listSecureLectures(params),
      ]);
      setFolders(folderResult.folders || []); setUnfiledCount(folderResult.unfiledCount || 0);
      setLectures(lectureResult.items || []); setNextCursor(lectureResult.nextCursor || null);
      setExpanded(current => current.size ? current : new Set((folderResult.folders || []).filter(item => !item.parentId).map(item => item.id)));
    } catch (requestError) { setError(secureLectureError(requestError, 'Không thể tải thư viện bài giảng.')); }
    finally { setLoading(false); }
  }, [folderId, debouncedQuery, status, sort]);
  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => { setMenuId(null); }, [folderId]);

  const tree = useMemo(() => buildTree(folders), [folders]);
  const folderPath = useMemo(() => buildFolderPath(folders, folderId), [folders, folderId]);
  const allLectureCount = folders.reduce((sum, folder) => sum + Number(folder.lectureCount || 0), Number(unfiledCount || 0));
  const selectedLabel = folderId === 'all' ? 'mọi thư mục' : folderId === 'unfiled' ? 'Chưa phân loại' : folderPathLabel(folders, folderId);

  const mutate = async (work, success) => {
    setBusy(true);
    try { await work(); showMsg?.(success, 'success'); setReloadKey(value => value + 1); return true; }
    catch (requestError) { showMsg?.(secureLectureError(requestError), 'error'); return false; }
    finally { setBusy(false); }
  };

  const handleFolderAction = (action, folder) => {
    setMenuId(null);
    if (action === 'create-child') setFolderDialog({ mode: 'create', parentId: folder.id, parentLabel: folderPathLabel(folders, folder.id) });
    if (action === 'rename') setFolderDialog({ mode: 'rename', folder, parentLabel: folder.parentId ? folderPathLabel(folders, folder.parentId) : 'Thư mục gốc' });
    if (action === 'move-folder') setFolderPicker({ type: 'folder', folder });
    if (action === 'delete-folder') setConfirm({ type: 'folder', item: folder });
  };

  const submitFolder = async name => {
    const dialog = folderDialog;
    const success = await mutate(
      () => dialog.mode === 'rename' ? updateSecureLectureFolder(dialog.folder.id, { name }) : createSecureLectureFolder({ name, parentId: dialog.parentId || null }),
      dialog.mode === 'rename' ? 'Đã đổi tên thư mục.' : 'Đã tạo thư mục.',
    );
    if (success) setFolderDialog(null);
  };

  const confirmAction = async () => {
    if (confirm.type === 'folder') {
      const deletedId = confirm.item.id;
      const success = await mutate(() => deleteSecureLectureFolder(deletedId), 'Đã xoá thư mục; bài giảng được chuyển về Chưa phân loại.');
      if (success && folderId === deletedId) navigate('/secure-lectures/folders/unfiled');
    } else await mutate(() => archiveSecureLecture(confirm.item.id), 'Đã lưu trữ bài giảng.');
    setConfirm(null);
  };

  const moveLecture = async (lecture, targetId) => {
    const success = await mutate(() => moveSecureLectures([lecture.id], targetId), 'Đã di chuyển bài giảng.');
    if (success) setFolderPicker(null);
  };
  const readDraggedLecture = event => lectures.find(item => item.id === event.dataTransfer.getData('application/x-secure-lecture-id'));
  const dropLecture = (event, targetId) => { const lecture = readDraggedLecture(event); if (lecture) moveLecture(lecture, targetId); };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const result = await listSecureLectures({ folderId, q: debouncedQuery || undefined, status: status || undefined, sort, limit: 50, cursor: nextCursor });
      setLectures(current => [...current, ...(result.items || [])]); setNextCursor(result.nextCursor || null);
    } catch (requestError) { showMsg?.(secureLectureError(requestError), 'error'); }
    finally { setLoadingMore(false); }
  };

  const openDroppedFile = event => {
    event.preventDefault(); dropRef.current?.classList.remove('is-file-over');
    if (!canManage) return;
    const file = [...(event.dataTransfer.files || [])].find(item => /\.html?$/i.test(item.name));
    if (file) setUploadState({ file, folderId: ['all', 'unfiled'].includes(folderId) ? null : folderId });
    else if (event.dataTransfer.files?.length) showMsg?.('Chỉ chấp nhận file .html.', 'error');
  };

  const openShareDialog = async lecture => {
    setBusy(true);
    try { setShareState({ lecture, versions: await listSecureLectureVersions(lecture.id) || [] }); }
    catch (requestError) { showMsg?.(secureLectureError(requestError, 'Không thể tải phiên bản bài giảng.'), 'error'); }
    finally { setBusy(false); }
  };

  const uploadTarget = ['all', 'unfiled'].includes(folderId) ? null : folderId;
  const filtered = Boolean(debouncedQuery || status);
  const clearFilters = () => { setQuery(''); setStatus(''); };
  const breadcrumb = [
    { label: 'Tạo & phát triển' },
    { label: 'Bài giảng bảo mật', to: folderId === 'all' ? undefined : '/secure-lectures' },
    ...(folderId === 'unfiled' ? [{ label: 'Chưa phân loại' }]
      : folderId !== 'all' ? folderPath.map((folder, index) => ({ label: folder.name, to: index === folderPath.length - 1 ? undefined : `/secure-lectures/folders/${folder.id}` })) : []),
  ];
  const listTitle = folderId === 'all' ? 'Tất cả bài giảng' : folderId === 'unfiled' ? 'Chưa phân loại' : (folderPath[folderPath.length - 1]?.name || 'Thư mục');

  const columns = [
    { key: 'title', label: 'Bài giảng', sortable: true, render: lecture => <div className="sl-cell-title"><span className="sl-file-icon"><FileCode2 /></span><span><strong>{lecture.title}</strong><CodeText>{lecture.currentVersion?.originalFilename || 'Chưa có file'}{lecture.currentVersion ? ` · ${formatSize(lecture.currentVersion.size)}` : ''}{lecture.currentVersion?.meta?.hasAudio ? ' · có audio' : ''}</CodeText></span></div> },
    { key: 'version', label: 'Phiên bản', align: 'center', width: 110, render: lecture => lecture.currentVersion ? <Badge tone="info">v{lecture.currentVersion.versionNo}</Badge> : '—' },
    { key: 'activeShareCount', label: 'Link', align: 'center', width: 110, sortable: true, sortType: 'number', render: lecture => lecture.activeShareCount ? `${lecture.activeShareCount} hoạt động` : '—' },
    { key: 'status', label: 'Trạng thái', width: 220, render: lecture => <LectureStatus lecture={lecture} /> },
    { key: 'updatedAt', label: 'Cập nhật', width: 170, sortable: true, sortType: 'date', render: lecture => <span className="sl-cell-updated"><span>{relativeDate(lecture.updatedAt)}</span>{lecture.updatedBy?.name && <small>{lecture.updatedBy.name}</small>}</span> },
  ];
  const rowActions = lecture => [
    { label: 'Mở chi tiết', icon: <FileCode2 />, onClick: () => navigate(`/secure-lectures/lectures/${lecture.id}`) },
    ...(canShare ? [{ label: 'Tạo link chia sẻ', icon: <Link2 />, disabled: busy, onClick: () => openShareDialog(lecture) }] : []),
    ...(canManage ? [
      { label: 'Di chuyển', icon: <FolderInput />, onClick: () => setFolderPicker({ type: 'lecture', lecture }) },
      { separator: true },
      { label: 'Lưu trữ', icon: <Archive />, danger: true, onClick: () => setConfirm({ type: 'lecture', item: lecture }) },
    ] : []),
  ];

  const folderPanel = <aside className="sl-tree-panel" aria-label="Thư mục">
    <header className="sl-tree-head"><strong>Thư mục</strong>{canManage && <button type="button" className="sl-tree-add" aria-label="Thư mục mới" title="Thư mục mới" onClick={() => setFolderDialog({ mode: 'create', parentId: null, parentLabel: 'Thư mục gốc' })}><Plus /></button>}</header>
    <button type="button" className={`sl-tree-special${folderId === 'all' ? ' is-selected' : ''}`} onClick={() => navigate('/secure-lectures')}><Inbox /><span>Tất cả bài giảng</span><small>{allLectureCount}</small></button>
    {tree.map(node => <FolderNode key={node.id} node={node} depth={0} selectedId={folderId} expanded={expanded} canManage={canManage} menuId={menuId} onMenu={setMenuId} onSelect={id => navigate(`/secure-lectures/folders/${id}`)} onToggle={id => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onAction={handleFolderAction} onLectureDrop={dropLecture} />)}
    <button type="button" className={`sl-tree-special is-unfiled${folderId === 'unfiled' ? ' is-selected' : ''}`} onClick={() => navigate('/secure-lectures/folders/unfiled')} onDragOver={event => { if (canManage) event.preventDefault(); }} onDrop={event => { event.preventDefault(); dropLecture(event, null); }}><Inbox /><span>Chưa phân loại</span><small>{unfiledCount}</small></button>
  </aside>;

  const listPanel = <div className="sl-list-panel">
    <TableToolbar title={listTitle} count={lectures.length} loading={loading} />
    <FilterBar
      search={query}
      onSearch={event => setQuery(event.target.value)}
      placeholder={`Tìm bài giảng trong ${folderId === 'all' ? 'mọi thư mục' : selectedLabel}…`}
      filters={<>
        <Select aria-label="Lọc trạng thái link" value={status} onChange={event => setStatus(event.target.value)}><option value="">Mọi trạng thái link</option><option value="shared">Đang chia sẻ</option><option value="expiring">Sắp hết hạn</option><option value="unshared">Chưa chia sẻ</option><option value="attention">Cần chú ý</option></Select>
        <Select aria-label="Sắp xếp" value={sort} onChange={event => setSort(event.target.value)}><option value="updated_desc">Cập nhật gần nhất</option><option value="updated_asc">Cập nhật cũ nhất</option><option value="title_asc">Tên A–Z</option><option value="title_desc">Tên Z–A</option></Select>
      </>}
      appliedCount={status ? 1 : 0}
      onClear={clearFilters}
      loading={loading}
    />
    <div ref={dropRef} className="sl-table-drop" onDragOver={event => { if (canManage && event.dataTransfer.types.includes('Files')) { event.preventDefault(); dropRef.current?.classList.add('is-file-over'); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) dropRef.current?.classList.remove('is-file-over'); }} onDrop={openDroppedFile}>
      <DataTable
        ariaLabel="Danh sách bài giảng"
        columns={columns}
        rows={lectures}
        rowKey="id"
        loading={loading}
        error={error || undefined}
        errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={load}>Thử lại</Button>}
        emptyIcon={<FileCode2 />}
        emptyTitle={filtered ? 'Không tìm thấy bài giảng' : 'Chưa có bài giảng'}
        emptyDescription={filtered ? 'Hãy đổi từ khoá hoặc bộ lọc.' : 'Upload file HTML đầu tiên để bắt đầu quản lý và chia sẻ an toàn.'}
        emptyAction={filtered ? <Button variant="outline" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button> : canManage ? <Button size="sm" icon={<Upload />} onClick={() => setUploadState({ folderId: uploadTarget })}>Upload bài giảng</Button> : null}
        onRowClick={lecture => navigate(`/secure-lectures/lectures/${lecture.id}`)}
        getRowActions={rowActions}
      />
      <div className="sl-file-drop-overlay"><Upload /><strong>Thả file HTML để upload vào {selectedLabel}</strong></div>
    </div>
    {nextCursor && <footer className="sl-load-more"><Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>Tải thêm</Button></footer>}
  </div>;

  return <div className="iig3-list-screen sl-library-page">
    <ListPage
      breadcrumb={breadcrumb}
      breadcrumbLinkComponent={Link}
      title="Bài giảng bảo mật"
      actions={<>
        <Button variant="outline" size="sm" icon={<FileClock />} onClick={() => navigate('/secure-lectures/logs')}>Nhật ký truy cập</Button>
        {canManage && <Button variant="outline" size="sm" icon={<FolderPlus />} onClick={() => setFolderDialog({ mode: 'create', parentId: uploadTarget, parentLabel: selectedLabel })}>Thư mục mới</Button>}
        {canManage && <Button size="sm" icon={<Upload />} onClick={() => setUploadState({ folderId: uploadTarget })}>Upload bài giảng</Button>}
      </>}
      table={<div className="sl-library-layout">{listPanel}{folderPanel}</div>}
    />

    <FolderNameDialog open={Boolean(folderDialog)} mode={folderDialog?.mode} folder={folderDialog?.folder} parentLabel={folderDialog?.parentLabel} busy={busy} onSubmit={submitFolder} onClose={() => !busy && setFolderDialog(null)} />
    <FolderPickerDialog open={Boolean(folderPicker)} folders={folders} currentId={folderPicker?.type === 'lecture' ? folderPicker.lecture.folderId : folderPicker?.folder?.parentId} excludeId={folderPicker?.type === 'folder' ? folderPicker.folder.id : null} title={folderPicker?.type === 'folder' ? 'Di chuyển thư mục' : 'Di chuyển bài giảng'} confirmLabel="Di chuyển" onClose={() => setFolderPicker(null)} onConfirm={async targetId => {
      if (folderPicker.type === 'lecture') return moveLecture(folderPicker.lecture, targetId);
      const success = await mutate(() => updateSecureLectureFolder(folderPicker.folder.id, { parentId: targetId }), 'Đã di chuyển thư mục.'); if (success) setFolderPicker(null);
    }} />
    <UploadDialog open={Boolean(uploadState)} initialFile={uploadState?.file} initialFolderId={uploadState?.folderId} folders={folders} showMsg={showMsg} onClose={() => setUploadState(null)} onUploaded={() => setReloadKey(value => value + 1)} />
    <ShareDialog open={Boolean(shareState)} lecture={shareState?.lecture} versions={shareState?.versions || []} showMsg={showMsg} onClose={() => setShareState(null)} onCreated={result => { setShareState(null); setCreatedShare(result); setReloadKey(value => value + 1); }} />
    <ShareCreatedDialog result={createdShare} showMsg={showMsg} onClose={() => setCreatedShare(null)} />
    <ConfirmDialog open={Boolean(confirm)} danger loading={busy} title={confirm?.type === 'folder' ? `Xoá thư mục “${confirm?.item?.name || ''}”?` : `Lưu trữ “${confirm?.item?.title || ''}”?`} description={confirm?.type === 'folder' ? 'Cây thư mục con sẽ bị xoá; toàn bộ bài giảng bên trong được chuyển về Chưa phân loại.' : 'Bài giảng sẽ không còn xuất hiện trong thư viện và các link chia sẻ sẽ ngừng hoạt động.'} confirmLabel={confirm?.type === 'folder' ? 'Xoá thư mục' : 'Lưu trữ'} onConfirm={confirmAction} onClose={() => !busy && setConfirm(null)} />
  </div>;
}
