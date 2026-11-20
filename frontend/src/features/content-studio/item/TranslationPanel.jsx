import React, { useState } from 'react';
import { Check, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '../../../design-system-v2';
import ArtifactShell from './ArtifactShell';

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'review', label: 'Cần xem lại' },
  { value: 'ready', label: 'Đạt' },
];

const autoSize = event => {
  const element = event.currentTarget;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};

export default function TranslationPanel({ artifact, draft, dirty, onChange, shell, activeSentence, onFocusSentence, onRegenerateSentence, regeneratingIndex }) {
  const [filter, setFilter] = useState('all');
  if (!artifact || (!artifact.content && ['queued', 'generating', 'failed'].includes(artifact.status))) {
    return <div className="cs-translation-empty"><ArtifactShell artifact={artifact} label="bản dịch" dirty={dirty} shell={shell} /></div>;
  }

  const rows = draft?.sentences || [];
  const issues = artifact.validation?.issues || [];
  const rowIssues = index => issues.filter(issue => issue.path === `sentences.${index}`);
  const reviewCount = rows.filter((_, index) => rowIssues(index).length).length;
  const counts = { all: rows.length, review: reviewCount, ready: rows.length - reviewCount };
  const visible = rows.map((row, index) => ({ row, index, issues: rowIssues(index) })).filter(entry => (
    filter === 'all' || (filter === 'review' ? entry.issues.length : !entry.issues.length)
  ));
  const isRowDirty = index => artifact.content?.sentences?.[index]?.vi !== rows[index]?.vi;
  const setVietnamese = (index, vi) => onChange({
    ...draft,
    sentences: rows.map((row, rowIndex) => (rowIndex === index ? { ...row, vi } : row)),
  });

  return <div className="cs-translation-panel">
    <div className="cs-translation-toolbar">
      {FILTERS.map(option => <button type="button" key={option.value} className={filter === option.value ? 'is-active' : ''} onClick={() => setFilter(option.value)}>
        {option.label} {counts[option.value]}
      </button>)}
      <span />
      <small>{artifact.source === 'human' ? 'AI · đã chỉnh tay' : 'AI'}</small>
      {shell.canGenerate && <Button variant="outline" size="sm" icon={<RefreshCw />} onClick={() => shell.onRegenerate(artifact)}>Tạo lại</Button>}
    </div>
    <ol className="cs-translation-cards">
      {visible.map(({ row, index, issues: sentenceIssues }) => {
        const needsReview = sentenceIssues.length > 0;
        return <li key={index} className={[needsReview ? 'is-review' : '', activeSentence === row.en ? 'is-active' : ''].filter(Boolean).join(' ')}
          onMouseEnter={() => onFocusSentence?.(row.en)} onMouseLeave={() => onFocusSentence?.(null)}>
          <div className="cs-translation-card__head">
            <strong>S{index + 1}</strong>
            <span className={needsReview ? 'is-review' : 'is-ready'}>{needsReview ? <TriangleAlert /> : <Check />}{needsReview ? 'Cần xem lại' : 'Đạt'}</span>
            <i />
            {isRowDirty(index) && <em>Chưa lưu</em>}
            {shell.canGenerate && <Button variant="ghost" size="sm" icon={<RefreshCw />} loading={regeneratingIndex === index} disabled={regeneratingIndex != null || ['queued', 'generating'].includes(artifact.status)} onClick={() => onRegenerateSentence(index)}>Tạo lại câu này</Button>}
          </div>
          <textarea rows={1} aria-label={`Bản dịch câu ${index + 1}`} value={row.vi || ''} readOnly={!shell.canEdit}
            ref={element => { if (element) { element.style.height = 'auto'; element.style.height = `${element.scrollHeight}px`; } }}
            onInput={autoSize} onFocus={() => onFocusSentence?.(row.en)} onBlur={() => onFocusSentence?.(null)}
            onChange={event => setVietnamese(index, event.target.value)} />
          {sentenceIssues.map((issue, issueIndex) => <div className="cs-translation-card__issue" key={`${issue.code}-${issueIndex}`}><TriangleAlert />{issue.message}</div>)}
        </li>;
      })}
    </ol>
  </div>;
}
