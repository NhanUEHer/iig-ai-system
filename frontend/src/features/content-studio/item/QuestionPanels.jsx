import React from 'react';
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { FormField, StatusBadge, Textarea } from '../../../design-system-v2';
import ArtifactShell, { STATUS } from './ArtifactShell';
import useArtifactDraft from './useArtifactDraft';

const LETTERS = ['A', 'B', 'C', 'D'];

// One free-text block (question + options); older content stored {stem, options}.
const translationText = value => (typeof value === 'string' ? value
  : value ? [value.stem, ...Object.entries(value.options || {}).map(([letter, text]) => `(${letter}) ${text}`)].filter(Boolean).join('\n') : '');

export function QuestionEditor({ question, artifact, shell, open, onToggle }) {
  const { draft, update, dirty, saving, save, regenerate } = useArtifactDraft(artifact, shell);
  const issues = artifact?.validation?.issues || [];
  const flagged = field => issues.some(issue => issue.path === field);
  const set = patch => update({ ...draft, ...patch });
  const letters = LETTERS.filter(letter => question.options?.[letter]);
  const status = artifact ? STATUS[artifact.status] : null;
  return <section className={`cs-question${open ? ' is-open' : ''}`}>
    <button type="button" className="cs-question__toggle" aria-expanded={open} onClick={onToggle}>
      {open ? <ChevronDown /> : <ChevronRight />}
      <span className="cs-question__no">{question.number}</span>
      <strong>{question.stem}</strong>
      {dirty && <em>Chưa lưu</em>}
      {status ? <StatusBadge status={status.tone} label={status.label} /> : <span className="cs-muted">Chưa tạo</span>}
    </button>
    {open && <div className="cs-question__body">
      <ul className="cs-question__opts">{letters.map(letter => <li key={letter} className={question.answerKey === letter ? 'is-answer' : ''}>({letter}) {question.options[letter]}{question.answerKey === letter && <CheckCircle2 />}</li>)}</ul>
    <ArtifactShell artifact={artifact} label="nội dung câu hỏi" dirty={dirty} saving={saving} onSave={save} onRegenerate={regenerate} compact {...shell}>
      {draft && <div className="cs-question__fields">
        <FormField label="Dịch câu hỏi & đáp án" className={flagged('translation') ? 'is-flagged' : ''}>
          <Textarea rows={letters.length + 1} value={translationText(draft.translation)} readOnly={!shell.canEdit} placeholder={'Câu hỏi dịch\n(A) …\n(B) …'} onChange={event => set({ translation: event.target.value })} />
        </FormField>
        <FormField label="Hint" description="Gợi ý chiến lược — không được lộ đáp án" className={flagged('hint') ? 'is-flagged' : ''}>
          <Textarea rows={2} value={draft.hint || ''} readOnly={!shell.canEdit} onChange={event => set({ hint: event.target.value })} />
        </FormField>
        <FormField label="Explanation" description="Nêu đáp án đúng, trích dẫn bài và lý do loại các phương án sai" className={flagged('explanation') ? 'is-flagged' : ''}>
          <Textarea rows={4} value={draft.explanation || ''} readOnly={!shell.canEdit} onChange={event => set({ explanation: event.target.value })} />
        </FormField>
        <FormField label="Note" className={flagged('note') ? 'is-flagged' : ''}>
          <Textarea rows={2} value={draft.note || ''} readOnly={!shell.canEdit} onChange={event => set({ note: event.target.value })} />
        </FormField>
      </div>}
    </ArtifactShell>
    </div>}
  </section>;
}
