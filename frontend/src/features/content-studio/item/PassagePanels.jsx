import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, FormField, IconButton, Input, Surface, Textarea } from '../../../design-system-v2';
import ArtifactShell from './ArtifactShell';
import useArtifactDraft from './useArtifactDraft';

const POS = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Noun Phrase', 'Verb Phrase', 'Phrasal Verb', 'Prepositional Phrase', 'Idiom', 'Preposition', 'Conjunction', 'Phrase'];

export function TranslationPanel({ artifact, shell }) {
  const { draft, update, dirty, saving, save, regenerate } = useArtifactDraft(artifact, shell);
  const rows = draft?.sentences || [];
  const setVi = (index, vi) => update({ ...draft, sentences: rows.map((row, i) => (i === index ? { ...row, vi } : row)) });
  return <Surface className="cs-panel" padding="lg">
    <h2 className="cs-panel__title">Đoạn văn · Dịch</h2>
    <ArtifactShell artifact={artifact} label="bản dịch" dirty={dirty} saving={saving} onSave={save} onRegenerate={regenerate} {...shell}>
      <ol className="cs-translation">
        {rows.map((row, index) => <li key={index}>
          <span className="cs-translation__no">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <p>{row.en}</p>
            {shell.canEdit
              ? <Textarea rows={2} aria-label={`Bản dịch câu ${index + 1}`} value={row.vi || ''} onChange={event => setVi(index, event.target.value)} />
              : <p className="cs-translation__vi">({row.vi})</p>}
          </div>
        </li>)}
      </ol>
    </ArtifactShell>
  </Surface>;
}

function highlight(text, terms) {
  const list = terms.filter(Boolean).sort((a, b) => b.length - a.length).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!list.length) return text;
  return text.split(new RegExp(`(${list.join('|')})`, 'gi')).map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part));
}

export function VocabPanel({ artifact, segment, shell }) {
  const { draft, update, dirty, saving, save, regenerate } = useArtifactDraft(artifact, shell);
  const items = draft?.items || [];
  const setItem = (index, patch) => update({ ...draft, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const remove = index => update({ ...draft, items: items.filter((_, i) => i !== index) });
  const add = () => update({ ...draft, items: [...items, { inText: '', lemma: '', pos: 'Noun', ipa: '', meaningVi: '' }] });
  const inPassage = items.filter(item => item.inText && segment.text.toLowerCase().includes(item.inText.toLowerCase())).length;
  return <div className="cs-split">
    <Surface className="cs-panel cs-source is-side" padding="lg"><small>Từ được chọn được tô màu</small><p>{highlight(segment.text, items.map(item => item.inText))}</p></Surface>
    <Surface className="cs-panel" padding="lg">
      <ArtifactShell artifact={artifact} label="từ vựng" dirty={dirty} saving={saving} onSave={save} onRegenerate={regenerate} {...shell}>
        <div className="cs-table-wrap"><table className="cs-table">
          <thead><tr><th>#</th><th>Dạng trong bài</th><th>Dạng từ điển</th><th>Loại từ</th><th>IPA</th><th>Nghĩa</th><th /></tr></thead>
          <tbody>{items.map((item, index) => <tr key={index}>
            <td>{String(index + 1).padStart(2, '0')}</td>
            <td><Input aria-label="Dạng trong bài" value={item.inText || ''} readOnly={!shell.canEdit} onChange={event => setItem(index, { inText: event.target.value })} /></td>
            <td><Input aria-label="Dạng từ điển" value={item.lemma || ''} readOnly={!shell.canEdit} onChange={event => setItem(index, { lemma: event.target.value })} /></td>
            <td><select className="cs-select" aria-label="Loại từ" value={item.pos || 'Noun'} disabled={!shell.canEdit} onChange={event => setItem(index, { pos: event.target.value })}>{POS.map(pos => <option key={pos}>{pos}</option>)}</select></td>
            <td><Input aria-label="IPA" value={item.ipa || ''} readOnly={!shell.canEdit} onChange={event => setItem(index, { ipa: event.target.value })} /></td>
            <td><Input aria-label="Nghĩa" value={item.meaningVi || ''} readOnly={!shell.canEdit} onChange={event => setItem(index, { meaningVi: event.target.value })} /></td>
            <td>{shell.canEdit && <IconButton size="sm" variant="ghost" label="Xoá dòng" onClick={() => remove(index)}><X /></IconButton>}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="cs-table-foot">
          {shell.canEdit && <Button variant="outline" size="sm" icon={<Plus />} onClick={add}>Thêm từ</Button>}
          <span>✓ {inPassage}/{items.length} từ có trong bài</span>
        </div>
      </ArtifactShell>
    </Surface>
  </div>;
}

export function DictionaryPanel({ artifact, shell }) {
  const { draft, update, dirty, saving, save, regenerate } = useArtifactDraft(artifact, shell);
  const sentences = useMemo(() => draft?.sentences || [], [draft]);
  const [selected, setSelected] = useState(null); // [sentenceIndex, entryIndex]
  const [open, setOpen] = useState({ 0: true });
  const total = sentences.reduce((sum, sentence) => sum + (sentence.entries?.length || 0), 0);
  const entry = selected ? sentences[selected[0]]?.entries?.[selected[1]] : null;
  const setEntry = patch => update({
    ...draft,
    sentences: sentences.map((sentence, si) => (si !== selected[0] ? sentence : {
      ...sentence, entries: sentence.entries.map((item, ei) => (ei === selected[1] ? { ...item, ...patch } : item)),
    })),
  });
  return <div className="cs-split is-detail">
    <Surface className="cs-panel" padding="lg">
      <ArtifactShell artifact={artifact} label="từ điển" dirty={dirty} saving={saving} onSave={save} onRegenerate={regenerate} {...shell}>
        <p className="cs-muted">{total} từ/cụm từ · {sentences.length} câu</p>
        <div className="cs-dict">
          {sentences.map((sentence, si) => <section key={si}>
            <button type="button" aria-expanded={Boolean(open[si])} onClick={() => setOpen(current => ({ ...current, [si]: !current[si] }))}>
              <strong>Câu {String(sentence.index || si + 1).padStart(2, '0')}</strong><span>{sentence.text}</span><em>{sentence.entries?.length || 0} mục {open[si] ? '▴' : '▾'}</em>
            </button>
            {open[si] && (sentence.entries || []).map((item, ei) => <button type="button" key={ei}
              className={`cs-dict__entry${selected?.[0] === si && selected?.[1] === ei ? ' is-selected' : ''}`} onClick={() => setSelected([si, ei])}>
              <span>{String(ei + 1).padStart(2, '0')}</span>
              <div><strong>{item.lemma}</strong> <small>· {item.pos}{item.ipa ? ` · ${item.ipa}` : ''}</small><p>{item.meaningVi}</p></div>
            </button>)}
          </section>)}
        </div>
      </ArtifactShell>
    </Surface>
    {entry && <Surface className="cs-panel cs-dict__detail" padding="lg">
      <header><div><strong>{entry.lemma}</strong><small>{entry.pos}{entry.ipa ? ` · ${entry.ipa}` : ''}</small></div><IconButton size="sm" variant="ghost" label="Đóng" onClick={() => setSelected(null)}><X /></IconButton></header>
      <FormField label="Nghĩa tiếng Việt"><Input value={entry.meaningVi || ''} readOnly={!shell.canEdit} onChange={event => setEntry({ meaningVi: event.target.value })} /></FormField>
      <FormField label="Định nghĩa tiếng Anh"><Textarea rows={2} value={entry.meaningEn || ''} readOnly={!shell.canEdit} onChange={event => setEntry({ meaningEn: event.target.value })} /></FormField>
      <FormField label="Ngữ cảnh"><Textarea rows={2} value={entry.context || ''} readOnly={!shell.canEdit} onChange={event => setEntry({ context: event.target.value })} /></FormField>
      <FormField label="Ví dụ"><Textarea rows={2} value={entry.example?.en || ''} readOnly={!shell.canEdit} onChange={event => setEntry({ example: { ...entry.example, en: event.target.value } })} /></FormField>
      <FormField label="Dịch ví dụ"><Textarea rows={2} value={entry.example?.vi || ''} readOnly={!shell.canEdit} onChange={event => setEntry({ example: { ...entry.example, vi: event.target.value } })} /></FormField>
      {dirty && shell.canEdit && <Button size="sm" loading={saving} onClick={save}>Lưu thay đổi</Button>}
    </Surface>}
  </div>;
}
