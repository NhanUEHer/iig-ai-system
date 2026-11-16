import React from 'react';
import { Plus, X } from 'lucide-react';
import { Button, FormField, Input, Textarea } from '../../../design-system-v2';
import ArtifactShell from './ArtifactShell';

const POS = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Noun Phrase', 'Verb Phrase', 'Phrasal Verb', 'Prepositional Phrase', 'Idiom', 'Preposition', 'Conjunction', 'Phrase'];
const pad = value => String(value).padStart(2, '0');

export function highlight(text, terms, active) {
  const list = terms.filter(Boolean).sort((a, b) => b.length - a.length).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!list.length) return text;
  const current = String(active || '').toLowerCase();
  return text.split(new RegExp(`(${list.join('|')})`, 'gi')).map((part, index) => (index % 2 ? <mark key={index} className={current && part.toLowerCase() === current ? 'is-active' : ''}>{part}</mark> : part));
}

const LETTERS = ['A', 'B', 'C', 'D'];

// Edit the original passage(s) and questions. Value: { segments: {id: text}, questions: {id: {stem, options, answerKey}} }.
const autoSize = event => { const el = event.target; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };

// Document-style editing of the original passage + questions: looks like the read view, every line is editable in place.
export function SourceEditor({ passages, questions, draft, onChange }) {
  const segmentText = passage => draft.segments?.[passage.id] ?? passage.text;
  const questionValue = question => draft.questions?.[question.id] ?? { stem: question.stem, options: question.options, answerKey: question.answerKey };
  const setSegment = (passage, text) => onChange({ ...draft, segments: { ...draft.segments, [passage.id]: text } });
  const setQuestion = (question, patch) => onChange({ ...draft, questions: { ...draft.questions, [question.id]: { ...questionValue(question), ...patch } } });
  return <div className="cs-doc">
    <p className="cs-doc__hint">Bấm vào chữ để sửa · bấm chữ cái A–D để đổi đáp án đúng</p>
    {passages.map(passage => <textarea key={passage.id} className="cs-doc__passage" aria-label="Đoạn văn" value={segmentText(passage)}
      ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
      onInput={autoSize} onChange={event => setSegment(passage, event.target.value)} />)}
    {questions.length > 0 && <ol className="cs-doc__questions">
      {questions.map(question => {
        const value = questionValue(question);
        return <li key={question.id}>
          <div className="cs-doc__stem"><span>{question.number}.</span><input aria-label={`Câu hỏi ${question.number}`} value={value.stem} onChange={event => setQuestion(question, { stem: event.target.value })} /></div>
          {LETTERS.filter(letter => question.options?.[letter] != null).map(letter => <div key={letter} className={`cs-doc__opt${value.answerKey === letter ? ' is-answer' : ''}`}>
            <button type="button" title="Đặt làm đáp án đúng" aria-pressed={value.answerKey === letter} onClick={() => setQuestion(question, { answerKey: letter })}>{letter}</button>
            <input aria-label={`Đáp án ${letter} câu ${question.number}`} value={value.options?.[letter] || ''} onChange={event => setQuestion(question, { options: { ...value.options, [letter]: event.target.value } })} />
          </div>)}
        </li>;
      })}
    </ol>}
  </div>;
}

export function TranslationView({ artifact, draft, dirty, onChange: update, shell }) {
  const rows = draft?.sentences || [];
  const setVi = (index, vi) => update({ ...draft, sentences: rows.map((row, i) => (i === index ? { ...row, vi } : row)) });
  return <ArtifactShell artifact={artifact} label="bản dịch" dirty={dirty} shell={shell}>
    <ol className="cs-translation">
      {rows.map((row, index) => <li key={index}>
        <span className="cs-num">{pad(index + 1)}</span>
        <div>
          <p>{row.en}</p>
          {shell.canEdit
            ? <Textarea rows={2} aria-label={`Bản dịch câu ${index + 1}`} value={row.vi || ''} onChange={event => setVi(index, event.target.value)} />
            : <p className="cs-translation__vi">{row.vi}</p>}
        </div>
      </li>)}
    </ol>
  </ArtifactShell>;
}

export function VocabView({ artifact, draft, dirty, onChange: update, shell, activeIndex, onActivate }) {
  const items = draft?.items || [];
  const setItem = (index, patch) => update({ ...draft, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const remove = index => { update({ ...draft, items: items.filter((_, i) => i !== index) }); onActivate(null); };
  const add = () => { update({ ...draft, items: [...items, { inText: '', lemma: '', pos: 'Noun', ipa: '', meaningVi: '' }] }); onActivate(items.length); };
  const ro = !shell.canEdit;
  return <ArtifactShell artifact={artifact} label="từ vựng" dirty={dirty} shell={shell}>
    <ul className="cs-words">
      {items.map((item, index) => {
        const active = activeIndex === index;
        return <li key={index} className={active ? 'is-active' : ''}>
          <button type="button" className="cs-words__row" onClick={() => onActivate(active ? null : index)} aria-expanded={active}>
            <span className="cs-num">{pad(index + 1)}</span>
            <span className="cs-words__main">
              <strong>{item.lemma || <em>Từ mới</em>}</strong>
              {item.pos && <span className="cs-tag">{item.pos}</span>}
              {item.ipa && <small>{item.ipa}</small>}
              {item.inText && item.inText.toLowerCase() !== String(item.lemma || '').toLowerCase() && <small>· trong bài: “{item.inText}”</small>}
            </span>
            <span className="cs-words__meaning">{item.meaningVi}</span>
          </button>
          {active && <div className="cs-words__edit">
            <FormField label="Dạng trong bài"><Input value={item.inText || ''} readOnly={ro} onChange={event => setItem(index, { inText: event.target.value })} /></FormField>
            <FormField label="Dạng từ điển"><Input value={item.lemma || ''} readOnly={ro} onChange={event => setItem(index, { lemma: event.target.value })} /></FormField>
            <FormField label="Loại từ"><select className="cs-select" value={item.pos || 'Noun'} disabled={ro} onChange={event => setItem(index, { pos: event.target.value })}>{POS.map(pos => <option key={pos}>{pos}</option>)}</select></FormField>
            <FormField label="IPA"><Input value={item.ipa || ''} readOnly={ro} onChange={event => setItem(index, { ipa: event.target.value })} /></FormField>
            <FormField label="Nghĩa tiếng Việt" className="cs-words__wide"><Input value={item.meaningVi || ''} readOnly={ro} onChange={event => setItem(index, { meaningVi: event.target.value })} /></FormField>
            {!ro && <Button variant="ghost" size="sm" icon={<X />} onClick={() => remove(index)}>Xoá từ</Button>}
          </div>}
        </li>;
      })}
    </ul>
    {!ro && <Button variant="outline" size="sm" icon={<Plus />} onClick={add}>Thêm từ</Button>}
  </ArtifactShell>;
}

function EntryEditor({ entry, onChange, readOnly }) {
  const set = patch => onChange({ ...entry, ...patch });
  return <div className="cs-words__edit">
    <FormField label="Từ"><Input value={entry.lemma || ''} readOnly={readOnly} onChange={event => set({ lemma: event.target.value })} /></FormField>
    <FormField label="Dạng trong bài"><Input value={entry.inText || ''} readOnly={readOnly} onChange={event => set({ inText: event.target.value })} /></FormField>
    <FormField label="Loại từ"><select className="cs-select" value={entry.pos || 'Noun'} disabled={readOnly} onChange={event => set({ pos: event.target.value })}>{POS.map(pos => <option key={pos}>{pos}</option>)}</select></FormField>
    <FormField label="IPA"><Input value={entry.ipa || ''} readOnly={readOnly} onChange={event => set({ ipa: event.target.value })} /></FormField>
    <FormField label="Nghĩa tiếng Việt" className="cs-words__wide"><Input value={entry.meaningVi || ''} readOnly={readOnly} onChange={event => set({ meaningVi: event.target.value })} /></FormField>
    <FormField label="Định nghĩa tiếng Anh" className="cs-words__wide"><Textarea rows={2} value={entry.meaningEn || ''} readOnly={readOnly} onChange={event => set({ meaningEn: event.target.value })} /></FormField>
    <FormField label="Ngữ cảnh trong bài" className="cs-words__wide"><Textarea rows={2} value={entry.context || ''} readOnly={readOnly} onChange={event => set({ context: event.target.value })} /></FormField>
    <FormField label="Ví dụ"><Textarea rows={2} value={entry.example?.en || ''} readOnly={readOnly} onChange={event => set({ example: { ...entry.example, en: event.target.value } })} /></FormField>
    <FormField label="Dịch ví dụ"><Textarea rows={2} value={entry.example?.vi || ''} readOnly={readOnly} onChange={event => set({ example: { ...entry.example, vi: event.target.value } })} /></FormField>
    <FormField label="Từ đồng nghĩa" description="Ngăn cách bằng dấu phẩy" className="cs-words__wide"><Input value={(entry.synonyms || []).join(', ')} readOnly={readOnly} onChange={event => set({ synonyms: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></FormField>
  </div>;
}

// Same pattern as the vocab list: compact rows grouped by sentence, click a row to edit; terms are highlighted on the left.
export function DictionaryView({ artifact, draft, dirty, onChange: update, shell, active, onActivate }) {
  const sentences = draft?.sentences || [];
  const total = sentences.reduce((sum, sentence) => sum + (sentence.entries?.length || 0), 0);
  const setEntry = (si, ei, next) => update({
    ...draft,
    sentences: sentences.map((sentence, index) => (index !== si ? sentence : { ...sentence, entries: sentence.entries.map((item, i) => (i === ei ? next : item)) })),
  });
  return <ArtifactShell artifact={artifact} label="từ điển" dirty={dirty} shell={shell}>
    <p className="cs-muted">{total} từ/cụm từ · {sentences.length} câu</p>
    <div className="cs-dict-groups">
      {sentences.map((sentence, si) => <section key={si}>
        <header><strong>Câu {pad(sentence.index || si + 1)}</strong><span>{sentence.text}</span><small>{sentence.entries?.length || 0} mục</small></header>
        {(sentence.entries || []).length > 0 && <ul className="cs-words">
          {sentence.entries.map((item, ei) => {
            const isActive = active?.[0] === si && active?.[1] === ei;
            return <li key={ei} className={isActive ? 'is-active' : ''}>
              <button type="button" className="cs-words__row" onClick={() => onActivate(isActive ? null : [si, ei])} aria-expanded={isActive}>
                <span className="cs-num">{pad(ei + 1)}</span>
                <span className="cs-words__main">
                  <strong>{item.lemma}</strong>
                  {item.pos && <span className="cs-tag">{item.pos}</span>}
                  {item.ipa && <small>{item.ipa}</small>}
                </span>
                <span className="cs-words__meaning">{item.meaningVi}</span>
              </button>
              {isActive && <EntryEditor entry={item} readOnly={!shell.canEdit} onChange={next => setEntry(si, ei, next)} />}
            </li>;
          })}
        </ul>}
      </section>)}
    </div>
  </ArtifactShell>;
}
