import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Check, ClipboardCheck, FileText, Folder, Inbox, Plus, Search,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, ErrorState, Skeleton } from '../../../design-system-v2';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import {
  errorMessage, getAttention, getFolderSummary, getRecentItems, listFolders, listItems,
} from '../../../services/contentStudioService';
import CreateFolderDialog from '../components/CreateFolderDialog';
import { buildFolderPath } from '../folderTree';
import './StudioHomePage.css';

const relativeTime = value => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `Sửa ${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Sửa ${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Hôm qua' : `Sửa ${days} ngày trước`;
};

const folderStatus = folder => {
  if (folder.failed) return { tone: 'danger', label: `${folder.failed} lỗi` };
  if (folder.pendingReview) return { tone: 'warning', label: `${folder.pendingReview} chờ duyệt từ` };
  if (folder.needsReview) return { tone: 'danger', label: `${folder.needsReview} cần xem lại` };
  if (folder.itemCount > 0 && folder.readyCount === folder.itemCount) return { tone: 'success', label: `Hoàn tất ${folder.readyCount}/${folder.itemCount}` };
  return { tone: 'draft', label: 'Bản nháp' };
};

const itemStatus = item => {
  const statuses = Object.values(item.taskStatus || {}).filter(Boolean);
  if (item.taskStatus?.dictionary === 'waiting_review') return { tone: 'warning', label: 'Chờ duyệt danh sách từ' };
  if (statuses.includes('failed')) return { tone: 'danger', label: 'Tạo nội dung lỗi' };
  if (statuses.includes('needs_review')) return { tone: 'danger', label: 'Cần xem lại' };
  if (statuses.includes('generating')) return { tone: 'info', label: 'Đang tạo' };
  if (statuses.length && statuses.every(status => status === 'ready')) return { tone: 'success', label: 'Hoàn tất' };
  return { tone: 'draft', label: 'Bản nháp' };
};

const itemTarget = item => {
  if (item.nextAction === 'review_dictionary') return `/content-studio/items/${item.id}?tab=dictionary`;
  if (item.nextAction === 'review') {
    const task = ['questions', 'dictionary', 'translation', 'vocab'].find(key => ['failed', 'needs_review'].includes(item.taskStatus?.[key]));
    return `/content-studio/items/${item.id}?tab=${task || 'vocab'}`;
  }
  return `/content-studio/items/${item.id}`;
};

function StatusPill({ value }) {
  return <span className={`cs-home-status is-${value.tone}`}><i />{value.label}</span>;
}

export function StudioRecentRow({ item }) {
  const navigate = useNavigate();
  const status = itemStatus(item);
  const meta = [item.part ? `Part ${item.part}` : null, item.questionRange ? `Q${item.questionRange.from}–${item.questionRange.to}` : null].filter(Boolean).join(' · ');
  const path = item.folderPath?.length ? item.folderPath.map(folder => folder.name).join(' › ') : 'Chưa phân loại';
  const done = status.tone === 'success';
  return <li className="cs-home-recent__row">
    <span className={`cs-home-recent__icon${done ? ' is-done' : ''}`}>{done ? <Check /> : <FileText />}</span>
    <div className="cs-home-recent__body">
      <div><strong>{item.title}</strong>{meta && <span>{meta}</span>}<StatusPill value={status} /></div>
      <small><Folder />{path}</small>
    </div>
    <time>{relativeTime(item.updatedAt)}</time>
    <Button variant={item.nextAction === 'review_dictionary' ? 'primary' : 'outline'} onClick={() => navigate(itemTarget(item))}>{item.nextLabel || 'Mở'}</Button>
  </li>;
}

function FolderCard({ folder, onOpen }) {
  const status = folderStatus(folder);
  return <article className={`cs-home-folder${['warning', 'danger'].includes(status.tone) ? ' has-attention' : ''}`} onClick={onOpen}>
    <div className="cs-home-folder__top"><span className="cs-home-folder__icon"><Folder /></span><StatusPill value={status} /></div>
    <div><h3>{folder.name}</h3><p>{folder.itemCount} bài · {folder.children.length} Unit</p></div>
    <div className="cs-home-folder__children">{folder.children.slice(0, 3).map(child => <span key={child.id}>{child.name} · {child.itemCount} bài</span>)}{folder.children.length > 3 && <span>…</span>}</div>
    <div className="cs-home-folder__bottom"><span>{relativeTime(folder.updatedAt).replace(/^Sửa /, 'Cập nhật ')}</span><button type="button">Mở thư mục<ArrowRight /></button></div>
  </article>;
}

export default function StudioHomePage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ folders: [], unfiledCount: 0 });
  const [recent, setRecent] = useState([]);
  const [attention, setAttention] = useState({ dictionaryPending: 0, needsReview: 0, total: 0 });
  const [allFolders, setAllFolders] = useState([]);
  const [sort, setSort] = useState('recent');
  const [query, setQuery] = useState('');
  const [searchItems, setSearchItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const searchSequence = useRef(0);
  const debouncedQuery = useDebouncedValue(query, 300);

  const loadHome = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [folderData, recentData, attentionData, flatFolderData] = await Promise.all([
        getFolderSummary(), getRecentItems({ limit: 5 }), getAttention(), listFolders(),
      ]);
      setSummary(folderData); setRecent(recentData); setAttention(attentionData); setAllFolders(flatFolderData.folders || []);
    } catch (loadFailure) { setLoadError(errorMessage(loadFailure, 'Không thể tải Content Studio.')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadHome(); }, [loadHome]);
  useEffect(() => {
    const value = debouncedQuery.trim();
    const sequence = ++searchSequence.current;
    if (!value) { setSearchItems([]); setSearching(false); return undefined; }
    setSearching(true);
    listItems({ search: value, limit: 50 }).then(items => {
      if (sequence !== searchSequence.current) return;
      setSearchItems(items.map(item => ({
        ...item,
        folderPath: buildFolderPath(allFolders, item.folderId),
        questionRange: item.summary?.questionRange,
        nextLabel: item.nextLabel || (item.nextAction === 'review_dictionary' ? 'Duyệt danh sách từ' : item.nextAction === 'review' ? 'Xem lại' : 'Mở'),
      })));
    }).catch(searchError => { if (sequence === searchSequence.current) setLoadError(errorMessage(searchError, 'Không thể tìm học liệu.')); })
      .finally(() => { if (sequence === searchSequence.current) setSearching(false); });
    return undefined;
  }, [debouncedQuery, allFolders]);

  const folders = useMemo(() => [...summary.folders].sort((a, b) => sort === 'name'
    ? a.name.localeCompare(b.name, 'vi')
    : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [summary.folders, sort]);
  const isSearching = Boolean(query.trim());
  const attentionParts = [
    attention.dictionaryPending > 0 ? `${attention.dictionaryPending} bài chờ duyệt danh sách từ` : null,
    attention.needsReview > 0 ? `${attention.needsReview} bài có nội dung cần xem lại` : null,
  ].filter(Boolean);

  return <div className="cs-home">
    <div className="cs-home__title-row">
      <div className="cs-home__title"><span>Tạo &amp; phát triển</span><h1>Content Studio</h1></div>
      <label className="cs-home__search"><Search /><input aria-label="Tìm học liệu" placeholder="Tìm học liệu trong mọi thư mục…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <Button variant="outline" icon={<Folder />} onClick={() => setCreateOpen(true)}>Thêm thư mục</Button>
      <Button icon={<Plus />} onClick={() => navigate('/content-studio/new')}>Tạo học liệu mới</Button>
    </div>

    {loadError && !loading ? <ErrorState title="Không thể tải Content Studio" description={loadError} action={<Button variant="outline" onClick={loadHome}>Thử lại</Button>} /> : <>
      {!isSearching && attention.total > 0 && attentionParts.length > 0 && <div className="cs-home-attention" role="status">
        <span><ClipboardCheck /></span>
        <p><strong>{attention.total} bài cần xử lý:</strong> {attentionParts.join(', ')}.</p>
        <button type="button" onClick={() => navigate('/content-studio/folders/all?status=attention')}>Xem bài cần xử lý<ArrowRight /></button>
      </div>}

      {isSearching ? <section className="cs-home-recent" aria-label="Kết quả tìm kiếm">
        <div className="cs-home-section-title"><div><h2>Kết quả tìm kiếm</h2><p>{debouncedQuery ? `${searchItems.length} học liệu phù hợp với “${debouncedQuery}”` : 'Đang tìm học liệu…'}</p></div></div>
        {searching ? <div className="cs-home__list-loading"><Skeleton lines={4} /></div> : searchItems.length ? <ul>{searchItems.map(item => <StudioRecentRow key={item.id} item={item} />)}</ul> : <div className="cs-home__empty-search"><Search /><strong>Không tìm thấy học liệu</strong><span>Thử tên hoặc từ khoá khác.</span></div>}
      </section> : <>
        <section className="cs-home-folders" aria-label="Thư mục">
          <div className="cs-home-section-title"><h2>Thư mục</h2><label>Sắp xếp<select value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Gần đây nhất</option><option value="name">Tên</option></select></label></div>
          {loading ? <div className="cs-home-folder-grid"><div className="cs-home-folder is-loading"><Skeleton lines={5} /></div><div className="cs-home-folder is-loading"><Skeleton lines={5} /></div><div className="cs-home-folder is-loading"><Skeleton lines={5} /></div></div> : <>
            {!folders.length && !summary.unfiledCount && <p className="cs-home-folders__guidance">Chưa có thư mục. Tạo khoá học đầu tiên để tổ chức học liệu theo Course › Unit › Lesson.</p>}
            <div className="cs-home-folder-grid">
              {folders.map(folder => <FolderCard key={folder.id} folder={folder} onOpen={() => navigate(`/content-studio/folders/${folder.id}`)} />)}
              {summary.unfiledCount > 0 && <article className="cs-home-folder cs-home-folder--unfiled" onClick={() => navigate('/content-studio/folders/unfiled')}>
                <div className="cs-home-folder__top"><span className="cs-home-folder__icon"><Inbox /></span><span className="cs-home-status is-warning">{summary.unfiledCount} bài</span></div>
                <div><h3>Chưa phân loại</h3><p>{summary.unfiledCount} bài chưa gắn thư mục</p></div>
                <p className="cs-home-folder__note">Kéo thả hoặc chọn thư mục cho từng bài để dễ tìm và export theo Unit.</p>
                <div className="cs-home-folder__bottom"><span>Lưu nhanh từ màn Nhập mới</span><button type="button">Phân loại ngay<ArrowRight /></button></div>
              </article>}
              <button type="button" className="cs-home-folder-create" onClick={() => setCreateOpen(true)}><span><Plus /></span><strong>Tạo thư mục / khoá học mới</strong><small>Tổ chức theo Course › Unit › Lesson</small></button>
            </div>
          </>}
        </section>

        <section className="cs-home-recent" aria-label="Làm việc gần đây">
          <div className="cs-home-section-title"><div><h2>Làm việc gần đây</h2><p>Bài bạn thao tác gần nhất, kèm việc cần làm tiếp</p></div><button type="button" onClick={() => navigate('/content-studio/folders/all')}>Xem tất cả học liệu<ArrowRight /></button></div>
          {loading ? <div className="cs-home__list-loading"><Skeleton lines={4} /></div> : recent.length ? <ul>{recent.map(item => <StudioRecentRow key={item.id} item={item} />)}</ul> : <div className="cs-home__empty-search"><FileText /><strong>Chưa có học liệu</strong><span>Tạo học liệu mới để bắt đầu.</span></div>}
        </section>
      </>}
    </>}

    <CreateFolderDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); loadHome(); }} />
  </div>;
}
