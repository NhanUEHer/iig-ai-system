import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, FolderPlus, List, MoreHorizontal,
  Plus, Search, Trash2, FolderInput,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, ConfirmDialog, Skeleton } from '../../../design-system-v2';
import {
  deleteItem, errorMessage, listFolders, listItems, updateItem,
} from '../../../services/contentStudioService';
import { buildFolderPath, buildTree, subtreeItemCount } from '../folderTree';
import CreateFolderDialog from '../components/CreateFolderDialog';
import PickFolderDialog from '../components/PickFolderDialog';
import './StudioFolderPage.css';

const STATUS_META = {
  ready: { className: 'is-ready', label: 'Xong' },
  waiting_review: { className: 'is-review', label: 'Chờ duyệt' },
  needs_review: { className: 'is-danger', label: 'Cần xem' },
  failed: { className: 'is-danger', label: 'Lỗi' },
  generating: { className: 'is-running', label: 'Đang tạo' },
};

const relativeTime = value => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hôm qua' : `${days} ngày trước`;
};

const isAttention = item => Object.values(item.taskStatus || {}).some(status => ['waiting_review', 'needs_review', 'failed'].includes(status));
const isGenerating = item => item.status === 'generating' || Object.values(item.taskStatus || {}).includes('generating');
const isReady = item => {
  const statuses = Object.values(item.taskStatus || {}).filter(Boolean);
  return statuses.length > 0 && statuses.every(status => status === 'ready');
};

function taskStatus(item, key) {
  const status = item.taskStatus?.[key];
  if (!status) return <span className="cs-library-task is-empty">—</span>;
  const meta = STATUS_META[status] || { className: 'is-empty', label: 'Chưa tạo' };
  let label = meta.label;
  if (key === 'questions' && status === 'ready' && item.summary?.questionCount) label = `${item.summary.questionCount}/${item.summary.questionCount}`;
  return <span className={`cs-library-task ${meta.className}`}><i />{label}</span>;
}

function itemTarget(item) {
  if (item.nextAction === 'review_dictionary') return `/content-studio/items/${item.id}?tab=dictionary`;
  if (item.nextAction === 'review') {
    const tab = ['questions', 'dictionary', 'translation', 'vocab'].find(key => ['failed', 'needs_review'].includes(item.taskStatus?.[key]));
    return `/content-studio/items/${item.id}?tab=${tab || 'vocab'}`;
  }
  return `/content-studio/items/${item.id}`;
}

function itemDescription(item) {
  const summary = item.summary || {};
  const parts = [];
  if (item.part) parts.push(`Part ${item.part}`);
  if (summary.questionRange) parts.push(summary.questionRange.from === summary.questionRange.to
    ? `Q${summary.questionRange.from}` : `Q${summary.questionRange.from}–${summary.questionRange.to}`);
  if (!summary.questionCount) parts.push('Đoạn văn');
  if (item.sentenceCount) parts.push(`${item.sentenceCount} câu văn`);
  parts.push(relativeTime(item.updatedAt));
  return parts.join(' · ');
}

function FolderRows({ nodes, selected, navigate, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(new Set());
  return nodes.map(node => {
    const hasChildren = node.children.length > 0;
    const closed = collapsed.has(node.id);
    return <React.Fragment key={node.id}>
      <button type="button" className={selected === node.id ? 'is-selected' : ''} style={{ '--cs-folder-depth': depth }} onClick={() => navigate(`/content-studio/folders/${node.id}`)}>
        <span className="cs-library-folders__toggle" onClick={event => { if (!hasChildren) return; event.stopPropagation(); setCollapsed(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; }); }}>
          {hasChildren && (closed ? <ChevronRight /> : <ChevronDown />)}
        </span>
        <span className="cs-library-folders__name">{node.name}</span><span>{subtreeItemCount(node)}</span>
      </button>
      {hasChildren && !closed && <FolderRows nodes={node.children} selected={selected} navigate={navigate} depth={depth + 1} />}
    </React.Fragment>;
  });
}

export default function StudioFolderPage({ showMsg, permissions = {} }) {
  const { folderId = 'all' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(searchParams.get('status') === 'attention' ? 'attention' : 'all');
  const [menuId, setMenuId] = useState(null);
  const [moveItem, setMoveItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const showMsgRef = useRef(showMsg);
  useEffect(() => { showMsgRef.current = showMsg; }, [showMsg]);

  const loadFolderData = useCallback(async () => {
    const result = await listFolders();
    setFolders(result.folders || []); setUnfiledCount(result.unfiledCount || 0);
  }, []);
  const loadItemData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const params = folderId === 'all' ? {} : { folderId };
      setItems(await listItems(params)); setLoadError('');
    } catch (error) { setLoadError(errorMessage(error, 'Không thể tải danh sách học liệu.')); }
    finally { if (!quiet) setLoading(false); }
  }, [folderId]);
  const loadAll = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([loadFolderData(), loadItemData({ quiet: true })]); }
    catch (error) { setLoadError(errorMessage(error, 'Không thể tải thư mục.')); }
    finally { setLoading(false); }
  }, [loadFolderData, loadItemData]);
  useEffect(() => { loadAll(); }, [loadAll]);
  const anyGenerating = items.some(isGenerating);
  useEffect(() => {
    if (!anyGenerating) return undefined;
    const timer = setInterval(() => loadItemData({ quiet: true }), 3000);
    return () => clearInterval(timer);
  }, [anyGenerating, loadItemData]);
  useEffect(() => {
    const close = event => { if (!event.target.closest('.cs-library-menu')) setMenuId(null); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, []);

  const currentPath = useMemo(() => buildFolderPath(folders, folderId), [folders, folderId]);
  const currentName = folderId === 'all' ? 'Tất cả học liệu' : folderId === 'unfiled' ? 'Chưa phân loại' : currentPath.at(-1)?.name || 'Thư mục';
  const tree = useMemo(() => buildTree(folders), [folders]);
  const totalCount = useMemo(() => folders.reduce((total, folder) => total + Number(folder.itemCount || 0), unfiledCount), [folders, unfiledCount]);
  const counts = useMemo(() => ({
    all: items.length,
    attention: items.filter(isAttention).length,
    generating: items.filter(isGenerating).length,
    ready: items.filter(isReady).length,
  }), [items]);
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    return items.filter(item => !normalized || item.title.toLocaleLowerCase('vi').includes(normalized)).filter(item => (
      filter === 'all' || (filter === 'attention' && isAttention(item)) || (filter === 'generating' && isGenerating(item)) || (filter === 'ready' && isReady(item))
    ));
  }, [filter, items, query]);

  const move = async nextFolderId => {
    if (!moveItem) return;
    setBusy(true);
    try { await updateItem(moveItem.id, { folderId: nextFolderId }); showMsg?.('Đã chuyển học liệu.', 'success'); setMoveItem(null); await Promise.all([loadItemData(), loadFolderData()]); }
    catch (error) { showMsg?.(errorMessage(error, 'Không thể chuyển học liệu.'), 'error'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try { await deleteItem(deleteTarget.id); showMsg?.('Đã xoá học liệu.', 'success'); setDeleteTarget(null); await Promise.all([loadItemData(), loadFolderData()]); }
    catch (error) { showMsg?.(errorMessage(error, 'Không thể xoá học liệu.'), 'error'); }
    finally { setBusy(false); }
  };

  return <div className="cs-library"><div className="cs-library__inner">
    <header className="cs-library__header">
      <div><nav aria-label="Breadcrumb"><button type="button" onClick={() => navigate('/content-studio')}>Content Studio</button>{currentPath.map(folder => <React.Fragment key={folder.id}><span>/</span><button type="button" onClick={() => navigate(`/content-studio/folders/${folder.id}`)}>{folder.name}</button></React.Fragment>)}{folderId === 'unfiled' && <><span>/</span><strong>Chưa phân loại</strong></>}</nav><h1>{currentName}</h1></div>
      <label className="cs-library-search"><Search /><input aria-label="Tìm học liệu" placeholder="Tìm học liệu trong mọi thư mục…" value={query} onChange={event => setQuery(event.target.value)} /><kbd>⌘K</kbd></label>
    </header>
    <div className="cs-library__layout">
      <main>
        <nav className="cs-library-tabs" aria-label="Chế độ">
          <button type="button" onClick={() => navigate(`/content-studio/new${folderId !== 'all' && folderId !== 'unfiled' ? `?folderId=${folderId}` : ''}`)}><Plus />Nhập mới</button>
          <span aria-current="page"><List />Học liệu trong {currentName}<b>{items.length}</b>{counts.attention > 0 && <em>{counts.attention} cần xử lý</em>}</span>
        </nav>
        <section className="cs-library-list" aria-label={`Học liệu trong ${currentName}`}>
          <div className="cs-library-list__tools">
            <label><Search /><input aria-label={`Tìm trong ${currentName}`} placeholder={`Tìm trong ${currentName}…`} value={query} onChange={event => setQuery(event.target.value)} /></label><span />
            <div role="group" aria-label="Lọc theo trạng thái">{[
              ['all', 'Tất cả'], ['attention', 'Cần xử lý'], ['generating', 'Đang tạo'], ['ready', 'Hoàn tất'],
            ].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} {counts[value]}</button>)}</div>
          </div>
          <div className="cs-library-row cs-library-row--head"><span /><span>HỌC LIỆU</span><span>TỪ VỰNG</span><span>TỪ ĐIỂN</span><span>DỊCH</span><span>CÂU HỎI</span><span /></div>
          {loading ? <div className="cs-library-list__state"><Skeleton lines={4} /></div> : loadError ? <div className="cs-library-list__state"><strong>Không thể tải học liệu</strong><p>{loadError}</p><Button variant="outline" onClick={loadAll}>Thử lại</Button></div> : !visibleItems.length ? <div className="cs-library-list__state"><List /><strong>Không có học liệu phù hợp</strong><p>Thử từ khoá hoặc bộ lọc khác.</p></div> : visibleItems.map(item => {
            const hasQuestions = Boolean(item.summary?.questionCount);
            return <article key={item.id} className={`cs-library-row${isAttention(item) ? ' has-attention' : ''}`} onClick={() => navigate(itemTarget(item))}>
              <span className={`cs-library-row__kind ${hasQuestions ? 'is-question' : ''}`}>{hasQuestions ? 'Q' : 'P'}</span>
              <div className="cs-library-row__body"><strong>{item.title}</strong><span>{itemDescription(item)}</span></div>
              {taskStatus(item, 'vocab')}{taskStatus(item, 'dictionary')}{taskStatus(item, 'translation')}{taskStatus(item, 'questions')}
              <div className="cs-library-row__actions"><Button variant={item.nextAction === 'review_dictionary' ? 'primary' : 'outline'} size="sm" onClick={event => { event.stopPropagation(); navigate(itemTarget(item)); }}>{item.nextLabel || 'Mở'}</Button>
                {permissions.edit && <div className="cs-library-menu"><button type="button" aria-label={`Tác vụ cho ${item.title}`} onClick={event => { event.stopPropagation(); setMenuId(menuId === item.id ? null : item.id); }}><MoreHorizontal /></button>{menuId === item.id && <div onClick={event => event.stopPropagation()}><button type="button" onClick={() => { setMoveItem(item); setMenuId(null); }}><FolderInput />Chuyển thư mục</button><button type="button" className="is-danger" onClick={() => { setDeleteTarget(item); setMenuId(null); }}><Trash2 />Xoá</button></div>}</div>}
              </div>
            </article>;
          })}
        </section>
      </main>
      <aside className="cs-library-folders" aria-label="Thư mục">
        <header><strong>Thư mục</strong>{permissions.manageFolders && <button type="button" aria-label="Thư mục mới" onClick={() => setCreateOpen(true)}><FolderPlus /></button>}</header>
        <div className="cs-library-folders__tree">
          <button type="button" className={folderId === 'all' ? 'is-selected' : ''} style={{ '--cs-folder-depth': 0 }} onClick={() => navigate('/content-studio/folders/all')}><span className="cs-library-folders__toggle" /><span className="cs-library-folders__name">Tất cả</span><span>{totalCount}</span></button>
          <FolderRows nodes={tree} selected={folderId} navigate={navigate} />
          <hr />
          <button type="button" className={folderId === 'unfiled' ? 'is-selected' : ''} style={{ '--cs-folder-depth': 0 }} onClick={() => navigate('/content-studio/folders/unfiled')}><span className="cs-library-folders__toggle" /><span className="cs-library-folders__name">Chưa phân loại</span><span>{unfiledCount}</span></button>
        </div>
        {counts.attention > 0 && <div className="cs-library-folders__attention"><strong>{counts.attention} bài cần xử lý</strong>Trong {currentName} · <button type="button" onClick={() => setFilter('attention')}>Xem</button></div>}
      </aside>
    </div>
  </div>
  <PickFolderDialog open={Boolean(moveItem)} title="Chuyển học liệu vào thư mục" currentFolderId={moveItem?.folderId || null} confirmLabel={busy ? 'Đang chuyển…' : 'Chuyển vào đây'} onConfirm={move} onClose={() => !busy && setMoveItem(null)} />
  <ConfirmDialog open={Boolean(deleteTarget)} danger loading={busy} title={`Xoá “${deleteTarget?.title || ''}”?`} description="Học liệu và nội dung đã tạo sẽ bị xoá. Hành động này không thể hoàn tác." confirmLabel="Xoá học liệu" onConfirm={remove} onClose={() => !busy && setDeleteTarget(null)} />
  <CreateFolderDialog open={createOpen} defaultParentId={folderId !== 'all' && folderId !== 'unfiled' ? folderId : null} onClose={() => setCreateOpen(false)} onCreated={folder => { setCreateOpen(false); loadFolderData(); navigate(`/content-studio/folders/${folder.id}`); }} />
  </div>;
}
