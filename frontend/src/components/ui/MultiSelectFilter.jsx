import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import './multi-select-filter.css';
import './multi-select-filter-overrides.css';

export default function MultiSelectFilter({ options = [], value = [], onApply, placeholder = 'Chọn bộ lọc', searchPlaceholder = 'Tìm kiếm...', allLabel, selectedLabel, single = false, disabled = false, className = '' }) {
  const root = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedValues = useMemo(() => single ? (value ? [value] : []) : value, [single, value]);
  const [draft, setDraft] = useState(selectedValues);
  const [query, setQuery] = useState('');
  useEffect(() => { if (!open) setDraft(selectedValues); }, [value, open, single]);
  useEffect(() => { const close = event => !root.current?.contains(event.target) && setOpen(false); document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const shown = useMemo(() => options.filter(item => item.label.toLowerCase().includes(query.toLowerCase())), [options, query]);
  const allChecked = shown.length > 0 && shown.every(item => draft.includes(item.value));
  const toggle = item => setDraft(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item]);
  const toggleAll = () => setDraft(allChecked ? current => current.filter(item => !shown.some(option => option.value === item)) : current => [...new Set([...current, ...shown.map(item => item.value)])]);
  const selectedOption = single ? options.find(option => option.value === value) : null;
  const title = single ? (selectedOption?.label || placeholder) : selectedValues.length ? `${selectedLabel || placeholder} (${selectedValues.length})` : placeholder;
  return <div className={`ui-filter-multiselect${single ? ' is-single' : ''}${disabled ? ' is-disabled' : ''}${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`} ref={root}>
    <button type="button" className="ui-filter-multiselect__trigger" disabled={disabled} onClick={() => setOpen(current => !current)} aria-expanded={open}>
      <span>{!single && selectedValues.length > 0 && <i />}{title}</span><ChevronDown />
    </button>
    {open && <div className="ui-filter-multiselect__menu">
      <div className="ui-filter-multiselect__search"><Search /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={searchPlaceholder} />{query && <button type="button" onClick={() => setQuery('')}><X /></button>}</div>
      <div className="ui-filter-multiselect__options">
        {!single && <label className="ui-filter-multiselect__option ui-filter-multiselect__all"><input type="checkbox" checked={allChecked} onChange={toggleAll} /><span>{allLabel || `Tất cả ${placeholder.toLowerCase()}`}</span>{options.some(item => item.count != null) && <b>{options.reduce((total, item) => total + (item.count || 0), 0)}</b>}</label>}
        {shown.map(option => single
          ? <label className={`ui-filter-multiselect__option ui-filter-multiselect__single-option${value === option.value ? ' is-selected' : ''}`} key={option.value}><input type="radio" name="single-filter-option" checked={value === option.value} onChange={() => { onApply(option.value); setQuery(''); setOpen(false); }} /><span>{option.label}</span>{value === option.value && <span className="ui-filter-multiselect__check" aria-hidden="true">✓</span>}</label>
          : <label className={`ui-filter-multiselect__option${draft.includes(option.value) ? ' is-selected' : ''}`} key={option.value}><input type="checkbox" checked={draft.includes(option.value)} onChange={() => toggle(option.value)} /><span>{option.label}</span>{option.count != null && <b>{option.count}</b>}</label>)}
      </div>
      {!single && <footer><button type="button" onClick={() => setDraft([])}>Xóa chọn</button><button type="button" onClick={() => { onApply(draft); setOpen(false); }}>Áp dụng ({draft.length})</button></footer>}
    </div>}
  </div>;
}
