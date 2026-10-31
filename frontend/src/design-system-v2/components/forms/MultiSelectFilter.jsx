import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Button } from '../primitives/Primitives';
import '../components.css';

export function MultiSelectFilter({
  label, options = [], value = [], onChange, placeholder = 'Tất cả',
  searchPlaceholder = 'Tìm kiếm…', allLabel = 'Tất cả', disabled = false,
  loading = false, applyLabel = 'Áp dụng', clearLabel = 'Xóa',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(value);
  const rootRef = useRef(null);
  const listId = useId();
  const visible = useMemo(() => options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase())), [options, query]);
  const selectedLabels = value.map(item => options.find(option => option.value === item)?.label).filter(Boolean);
  const display = value.length === 0 ? placeholder : value.length === 1 ? selectedLabels[0] : `${label || placeholder} (${value.length})`;
  const close = apply => {
    if (apply) onChange?.(draft);
    else setDraft(value);
    setQuery('');
    setOpen(false);
  };
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = () => { setDraft(value); setQuery(''); setOpen(false); };
    const outside = event => { if (!rootRef.current?.contains(event.target)) dismiss(); };
    const keyboard = event => { if (event.key === 'Escape') dismiss(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
  }, [open, value]);
  const toggle = candidate => setDraft(current => current.includes(candidate) ? current.filter(item => item !== candidate) : [...current, candidate]);
  const allValues = options.map(option => option.value);
  const allSelected = allValues.length > 0 && allValues.every(candidate => draft.includes(candidate));
  const toggleAll = () => setDraft(allSelected ? [] : allValues);
  return <div className="iig3-multiselect-filter" ref={rootRef}>
    <button type="button" className="iig3-multiselect-filter__trigger" disabled={disabled || loading} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => { setDraft(value); setOpen(current => !current); }}><span>{display}</span><ChevronDown aria-hidden="true" /></button>
    {open && <section className="iig3-multiselect-filter__popover">
      <label className="iig3-multiselect-filter__search"><Search aria-hidden="true" /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />{query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}><X /></button>}</label>
      <div id={listId} role="listbox" aria-label={label || placeholder} aria-multiselectable="true">
        {loading ? <p>Đang tải…</p> : visible.length === 0 ? <p>Không có lựa chọn phù hợp.</p> : visible.map(option => <button type="button" role="option" aria-selected={draft.includes(option.value)} key={option.value} onClick={() => toggle(option.value)}><i>{draft.includes(option.value) && <Check />}</i><span>{option.label}</span>{option.count != null && <small>{option.count}</small>}</button>)}
      </div>
      <footer><button type="button" onClick={() => setDraft([])}>{clearLabel}</button><button type="button" className="iig3-multiselect-filter__all" aria-pressed={allSelected} onClick={toggleAll}>{allLabel}</button><Button size="sm" onClick={() => close(true)}>{applyLabel}</Button></footer>
    </section>}
  </div>;
}
