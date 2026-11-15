import React, { useState } from 'react';
import { CheckCircle2, Lightbulb, X } from 'lucide-react';
import { FormField, Input, Surface, Textarea } from '../../../design-system-v2';
import ArtifactShell from './ArtifactShell';
import useArtifactDraft from './useArtifactDraft';

const LETTERS = ['A', 'B', 'C', 'D'];

export function QuestionEditor({ question, artifact, shell }) {
  const { draft, update, dirty, saving, save, regenerate } = useArtifactDraft(artifact, shell);
  const issues = artifact?.validation?.issues || [];
  const flagged = field => issues.some(issue => issue.path === field);
  const set = patch => update({ ...draft, ...patch });
  const setTranslation = patch => set({ translation: { ...draft.translation, ...patch } });
  const letters = LETTERS.filter(letter => question.options?.[letter]);
  return <Surface className="cs-panel cs-question" padding="lg">
    <header className="cs-question__head">
      <span className="cs-question__no">{question.number}</span>
      <div>
        <strong>{question.stem}</strong>
        <ul>{letters.map(letter => <li key={letter} className={question.answerKey === letter ? 'is-answer' : ''}>({letter}) {question.options[letter]}{question.answerKey === letter && <CheckCircle2 />}</li>)}</ul>
      </div>
    </header>
    <ArtifactShell artifact={artifact} label="nội dung câu hỏi" dirty={dirty} saving={saving} onSave={save} onRegenerate={regenerate} compact {...shell}>
      {draft && <div className="cs-question__fields">
        <FormField label="Dịch câu hỏi & đáp án" className={flagged('translation') ? 'is-flagged' : ''}>
          <Input value={draft.translation?.stem || ''} readOnly={!shell.canEdit} onChange={event => setTranslation({ stem: event.target.value })} />
          <div className="cs-question__options">{letters.map(letter => <Input key={letter} prefix={`${letter}.`} value={draft.translation?.options?.[letter] || ''} readOnly={!shell.canEdit}
            onChange={event => setTranslation({ options: { ...draft.translation?.options, [letter]: event.target.value } })} />)}</div>
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
  </Surface>;
}

function LearnerQuestion({ question, content, total, showTranslation }) {
  const [hintOpen, setHintOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const letters = LETTERS.filter(letter => question.options?.[letter]);
  const answered = picked != null;
  return <div className="cs-learner__q">
    <div className="cs-learner__top"><strong>Question</strong><strong>{question.number}/{total}</strong></div>
    <div className="cs-learner__stem">
      <div><b>{question.number}. {question.stem}</b>{showTranslation && content?.translation?.stem && <span>{content.translation.stem}</span>}</div>
      {content?.hint && <button type="button" aria-label="Xem gợi ý" aria-expanded={hintOpen} onClick={() => setHintOpen(value => !value)}><Lightbulb /></button>}
    </div>
    {hintOpen && <div className="cs-learner__hint" role="dialog" aria-label="Strategy hints"><header><strong>Strategy hints</strong><button type="button" aria-label="Đóng gợi ý" onClick={() => setHintOpen(false)}><X /></button></header>{content.hint}</div>}
    {letters.map(letter => {
      const state = !answered ? '' : letter === question.answerKey ? 'is-correct' : letter === picked ? 'is-wrong' : '';
      return <button type="button" key={letter} className={`cs-learner__opt ${state}`} disabled={answered} onClick={() => setPicked(letter)}>
        <i />{letter}. {question.options[letter]}{showTranslation && content?.translation?.options?.[letter] && <em> ({content.translation.options[letter]})</em>}
      </button>;
    })}
    {answered && content?.explanation && <div className="cs-learner__tab is-explanation"><span>Explanation</span><p>{content.explanation}</p></div>}
    {answered && content?.note && <div className="cs-learner__tab is-note"><span>Note</span><p>{content.note}</p></div>}
  </div>;
}

export function LearnerPreview({ questions, artifactsByQuestion }) {
  const [showTranslation, setShowTranslation] = useState(true);
  return <Surface className="cs-panel" padding="lg">
    <div className="cs-learner__bar">
      <span>Mô phỏng giao diện học viên: Hint mở bằng bóng đèn trước khi trả lời; Explanation và Note hiện sau khi chọn đáp án.</span>
      <label><input type="checkbox" checked={showTranslation} onChange={event => setShowTranslation(event.target.checked)} /> Hiện bản dịch</label>
    </div>
    <div className="cs-learner">
      {questions.map(question => <LearnerQuestion key={question.id} question={question} total={questions.length} content={artifactsByQuestion[question.id]?.content} showTranslation={showTranslation} />)}
    </div>
  </Surface>;
}
