import React, { useState } from 'react';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { Button, FormField, IconButton, Input, Textarea } from '../../../design-system-v2';
import ArtifactShell from './ArtifactShell';
import useArtifactDraft from './useArtifactDraft';

const POS = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Noun Phrase', 'Verb Phrase', 'Phrasal Verb', 'Prepositional Phrase', 'Idiom', 'Preposition', 'Conjunction', 'Phrase'];
const pad = value => String(value).padStart(2, '0');

function highlight(text, terms) {
  const list = terms.filter(Boolean).sort((a, b) => b.length - a.length).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!list.length) return text;
  return text.split(new RegExp(`(${list.join('|')})`, 'gi')).map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part));
}

export function SourceView({ segment }) {
  return <p className="cs-source">{segment.text}</p>;
}

export function TranslationView({ artifact, shell }) {
  const { draft, update, dirty, saving, save, regenerate } = useArtifactDraft(artifact, shell);
  const rows = draft?.sentences || [];
  const setVi = (index, vi) => update({ ...draft, sentences: rows.map((row, i) => (i === index ? { ...row, vi } : row)) });
  return <ArtifactShell artifact={artifact} label="bản dịch" dirty={dirty} saving={saving} onSave={save} onRegenerate={regenerate} {...shell}>
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

export function VocabView({ artifact, segment, shell }) {
  const { draft, update, dirty, saving, save, regenerate } = useArtifactDraft(artifact, shell);
  const items = draft?.items || [];
  const setItem = (index, patch) => update({ ...draft, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const remove = index => update({ ...draft, items: items.filter((_, i) => i !== index) });
  const add = () => update({ ...draft, items: [...items, { inText: '', lemma: '', pos: 'Noun', ipa: '', meaningVi: '' }] });
  const ro = !shell.canEdit;
  return <ArtifactShell artifact={artifact} label="từ vựng" dirty={dirty} saving={saving} onSave={save} onRegenerate={regenerate} {...shell}>
    <p className="cs-source is-compact">{highlight(segment.text, items.map(item => item.inText))}</p>
    <ul className="cs-vocab">
      {items.map((item, index) => <li key={index}>
        <span className="cs-num">{pad(index + 1)}</span>
        <div className="cs-vocab__grid">
          <Input aria-label="Dạng trong bài" placeholder="Dạng trong bài" value={item.inText || ''} readOnly={ro} onChange={event => setItem(index, { inText: event.target.value })} />
          <Input aria-label="Dạng từ điển" placeholder="Dạng từ điển" className="is-strong" value={item.lemma || ''} readOnly={ro} onChange={event => setItem(index, { lemma: event.target.value })} />
          <select className="cs-select" aria-label="Loại từ" value={item.pos || 'Noun'} disabled={ro} onChange={event => setItem(index, { pos: event.target.value })}>{POS.map(pos => <option key={pos}>{pos}</option>)}</select>
          <Input aria-label="IPA" placeholder="IPA" value={item.ipa || ''} readOnly={ro} onChange={event => setItem(index, { ipa: event.target.value })} />
          <Input aria-label="Nghĩa" placeholder="Nghĩa tiếng Việt" className="cs-vocab__meaning" value={item.meaningVi || ''} readOnly={ro} onChange={event => setItem(index, { meaningVi: event.target.value })} />
        </div>
        {!ro && <IconButton size="sm" variant="ghost" label="Xoá từ" onClick={() => remove(index)}><X /></IconButton>}
      </li>)}
    </ul>
    {!ro && <Button variant="outline" size="sm" icon={<Plus />} onClick={add}>Thêm từ</Button>}
  </ArtifactShell>;
}

function EntryDetail({ entry, onChange, readOnly, onBack }) {
  const set = patch => onChange({ ...entry, ...patch });
  return <div className="cs-entry">
    <button type="button" className="cs-entry__back" onClick={onBack}><ChevronLeft /> Danh sách từ điển</button>
    <header><strong>{entry.lemma}</strong><small>{entry.pos}{entry.ipa ? ` · ${entry.ipa}` : ''}</small></header>
    <div className="cs-entry__grid">
      <FormField label="Từ"><Input value={entry.lemma || ''} readOnly={readOnly} onChange={event => set({ lemma: event.target.value })} /></FormField>
      <FormField label="Loại từ"><select className="cs-select" value={entry.pos || 'Noun'} disabled={readOnly} onChange={event => set({ pos: event.target.value })}>{POS.map(pos => <option key={pos}>{pos}</option>)}</select></FormField>
      <FormField label="IPA"><Input value={entry.ipa || ''} readOnly={readOnly} onChange={event => set({ ipa: event.target.value })} /></FormField>
      <FormField label="Nghĩa tiếng Việt"><Input value={entry.meaningVi || ''} readOnly={readOnly} onChange={event => set({ meaningVi: event.target.value })} /></FormField>
    </div>
    <FormField label="Định nghĩa tiếng Anh"><Textarea rows={2} value={entry.meaningEn || ''} readOnly={readOnly} onChange={event => set({ meaningEn: event.target.value })} /></FormField>
    <FormField label="Ngữ cảnh trong bài"><Textarea rows={2} value={entry.context || ''} readOnly={readOnly} onChange={event => set({ context: event.target.value })} /></FormField>
    <FormField label="Ví dụ"><Textarea rows={2} value={entry.example?.en || ''} readOnly={readOnly} onChange={event => set({ example: { ...entry.example, en: event.target.value } })} /></FormField>
    <FormField label="Dịch ví dụ"><Textarea rows={2} value={entry.example?.vi || ''} readOnly={readOnly} onChange={event => set({ example: { ...entry.example, vi: event.target.value } })} /></FormField>
    <FormField label="Từ đồng nghĩa" description="Ngăn cách bằng dấu phẩy"><Input value={(entry.synonyms || []).join(', ')} readOnly={readOnly} onChange={event => set({ synonyms: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></FormField>
  </div>;
}

export function DictionaryView({ artifact, shell }) {
  const { draft, update, dirty, saving, save, regenerate } = useArtifactDraft(artifact, shell);
  const sentences = draft?.sentences || [];
  const [selected, setSelected] = useState(null); // [sentenceIndex, entryIndex]
  const total = sentences.reduce((sum, sentence) => sum + (sentence.entries?.length || 0), 0);
  const entry = selected ? sentences[selected[0]]?.entries?.[selected[1]] : null;
  const setEntry = next => update({
    ...draft,
    sentences: sentences.map((sentence, si) => (si !== selected[0] ? sentence : { ...sentence, entries: sentence.entries.map((item, ei) => (ei === selected[1] ? next : item)) })),
  });
  return <ArtifactShell artifact={artifact} label="từ điển" dirty={dirty} saving={saving} onSave={save} onRegenerate={regenerate} {...shell}>
    {entry
      ? <EntryDetail entry={entry} onChange={setEntry} readOnly={!shell.canEdit} onBack={() => setSelected(null)} />
      : <>
        <p className="cs-muted">{total} từ/cụm từ · {sentences.length} câu — chọn một từ để xem chi tiết</p>
        <div className="cs-dict">
          {sentences.map((sentence, si) => <section key={si}>
            <p className="cs-dict__sentence"><span className="cs-num">{pad(sentence.index || si + 1)}</span><span>{highlight(sentence.text, (sentence.entries || []).map(item => item.inText))}</span></p>
            {(sentence.entries || []).map((item, ei) => <button type="button" key={ei} className="cs-dict__entry" onClick={() => setSelected([si, ei])}>
              <strong>{item.lemma}</strong><small>{item.pos}{item.ipa ? ` · ${item.ipa}` : ''}</small><span>{item.meaningVi}</span>
            </button>)}
          </section>)}
        </div>
      </>}
  </ArtifactShell>;
}
