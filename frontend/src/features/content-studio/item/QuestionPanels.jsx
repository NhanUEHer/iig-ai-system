import React, { useLayoutEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '../../../design-system-v2';
import ArtifactShell, { STATUS, isBusy } from './ArtifactShell';

const autoSize = node => { if (node) { node.style.height = 'auto'; node.style.height = `${node.scrollHeight + 2}px`; } };

// Fits its text whenever the value changes (switching question, regenerate, typing); the user can
// still drag it taller or shorter, and CSS caps it at most of the screen with a scrollbar.
function AutoTextarea({ value, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => autoSize(ref.current), [value]);
  return <textarea ref={ref} value={value} {...props} />;
}

const LETTERS = ['A', 'B', 'C', 'D'];
const FIELDS = [
  { value: 'translation', label: 'Dịch câu hỏi & đáp án', hint: 'một đoạn: câu hỏi + (A)–(D)', rows: 5 },
  { value: 'hint', label: 'Hint', hint: 'hiện trước khi trả lời · không lộ đáp án', rows: 2 },
  { value: 'explanation', label: 'Explanation', hint: 'đáp án đúng + trích dẫn + vì sao loại phương án sai', rows: 4 },
  { value: 'note', label: 'Note', hint: 'lưu ý cho học viên', rows: 2 },
];

const translationText = value => (typeof value === 'string' ? value
  : value ? [value.stem, ...Object.entries(value.options || {}).map(([letter, text]) => `(${letter}) ${text}`)].filter(Boolean).join('\n') : '');

export function explanationQuote(value, passage) {
  const normalizedPassage = String(passage || '').toLocaleLowerCase().replace(/\s+/g, ' ');
  const quotes = [...String(value || '').matchAll(/[“"]([^”"]{12,})[”"]/g)].map(match => match[1].replace(/[.…]+$/, '').trim());
  return quotes.find(quote => normalizedPassage.includes(quote.toLocaleLowerCase().replace(/\s+/g, ' '))) || null;
}

function Field({ definition, index, value, issues, readOnly, onChange }) {
  return <div className={`cs-question-field cs-question-field--${definition.value}${issues.length ? ' is-review' : ''}`}>
    <div><span>{index + 1}</span><strong>{definition.label}</strong><small>{definition.hint}</small></div>
    <AutoTextarea rows={definition.rows} value={value || ''} readOnly={readOnly} aria-label={definition.label} onChange={event => onChange(event.target.value)} />
    {issues.map((issue, issueIndex) => <p key={`${issue.code}-${issueIndex}`}><TriangleAlert />{issue.message}</p>)}
  </div>;
}

// Each image of the question (or its set) with the AI description that cs.question_pack reads.
// Editing the description is saved with the page; the question then shows as stale until regenerated.
function ImageDescriptions({ images, imageArtifacts, drafts, onChange, shell, questionNumber }) {
  if (!images.length) return null;
  return <section className="cs-image-descriptions" aria-label="Hình và mô tả hình">
    {images.map((image, index) => {
      const artifact = imageArtifacts[image.id];
      const draft = artifact ? drafts[artifact.id] ?? artifact.content : null;
      return <article key={image.id} className="cs-image-description">
        {image.url ? <a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`Hình ${index + 1} · câu ${questionNumber}`} /></a> : <div className="cs-image-description__missing">Không tải được ảnh</div>}
        <div>
          <strong>Mô tả hình {images.length > 1 ? index + 1 : ''}{image.questionId ? '' : image.segmentId ? ' · dùng cho cả nhóm câu' : ' · dùng cho cả học liệu'}</strong>
          <ArtifactShell artifact={artifact} label="mô tả hình" dirty={Boolean(artifact && drafts[artifact.id])} shell={shell}>
            {draft && <>
              {draft.imageType && <small className="cs-image-description__type">{draft.imageType}</small>}
              <AutoTextarea rows={4} aria-label="Mô tả hình" readOnly={!shell.canEdit}
                value={draft.description || ''} onChange={event => onChange(artifact, { ...draft, description: event.target.value })} />
            </>}
          </ArtifactShell>
        </div>
      </article>;
    })}
  </section>;
}

export function QuestionWorkspace({ questions, artifacts, drafts, selectedId, onSelect, onChange, shell, imageShell = shell, images = [], imageArtifacts = {} }) {
  const selectedIndex = Math.max(0, questions.findIndex(question => question.id === selectedId));
  const question = questions[selectedIndex];
  const artifact = artifacts[question?.id];
  const draft = artifact ? drafts[artifact.id] ?? artifact.content : null;
  const dirty = Boolean(artifact && drafts[artifact.id]);
  const issues = artifact?.validation?.issues || [];
  const status = artifact ? STATUS[artifact.status] : null;
  const needsReview = artifact?.status === 'needs_review' || artifact?.status === 'failed';
  const set = patch => onChange(artifact, { ...draft, ...patch });
  const previous = questions[selectedIndex - 1];
  const next = questions[selectedIndex + 1];
  // Part 1 photo on the question itself; Part 3/4 graphic on its question set.
  // Its own photo, its set's graphic, or an image attached to the whole item (sent to every set).
  const questionImages = question ? images.filter(image => image.questionId === question.id
    || (!image.questionId && (!image.segmentId || image.segmentId === question.segmentId))) : [];

  return <div className="cs-question-workspace">
    <div className="cs-question-picker">
      {questions.map(entry => {
        const entryArtifact = artifacts[entry.id];
        const flagged = entryArtifact?.status === 'needs_review' || entryArtifact?.status === 'failed';
        return <button type="button" key={entry.id} className={entry.id === question?.id ? 'is-active' : ''} onClick={() => onSelect(entry.id)}>
          <i className={flagged ? 'is-review' : `is-${entryArtifact?.status || 'empty'}`} />Câu {entry.number} · {entry.answerKey || '—'}
        </button>;
      })}
      <span />
      <small>{needsReview ? `AI · Câu ${question.number} cần xem lại` : 'AI · Nội dung đạt'}</small>
    </div>

    <ImageDescriptions images={questionImages} imageArtifacts={imageArtifacts} drafts={drafts} onChange={onChange} shell={imageShell} questionNumber={question?.number} />

    {!artifact || (!artifact.content && (isBusy(artifact) || artifact?.status === 'failed'))
      ? <div className="cs-question-empty"><ArtifactShell artifact={artifact} label="nội dung câu hỏi" dirty={dirty} shell={shell} /></div>
      : <article className="cs-question-card">
        <header>
          <span>{question.number}</span>
          <h2>{question.stem || (questionImages.length ? '(Mô tả tranh — chọn câu đúng với hình)' : '(Chỉ có phương án)')}</h2>
          {dirty && <em>Chưa lưu</em>}
          <b className={needsReview ? 'is-review' : 'is-ready'}>{needsReview ? 'Cần xem lại' : status?.label || 'Hoàn tất'}</b>
        </header>
        <ul aria-label="Phương án">
          {LETTERS.filter(letter => question.options?.[letter]).map(letter => <li key={letter} className={question.answerKey === letter ? 'is-answer' : ''}>
            <span>{letter}</span>{question.options[letter]}
          </li>)}
        </ul>
        <div aria-label="4 trường nội dung">
          {FIELDS.map((definition, index) => <Field key={definition.value} definition={definition} index={index}
            value={definition.value === 'translation' ? translationText(draft?.translation) : draft?.[definition.value]}
            issues={issues.filter(issue => issue.path === definition.value)} readOnly={!shell.canEdit}
            onChange={value => set({ [definition.value]: value })} />)}
        </div>
        <footer>
          {shell.canGenerate && <Button variant="outline" size="sm" icon={<RefreshCw />} loading={shell.isRegenerating?.(artifact)} disabled={isBusy(artifact) || shell.isRegenerating?.(artifact)} onClick={() => shell.onRegenerate(artifact)}>Tạo lại câu này</Button>}
          <span />
          <button type="button" disabled={!previous} onClick={() => previous && onSelect(previous.id)}><ChevronLeft />{previous ? `Câu ${previous.number}` : 'Câu trước'}</button>
          <button type="button" className="is-next" disabled={!next} onClick={() => next && onSelect(next.id)}>{next ? `Câu ${next.number}` : 'Câu sau'}<ChevronRight /></button>
        </footer>
      </article>}
  </div>;
}
