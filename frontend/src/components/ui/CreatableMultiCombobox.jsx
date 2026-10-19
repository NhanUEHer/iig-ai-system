import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import './creatable-multi-combobox.css';

export default function CreatableMultiCombobox({ options = [], value = [], onChange, onCreate, placeholder = 'Chọn...', searchPlaceholder = 'Tìm kiếm...', createLabel = 'Thêm mới', emptyLabel = 'Không tìm thấy dữ liệu.', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const normalized = query.trim().toLocaleLowerCase('vi');
  const filtered = useMemo(() => options.filter(option => String(option.label).toLocaleLowerCase('vi').includes(normalized)), [normalized, options]);
  const selected = options.filter(option => value.includes(option.value));
  const exact = options.some(option => String(option.label).trim().toLocaleLowerCase('vi') === normalized);
  const toggle = item => onChange?.(value.includes(item) ? value.filter(current => current !== item) : [...value, item]);
  const create = async () => {
    if (!normalized || exact || creating || !onCreate) return;
    setCreating(true);
    try { await onCreate(query.trim()); setQuery(''); } catch { /* Caller owns the user-facing error. */ } finally { setCreating(false); }
  };

  return <div className={`ui-creatable-multi${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`} ref={root}>
    <button className="ui-creatable-multi__trigger" type="button" disabled={disabled} onClick={() => setOpen(current => !current)}>
      <span className={selected.length ? '' : 'placeholder'}>{selected.length ? selected.map(item => item.label).join(', ') : placeholder}</span>
      <ChevronDown />
    </button>
    {open && <div className="ui-creatable-multi__panel">
      <label className="ui-creatable-multi__search"><Search /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={searchPlaceholder} /></label>
      <div className="ui-creatable-multi__options">
        {filtered.map(option => <button type="button" key={option.value} className={value.includes(option.value) ? 'selected' : ''} onClick={() => toggle(option.value)}><span>{option.label}</span>{value.includes(option.value) && <Check />}</button>)}
        {!filtered.length && <p>{emptyLabel}</p>}
      </div>
      {onCreate && <button className="ui-creatable-multi__add" type="button" disabled={!normalized || exact || creating} onClick={create}><Plus />{creating ? 'Đang thêm...' : `${createLabel} “${query.trim()}”`}</button>}
    </div>}
  </div>;
}
