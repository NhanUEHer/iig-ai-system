import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Skeleton } from '../../../design-system-v2';
import { TASK_LABELS } from './TaskPanel';

const relativeTime = value => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hôm qua' : `${days} ngày trước`;
};

function describe(item) {
  const summary = item.summary || {};
  const parts = [];
  if (summary.questionCount) {
    parts.push('Bộ câu hỏi');
    if (item.part) parts.push(`Part ${item.part}`);
    if (summary.questionRange) parts.push(summary.questionRange.from === summary.questionRange.to ? `Q${summary.questionRange.from}` : `Q${summary.questionRange.from}–${summary.questionRange.to}`);
    if (summary.passageCount) parts.push(`${item.sentenceCount} câu văn`);
  } else {
    parts.push('Đoạn văn', `${item.sentenceCount} câu văn`);
  }
  parts.push(relativeTime(item.updatedAt));
  return parts.join(' · ');
}

const PASSAGE_TYPE = { translation: 'passage_translation', vocab: 'vocab', dictionary: 'dictionary' };
const CHIP_STATE = {
  ready: { state: 'ready', suffix: ' ✓', hint: 'Hoàn tất' }, needs_review: { state: 'review', suffix: ' · cần xem', hint: 'Cần xem lại' },
  generating: { state: 'running', suffix: ' · đang tạo', hint: 'Đang tạo' }, failed: { state: 'failed', suffix: ' · lỗi', hint: 'Tạo thất bại' },
};

function chips(item) {
  const tasks = item.tasks || {};
  const status = item.artifactStatus || {};
  const list = [
    ...(tasks.question || []).map(task => ({ key: `q-${task}`, label: TASK_LABELS.question[task], status: status.question_pack })),
    ...(tasks.passage || []).map(task => ({ key: `p-${task}`, label: task === 'translation' ? 'Dịch đoạn văn' : TASK_LABELS.passage[task], status: status[PASSAGE_TYPE[task]] })),
  ];
  return list.map(chip => {
    const meta = CHIP_STATE[chip.status] || { state: 'waiting', suffix: '', hint: 'Chưa tạo' };
    return { ...chip, state: meta.state, text: `${chip.label}${meta.suffix}`, hint: meta.hint };
  });
}

export default function ItemList({ title, items, loading, highlightId }) {
  const navigate = useNavigate();
  return <section className="cs-list" aria-label={title}>
    <header><h2>{title}</h2><span>· {items.length} mục</span></header>
    {loading && !items.length ? <Skeleton lines={3} />
      : !items.length ? <EmptyState title="Chưa có học liệu" description="Dán nội dung ở trên và bấm Lưu để thêm vào thư mục này." />
        : <ul>{items.map(item => {
          const isQuestion = Boolean(item.summary?.questionCount);
          const open = () => navigate(`/content-studio/items/${item.id}`);
          return <li key={item.id} className={`is-clickable${item.id === highlightId ? ' is-new' : ''}`} onClick={open}>
            <span className={`cs-list__kind ${isQuestion ? 'is-q' : 'is-p'}`}>{isQuestion ? 'Q' : 'P'}</span>
            <div className="cs-list__body"><strong>{item.title}</strong><small>{describe(item)}</small></div>
            <div className="cs-list__chips">{chips(item).map(chip => <span key={chip.key} className={`cs-chip is-${chip.state}`} title={chip.hint}>{chip.text}</span>)}</div>
            <Button variant="ghost" size="sm" onClick={event => { event.stopPropagation(); open(); }}>Mở</Button>
          </li>;
        })}</ul>}
  </section>;
}
