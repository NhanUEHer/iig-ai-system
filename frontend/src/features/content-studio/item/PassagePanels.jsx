import React from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../design-system-v2';
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

export function TranslationView({ artifact, draft, dirty, onChange: update, shell, onFocusSentence }) {
  const rows = draft?.sentences || [];
  const setVi = (index, vi) => update({ ...draft, sentences: rows.map((row, i) => (i === index ? { ...row, vi } : row)) });
  return <ArtifactShell artifact={artifact} label="bản dịch" dirty={dirty} shell={shell}>
    <ol className="cs-doc cs-trans">
      {rows.map((row, index) => <li key={index} onMouseEnter={() => onFocusSentence?.(row.en)} onMouseLeave={() => onFocusSentence?.(null)}>
        <span className="cs-num">{pad(index + 1)}</span>
        <div>
          <textarea rows={1} title={row.en} aria-label={`Bản dịch câu ${index + 1}`} value={row.vi || ''} readOnly={!shell.canEdit}
            ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
            onFocus={() => onFocusSentence?.(row.en)} onBlur={() => onFocusSentence?.(null)}
            onInput={autoSize} onChange={event => setVi(index, event.target.value)} />
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
        const differs = item.inText && item.inText.toLowerCase() !== String(item.lemma || '').toLowerCase();
        return <li key={index} className={active ? 'is-active' : ''}>
          {active && !ro
            ? <div className="cs-doc cs-words__inline">
              <span className="cs-num">{pad(index + 1)}</span>
              <div className="cs-words__main">
                <input className="cs-words__lemma" aria-label="Dạng từ điển" placeholder="Từ" value={item.lemma || ''} onChange={event => setItem(index, { lemma: event.target.value })} />
                <select className="cs-tag cs-tag--select" aria-label="Loại từ" value={item.pos || 'Noun'} onChange={event => setItem(index, { pos: event.target.value })}>{POS.map(pos => <option key={pos}>{pos}</option>)}</select>
                <input className="cs-words__ipa" aria-label="IPA" placeholder="/IPA/" value={item.ipa || ''} onChange={event => setItem(index, { ipa: event.target.value })} />
                <input className="cs-words__meaning" aria-label="Nghĩa tiếng Việt" placeholder="Nghĩa tiếng Việt" value={item.meaningVi || ''} onChange={event => setItem(index, { meaningVi: event.target.value })} />
                <label className="cs-words__intext">trong bài: <input aria-label="Dạng trong bài" placeholder="dạng xuất hiện trong bài" value={item.inText || ''} onChange={event => setItem(index, { inText: event.target.value })} /></label>
              </div>
              <span className="cs-words__actions">
                <button type="button" className="cs-icon-btn" title="Thu gọn" aria-label="Thu gọn" onClick={() => onActivate(null)}><Check /></button>
              </span>
            </div>
            : <div className="cs-words__row" role="button" tabIndex={0} onClick={() => onActivate(active ? null : index)} onKeyDown={event => { if (event.key === 'Enter') onActivate(index); }}>
              <span className="cs-num">{pad(index + 1)}</span>
              <span className="cs-words__main">
                <strong>{item.lemma || <em>Từ mới</em>}</strong>
                {item.pos && <span className="cs-tag">{item.pos}</span>}
                {item.ipa && <small>{item.ipa}</small>}
                {differs && <small className="cs-words__intext">trong bài: “{item.inText}”</small>}
              </span>
              <span className="cs-words__meaning">{item.meaningVi}</span>
              <span className="cs-words__actions" />
            </div>}
          {!ro && <button type="button" className="cs-icon-btn cs-words__delete" title="Xoá từ" aria-label={`Xoá từ ${item.lemma || index + 1}`} onClick={() => remove(index)}><Trash2 /></button>}
        </li>;
      })}
    </ul>
    {!ro && <Button variant="outline" size="sm" icon={<Plus />} onClick={add}>Thêm từ</Button>}
  </ArtifactShell>;
}

function DocField({ label, value, onChange, placeholder }) {
  return <label className="cs-entry-field"><span>{label}</span>
    <textarea rows={1} value={value || ''} placeholder={placeholder}
      ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
      onInput={autoSize} onChange={event => onChange(event.target.value)} />
  </label>;
}

// Dictionary: same inline pattern as vocab — click a word to edit it in its row, extra fields below, delete per row.
export function DictionaryView({ artifact, draft, dirty, onChange: update, shell, active, onActivate }) {
  const sentences = draft?.sentences || [];
  const total = sentences.reduce((sum, sentence) => sum + (sentence.entries?.length || 0), 0);
  const ro = !shell.canEdit;
  const mapEntries = (si, fn) => update({ ...draft, sentences: sentences.map((sentence, index) => (index !== si ? sentence : { ...sentence, entries: fn(sentence.entries || []) })) });
  const setEntry = (si, ei, patch) => mapEntries(si, entries => entries.map((item, i) => (i === ei ? { ...item, ...patch } : item)));
  const remove = (si, ei) => { mapEntries(si, entries => entries.filter((_, i) => i !== ei)); onActivate(null); };
  return <ArtifactShell artifact={artifact} label="từ điển" dirty={dirty} shell={shell}>
    <p className="cs-muted">{total} từ/cụm từ · {sentences.length} câu</p>
    <div className="cs-dict-groups">
      {sentences.map((sentence, si) => <section key={si}>
        <header><strong>Câu {pad(sentence.index || si + 1)}</strong><span>{sentence.text}</span><small>{sentence.entries?.length || 0} mục</small></header>
        {(sentence.entries || []).length > 0 && <ul className="cs-words">
          {sentence.entries.map((item, ei) => {
            const isActive = active?.[0] === si && active?.[1] === ei;
            const set = patch => setEntry(si, ei, patch);
            return <li key={ei} className={isActive ? 'is-active' : ''}>
              {isActive && !ro
                ? <div className="cs-doc cs-words__inline">
                  <span className="cs-num">{pad(ei + 1)}</span>
                  <div className="cs-words__main">
                    <input className="cs-words__lemma" aria-label="Từ" placeholder="Từ" value={item.lemma || ''} onChange={event => set({ lemma: event.target.value })} />
                    <select className="cs-tag cs-tag--select" aria-label="Loại từ" value={item.pos || 'Noun'} onChange={event => set({ pos: event.target.value })}>{POS.map(pos => <option key={pos}>{pos}</option>)}</select>
                    <input className="cs-words__ipa" aria-label="IPA" placeholder="/IPA/" value={item.ipa || ''} onChange={event => set({ ipa: event.target.value })} />
                    <input className="cs-words__meaning" aria-label="Nghĩa tiếng Việt" placeholder="Nghĩa tiếng Việt" value={item.meaningVi || ''} onChange={event => set({ meaningVi: event.target.value })} />
                    <label className="cs-words__intext">trong bài: <input aria-label="Dạng trong bài" value={item.inText || ''} onChange={event => set({ inText: event.target.value })} /></label>
                    <div className="cs-entry-fields">
                      <DocField label="Định nghĩa" value={item.meaningEn} placeholder="English definition" onChange={value => set({ meaningEn: value })} />
                      <DocField label="Ngữ cảnh" value={item.context} placeholder="Nghĩa của từ trong câu này" onChange={value => set({ context: value })} />
                      <DocField label="Ví dụ" value={item.example?.en} placeholder="Example sentence" onChange={value => set({ example: { ...item.example, en: value } })} />
                      <DocField label="Dịch ví dụ" value={item.example?.vi} placeholder="Câu ví dụ tiếng Việt" onChange={value => set({ example: { ...item.example, vi: value } })} />
                      <DocField label="Đồng nghĩa" value={(item.synonyms || []).join(', ')} placeholder="cách nhau bằng dấu phẩy" onChange={value => set({ synonyms: value.split(',').map(word => word.trim()).filter(Boolean) })} />
                    </div>
                  </div>
                  <span className="cs-words__actions"><button type="button" className="cs-icon-btn" title="Thu gọn" aria-label="Thu gọn" onClick={() => onActivate(null)}><Check /></button></span>
                </div>
                : <div className="cs-words__row" role="button" tabIndex={0} onClick={() => onActivate(isActive ? null : [si, ei])} onKeyDown={event => { if (event.key === 'Enter') onActivate([si, ei]); }}>
                  <span className="cs-num">{pad(ei + 1)}</span>
                  <span className="cs-words__main">
                    <strong>{item.lemma}</strong>
                    {item.pos && <span className="cs-tag">{item.pos}</span>}
                    {item.ipa && <small>{item.ipa}</small>}
                    {item.meaningEn && <small className="cs-words__intext">{item.meaningEn}</small>}
                  </span>
                  <span className="cs-words__meaning">{item.meaningVi}</span>
                  <span className="cs-words__actions" />
                </div>}
              {!ro && <button type="button" className="cs-icon-btn cs-words__delete" title="Xoá mục" aria-label={`Xoá ${item.lemma || ''}`} onClick={() => remove(si, ei)}><Trash2 /></button>}
            </li>;
          })}
        </ul>}
      </section>)}
    </div>
  </ArtifactShell>;
}
