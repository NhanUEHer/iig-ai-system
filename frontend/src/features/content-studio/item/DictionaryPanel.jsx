import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Search, Trash2, WandSparkles, X } from 'lucide-react';
import { Button, EmptyState, Spinner } from '../../../design-system-v2';
import {
  deleteDictionaryCandidate, errorMessage, extractDictionary, generateDictionary,
  getDictionary, regenerateDictionaryEntry, saveDictionaryList,
} from '../../../services/contentStudioService';

const pad = value => String(value + 1).padStart(2, '0');
const BUSY = ['queued', 'generating'];
const STATUS_LABEL = {
  draft: 'Chờ tạo', queued: 'Đang chờ', generating: 'Đang tạo', ready: 'Hoàn tất', needs_review: 'Cần xem', failed: 'Lỗi',
};
const POS = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Noun Phrase', 'Verb Phrase', 'Phrasal Verb', 'Prepositional Phrase', 'Idiom', 'Preposition', 'Conjunction', 'Phrase'];
const splitList = value => value.split(',').map(part => part.trim()).filter(Boolean);

function EntryField({ number, label, value, editing, tone, onChange, kind = 'text' }) {
  const display = Array.isArray(value) ? value.join(', ') : value;
  return <label className={`cs-dictionary-field${tone ? ` is-${tone}` : ''}`}>
    <span>{number}</span><strong>{label}</strong>
    {editing ? (kind === 'select'
      ? <select value={display || 'Phrase'} onChange={event => onChange(event.target.value)}>{POS.map(pos => <option key={pos}>{pos}</option>)}</select>
      : <textarea rows={1} value={display || ''} onChange={event => onChange(kind === 'list' ? splitList(event.target.value) : event.target.value)} />)
      : <p>{display || '—'}</p>}
  </label>;
}

function ReviewList({ state, canEdit, canGenerate, selectedText, onConsumed, onReload, notify }) {
  const [sentences, setSentences] = useState(() => state.sentences.map(sentence => ({
    ...sentence, candidates: sentence.candidates.map(candidate => ({ ...candidate })),
  })));
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const total = sentences.reduce((sum, sentence) => sum + sentence.candidates.length, 0);

  useEffect(() => {
    const chunk = selectedText?.text?.trim();
    if (!chunk || !canEdit) return;
    const sentenceIndex = sentences.findIndex(sentence => sentence.segmentId === selectedText.segmentId && sentence.text.toLocaleLowerCase().includes(chunk.toLocaleLowerCase()));
    if (sentenceIndex >= 0) {
      setSentences(current => current.map((sentence, index) => index === sentenceIndex
        ? { ...sentence, candidates: [...sentence.candidates, { id: null, chunk, status: 'draft' }] } : sentence));
      setEditing([sentenceIndex, sentences[sentenceIndex].candidates.length]);
    }
    onConsumed();
  }, [selectedText]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (si, ci, chunk) => setSentences(current => current.map((sentence, index) => index === si
    ? { ...sentence, candidates: sentence.candidates.map((candidate, itemIndex) => itemIndex === ci ? { ...candidate, chunk } : candidate) } : sentence));
  const remove = (si, ci) => setSentences(current => current.map((sentence, index) => index === si
    ? { ...sentence, candidates: sentence.candidates.filter((_, itemIndex) => itemIndex !== ci) } : sentence));
  const add = si => {
    setSentences(current => current.map((sentence, index) => index === si
      ? { ...sentence, candidates: [...sentence.candidates, { id: null, chunk: '', status: 'draft' }] } : sentence));
    setEditing([si, sentences[si].candidates.length]);
  };
  const save = async () => {
    setSaving(true);
    try {
      await saveDictionaryList(state.itemId, sentences.map(sentence => ({ id: sentence.id, chunks: sentence.candidates.map(({ id, chunk }) => ({ id, chunk })) })));
      notify('Đã lưu danh sách từ.', 'success');
      await onReload();
    } catch (error) { notify(errorMessage(error, 'Không thể lưu danh sách từ.'), 'error'); }
    finally { setSaving(false); }
  };
  const generate = async () => {
    setGenerating(true);
    try {
      await saveDictionaryList(state.itemId, sentences.map(sentence => ({ id: sentence.id, chunks: sentence.candidates.map(({ id, chunk }) => ({ id, chunk })) })));
      await generateDictionary(state.itemId);
      notify('Đã bắt đầu tạo từ điển.', 'success');
      await onReload();
    } catch (error) { notify(errorMessage(error, 'Không thể tạo từ điển.'), 'error'); }
    finally { setGenerating(false); }
  };

  return <div className="cs-dictionary-review">
    <div className="cs-dictionary-review__intro"><span className="cs-pill is-warning">Chờ duyệt danh sách</span><span>{total} từ · {sentences.filter(sentence => sentence.candidates.length).length} câu</span><small>Chọn chữ trong nội dung gốc để thêm vào đúng câu.</small></div>
    <div className="cs-dictionary-review__groups">{sentences.map((sentence, si) => <section key={sentence.id}>
      <header><span>Câu {pad(sentence.position)}</span><p>{sentence.text}</p><small>{sentence.candidates.length} từ</small></header>
      <div className="cs-dictionary-chips">{sentence.candidates.map((candidate, ci) => editing?.[0] === si && editing?.[1] === ci
        ? <input key={`${candidate.id || 'new'}-${ci}`} autoFocus value={candidate.chunk} onBlur={() => setEditing(null)} onChange={event => change(si, ci, event.target.value)} />
        : <button type="button" key={`${candidate.id || 'new'}-${ci}`} className={candidate.status === 'needs_review' ? 'is-warning' : ''} onClick={() => canEdit && setEditing([si, ci])}>{candidate.chunk || 'Nhập từ'}{canEdit && <X onClick={event => { event.stopPropagation(); remove(si, ci); }} />}</button>)}
        {canEdit && <button type="button" className="cs-dictionary-chip-add" onClick={() => add(si)}><Plus /> Thêm từ</button>}
      </div>
    </section>)}</div>
    <footer>{canEdit && <Button variant="outline" loading={saving} onClick={save}>Lưu danh sách</Button>}{canGenerate && <Button icon={<WandSparkles />} loading={generating} disabled={!total} onClick={generate}>Tạo từ điển ({total} từ · {sentences.filter(sentence => sentence.candidates.length).length} câu)</Button>}</footer>
  </div>;
}

function Entries({ state, drafts, setDraft, clearDraft, canEdit, canGenerate, onReload, notify, onReview, activeId, onActive }) {
  const all = useMemo(() => state.sentences.flatMap(sentence => sentence.candidates.map(candidate => ({ ...candidate, sentence }))), [state]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(false);
  const filtered = all.filter(candidate => {
    const content = drafts[candidate.id] || candidate.entry?.content || {};
    const matches = `${candidate.chunk} ${content.lemma || ''} ${content.meaningVi || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    if (!matches) return false;
    if (filter === 'review') return candidate.status === 'needs_review';
    if (filter === 'word') return !candidate.chunk.trim().includes(' ');
    if (filter === 'phrase') return candidate.chunk.trim().includes(' ');
    return true;
  });
  const selected = all.find(candidate => candidate.id === activeId) || filtered[0] || all[0];
  useEffect(() => { if (selected && selected.id !== activeId) onActive(selected.id); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!selected) return <EmptyState title="Chưa có mục từ" description="Hãy quay lại danh sách và thêm từ cần tạo." />;
  const content = drafts[selected.id] || selected.entry?.content || { inText: selected.chunk, sentence: selected.sentence.text, example: {}, collocations: [], synonyms: [], wordFamily: [] };
  const patch = value => setDraft(selected.id, { ...content, ...value, sentence: selected.sentence.text });
  const index = all.findIndex(candidate => candidate.id === selected.id);
  const remove = async () => {
    try { await deleteDictionaryCandidate(selected.id); clearDraft(selected.id); onActive(null); await onReload(); notify('Đã xoá mục từ.', 'success'); }
    catch (error) { notify(errorMessage(error, 'Không thể xoá mục từ.'), 'error'); }
  };
  const regenerate = async () => {
    try { await regenerateDictionaryEntry(selected.id); await onReload(); notify('Đã đưa mục từ vào hàng chờ tạo lại.', 'success'); }
    catch (error) { notify(errorMessage(error, 'Không thể tạo lại mục từ.'), 'error'); }
  };
  const filters = [['all', 'Tất cả', all.length], ['review', 'Cần xem', all.filter(item => item.status === 'needs_review').length], ['word', 'Từ đơn', all.filter(item => !item.chunk.includes(' ')).length], ['phrase', 'Cụm từ', all.filter(item => item.chunk.includes(' ')).length]];
  const fields = [
    ['Dạng trong bài', 'inText'], ['Từ (dạng từ điển)', 'lemma'], ['Loại từ', 'pos', 'select'], ['IPA', 'ipa'], ['Nghĩa tiếng Việt', 'meaningVi'], ['Định nghĩa tiếng Anh', 'meaningEn'], ['Câu gốc', 'sentence'], ['Ngữ cảnh', 'context'], ['Ví dụ', 'example.en'], ['Dịch ví dụ', 'example.vi'], ['Collocations', 'collocations', 'list'], ['Đồng nghĩa', 'synonyms', 'list'], ['Word family', 'wordFamily', 'list'],
  ];
  const fieldValue = path => path.includes('.') ? content[path.split('.')[0]]?.[path.split('.')[1]] : content[path];
  const fieldPatch = (path, value) => path.includes('.')
    ? patch({ [path.split('.')[0]]: { ...(content[path.split('.')[0]] || {}), [path.split('.')[1]]: value } }) : patch({ [path]: value });
  return <div className="cs-dictionary-entries">
    <div className="cs-dictionary-entries__bar"><span className={`cs-pill is-${state.status === 'needs_review' ? 'warning' : 'success'}`}>{state.status === 'needs_review' ? 'Cần xem lại' : 'Hoàn tất'}</span><span>{all.length} mục · {state.sentences.length} câu · AI</span><span /><Button variant="outline" size="sm" onClick={onReview}>Sửa danh sách từ</Button></div>
    <div className="cs-dictionary-split">
      <aside><label className="cs-dictionary-search"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Tìm trong ${all.length} mục…`} /></label>
        <div className="cs-dictionary-filters">{filters.map(([value, label, count]) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label} {count}</button>)}</div>
        <ul>{filtered.map(candidate => { const value = drafts[candidate.id] || candidate.entry?.content || {}; return <li key={candidate.id}><button type="button" className={`${candidate.id === selected.id ? 'is-active' : ''} ${candidate.status === 'needs_review' ? 'is-warning' : ''}`} onClick={() => { onActive(candidate.id); setEditing(false); }}><span><strong>{value.lemma || candidate.chunk}</strong><em>{value.pos || (candidate.chunk.includes(' ') ? 'Phrase' : '')}</em><i className={`is-${candidate.status}`}>{candidate.status === 'needs_review' ? <AlertTriangle /> : <Check />}{STATUS_LABEL[candidate.status]}</i></span><small>{value.ipa ? `${value.ipa} · ` : ''}câu {pad(candidate.sentence.position)}</small><p>{value.meaningVi || candidate.error || 'Chưa có nội dung'}</p></button></li>; })}</ul>
      </aside>
      <article className="cs-dictionary-detail"><header><div><h2>{content.lemma || selected.chunk}</h2><span>{content.pos || (selected.chunk.includes(' ') ? 'Phrase' : '')}</span><em className={`is-${selected.status}`}>{STATUS_LABEL[selected.status]}</em></div><div><small>{content.ipa ? `${content.ipa} · ` : ''}trong bài: “{content.inText || selected.chunk}” · câu {pad(selected.sentence.position)}</small><span />{canEdit && <Button variant="outline" size="sm" icon={<Pencil />} onClick={() => setEditing(value => !value)}>{editing ? 'Xong' : 'Sửa'}</Button>}{canGenerate && <Button variant="outline" size="sm" icon={<RefreshCw />} disabled={BUSY.includes(selected.status)} onClick={regenerate}>Tạo lại</Button>}{canEdit && <button type="button" className="cs-icon-btn" aria-label="Xoá mục" onClick={remove}><Trash2 /></button>}</div></header>
        <div>{fields.map(([label, path, kind], fieldIndex) => <EntryField key={path} number={fieldIndex + 1} label={label} value={fieldValue(path)} kind={kind} editing={editing && path !== 'sentence'} tone={path === 'meaningVi' ? 'accent' : ''} onChange={value => fieldPatch(path, value)} />)}</div>
        <footer><button type="button" disabled={!all[index - 1]} onClick={() => onActive(all[index - 1]?.id)}><ChevronLeft />{all[index - 1]?.entry?.content?.lemma || all[index - 1]?.chunk || 'Trước'}</button><button type="button" disabled={!all[index + 1]} onClick={() => onActive(all[index + 1]?.id)}>{all[index + 1]?.entry?.content?.lemma || all[index + 1]?.chunk || 'Tiếp'}<ChevronRight /></button></footer>
      </article>
    </div>
  </div>;
}

export default function DictionaryPanel({ itemId, canEdit, canGenerate, drafts, setDraft, clearDraft, reloadKey, selectedText, onConsumed, activeId, onActive, notify, onState }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [showReview, setShowReview] = useState(false);
  const load = async () => {
    try { const next = await getDictionary(itemId); setState(next); onState(next); setError(''); }
    catch (requestError) { setError(errorMessage(requestError, 'Không thể tải từ điển.')); }
  };
  useEffect(() => { load(); }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (reloadKey) load(); }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state || state.status !== 'generating') return undefined;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [state?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <div className="cs-dictionary-empty"><p>{error}</p><Button variant="outline" onClick={load}>Thử lại</Button></div>;
  if (!state) return <div className="cs-dictionary-empty"><Spinner label="Đang tải từ điển…" /></div>;
  if (!state.sentences.length) return <div className="cs-dictionary-empty"><EmptyState title="Chưa bóc danh sách từ" description="Bóc từ theo từng câu, sau đó duyệt danh sách trước khi tạo mục từ." action={canGenerate ? <Button icon={<WandSparkles />} onClick={async () => { try { await extractDictionary(itemId); await load(); } catch (requestError) { notify(errorMessage(requestError, 'Không thể bóc từ.'), 'error'); } }}>Bóc từ</Button> : null} /></div>;
  if (state.status === 'generating') return <div className="cs-dictionary-generating"><Spinner label={state.counts.total ? 'Đang tạo từ điển…' : 'Đang bóc danh sách từ…'} /><strong>{state.counts.total ? `${(state.counts.ready || 0) + (state.counts.needs_review || 0)}/${state.counts.total} mục đã xong` : 'AI đang xác định từ và cụm từ theo từng câu'}</strong><p>{state.sentences.filter(sentence => BUSY.includes(sentence.status)).length} câu đang xử lý</p></div>;
  const review = showReview || state.status === 'waiting_review';
  return review
    ? <ReviewList state={state} canEdit={canEdit} canGenerate={canGenerate} selectedText={selectedText} onConsumed={onConsumed} onReload={async () => { setShowReview(false); await load(); }} notify={notify} />
    : <Entries state={state} drafts={drafts} setDraft={setDraft} clearDraft={clearDraft} canEdit={canEdit} canGenerate={canGenerate} onReload={load} notify={notify} onReview={() => setShowReview(true)} activeId={activeId} onActive={onActive} />;
}
