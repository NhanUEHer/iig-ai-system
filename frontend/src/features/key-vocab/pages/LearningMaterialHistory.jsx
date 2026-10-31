import { BookOpenText, Clock3, Eye, LibraryBig, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, DataView, EmptyState, FilterBar, IconButton, Pagination, StatusBadge, TableToolbar } from '../../../design-system-v2';
import { getLearningMaterialHistory } from '../../../services/learningMaterialService';
import './LearningMaterialHistory.css';

const PAGE_SIZE = 10;
const modeLabels = { balanced: 'Cân bằng', phrase_focused: 'Ưu tiên cụm từ', single_word_focused: 'Ưu tiên từ đơn' };
const dictionaryStatuses = {
  completed: { status: 'completed', label: 'Hoàn tất' },
  generating: { status: 'processing', label: 'Đang tạo' },
  partial: { status: 'warning', label: 'Một phần' },
  failed: { status: 'failed', label: 'Lỗi' },
  draft: { status: 'draft', label: 'Bản nháp' },
};

function formatUpdatedAt(value) {
  if (!value) return 'Chưa cập nhật';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function ArtifactSummary({ icon, title, children, available, onOpen }) {
  return <div className={`learning-history-artifact ${available ? 'is-available' : 'is-empty'}`}>
    <span className="learning-history-artifact__icon">{icon}</span>
    <div className="learning-history-artifact__body">
      <strong>{title}</strong>
      <div className="learning-history-artifact__meta">{children}</div>
    </div>
    {available && <IconButton size="sm" label={`Mở ${title}`} title={`Mở ${title}`} onClick={onOpen}><Eye /></IconButton>}
  </div>;
}

export default function LearningMaterialHistory({ onOpenMaterial, showMsg }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, total: 0, totalPages: 1, limit: PAGE_SIZE });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getLearningMaterialHistory({ page, limit: PAGE_SIZE, search: search.trim() || undefined });
      setItems(result.data || []);
      setMeta(result.meta || { page, total: 0, totalPages: 1, limit: PAGE_SIZE });
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Không thể tải lịch sử học liệu.';
      setError(message);
      showMsg?.(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, showMsg]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  return <DataView
    toolbar={<>
      <TableToolbar title="Lịch sử học liệu" count={meta.total || 0} loading={loading} />
      <FilterBar search={search} onSearch={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm trong nội dung nguồn…" loading={loading} />
    </>}
    pagination={<Pagination
      page={meta.page || page}
      pageCount={meta.totalPages || 1}
      pageSize={meta.limit || PAGE_SIZE}
      total={meta.total || 0}
      loading={loading}
      showPageSize={false}
      onPage={setPage}
      rangeLabel={({ from, to, total }) => `Hiển thị ${from}–${to} / ${total} nội dung`}
    />}
  >
    <div className="learning-history-list" aria-busy={loading}>
      {loading && !items.length && <div className="learning-history-state"><RefreshCw className="spin" />Đang tải lịch sử…</div>}
      {!loading && error && <EmptyState icon={<Clock3 />} title="Không thể tải lịch sử" description={error} action={<Button variant="outline" size="sm" icon={<RefreshCw />} onClick={load}>Thử lại</Button>} />}
      {!loading && !error && !items.length && <EmptyState
        icon={<Clock3 />}
        title={search ? 'Không tìm thấy học liệu' : 'Chưa có lịch sử học liệu'}
        description={search ? 'Thử thay đổi từ khóa tìm kiếm.' : 'Các bộ Key Vocab và Dictionary đã tạo sẽ xuất hiện tại đây.'}
      />}
      {items.map(item => {
        const dictionaryStatus = dictionaryStatuses[item.dictionaryStatus] || dictionaryStatuses.draft;
        return <article className="learning-history-row" key={item.passageId}>
          <div className="learning-history-source">
            <span className="learning-history-source__icon"><BookOpenText /></span>
            <div>
              <strong>{item.passage}</strong>
              <time><Clock3 />{formatUpdatedAt(item.updatedAt)}</time>
            </div>
          </div>
          <div className="learning-history-artifacts">
            <ArtifactSummary icon={<BookOpenText />} title="Key Vocab" available={Boolean(item.keyVocabId)} onOpen={() => onOpenMaterial(item, 'key-vocab')}>
              {item.keyVocabId ? <><Badge tone="success">{item.keyVocabCount || 0} từ</Badge><span>TOEIC {item.targetScore}+</span><span>{modeLabels[item.selectionMode] || item.selectionMode}</span></> : <Badge>Chưa tạo</Badge>}
            </ArtifactSummary>
            <ArtifactSummary icon={<LibraryBig />} title="Dictionary" available={Boolean(item.dictionaryId)} onOpen={() => onOpenMaterial(item, 'dictionary')}>
              {item.dictionaryId ? <><StatusBadge status={dictionaryStatus.status} label={dictionaryStatus.label} /><span>{item.dictionaryCompletedCount || 0}/{item.dictionaryCount || 0} từ</span>{item.dictionaryFailedCount > 0 && <Badge tone="danger">{item.dictionaryFailedCount} lỗi</Badge>}</> : <Badge>Chưa tạo</Badge>}
            </ArtifactSummary>
          </div>
        </article>;
      })}
    </div>
  </DataView>;
}
