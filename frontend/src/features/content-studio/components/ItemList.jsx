import React from 'react';
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

function chips(item) {
  const tasks = item.tasks || {};
  const list = [
    ...(tasks.question || []).map(task => ({ key: `q-${task}`, label: TASK_LABELS.question[task] })),
    ...(tasks.passage || []).map(task => ({ key: `p-${task}`, label: task === 'translation' ? 'Dịch đoạn văn' : TASK_LABELS.passage[task] })),
  ];
  // Generation is not wired yet: every requested task is shown as waiting.
  return list.map(chip => ({ ...chip, state: 'waiting', text: chip.label, hint: 'Chờ tạo' }));
}

export default function ItemList({ title, items, loading, highlightId }) {
  return <section className="cs-list" aria-label={title}>
    <header><h2>{title}</h2><span>· {items.length} mục</span></header>
    {loading && !items.length ? <Skeleton lines={3} />
      : !items.length ? <EmptyState title="Chưa có học liệu" description="Dán nội dung ở trên và bấm Lưu để thêm vào thư mục này." />
        : <ul>{items.map(item => {
          const isQuestion = Boolean(item.summary?.questionCount);
          return <li key={item.id} className={item.id === highlightId ? 'is-new' : ''}>
            <span className={`cs-list__kind ${isQuestion ? 'is-q' : 'is-p'}`}>{isQuestion ? 'Q' : 'P'}</span>
            <div className="cs-list__body"><strong>{item.title}</strong><small>{describe(item)}</small></div>
            <div className="cs-list__chips">{chips(item).map(chip => <span key={chip.key} className={`cs-chip is-${chip.state}`} title={chip.hint}>{chip.text}</span>)}</div>
            <Button variant="ghost" size="sm" disabled title="Màn kết quả sẽ có ở bước tiếp theo">Mở</Button>
          </li>;
        })}</ul>}
  </section>;
}
