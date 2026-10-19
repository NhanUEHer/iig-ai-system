import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X, Minus } from 'lucide-react';
import './advanced-form.css';
import './form-overrides.css';

export function Checkbox({ checked = false, indeterminate = false, label, onChange, disabled = false }) {
  return <label className={`ui-check${disabled ? ' is-disabled' : ''}`}><button type="button" role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} disabled={disabled} className={`ui-check__box${checked ? ' is-checked' : ''}${indeterminate ? ' is-indeterminate' : ''}`} onClick={() => onChange?.(!checked)}>{checked ? <Check /> : indeterminate ? <Minus /> : null}</button>{label && <span>{label}</span>}</label>;
}

export function Radio({ checked = false, label, onChange, disabled = false }) {
  return <label className={`ui-radio${disabled ? ' is-disabled' : ''}`}><button type="button" role="radio" aria-checked={checked} disabled={disabled} className={`ui-radio__box${checked ? ' is-checked' : ''}`} onClick={() => onChange?.()}>{checked && <span />}</button>{label && <span>{label}</span>}</label>;
}

export function RadioGroup({ options = [], value, onChange, name = 'radio-group' }) {
  return <div className="ui-radio-group" role="radiogroup">{options.map(option => <Radio key={option.value} checked={value === option.value} label={option.label} disabled={option.disabled} onChange={() => onChange?.(option.value)} />)}</div>;
}

export function Switch({ checked = false, onChange, label, disabled = false }) {
  return <label className={`ui-switch-field${disabled ? ' is-disabled' : ''}`}><button type="button" role="switch" aria-checked={checked} disabled={disabled} className={`ui-switch${checked ? ' is-on' : ''}`} onClick={() => onChange?.(!checked)}><span /></button>{label && <span>{label}</span>}</label>;
}

export function InputGroup({ prefix, suffix, children }) {
  return <div className="ui-input-group">{prefix && <span>{prefix}</span>}{children}{suffix && <span>{suffix}</span>}</div>;
}

export function InputNumber({ value = 0, min, max, step = 1, onChange, ...props }) {
  const change = next => { const number = Number(next); if (Number.isNaN(number)) return; if (min != null && number < min) return; if (max != null && number > max) return; onChange?.(number); };
  return <div className="ui-number"><input type="number" value={value} min={min} max={max} step={step} onChange={event => change(event.target.value)} {...props} /><div><button type="button" onClick={() => change(Number(value) - step)} disabled={min != null && value <= min}>−</button><button type="button" onClick={() => change(Number(value) + step)} disabled={max != null && value >= max}>+</button></div></div>;
}

function filterOptions(options, query) { return options.filter(option => String(option.label).toLowerCase().includes(query.toLowerCase())); }

export function Combobox({ options = [], value, onChange, placeholder = 'Chọn...', searchable = true, creatable = false, onCreate, loading = false, disabled = false }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const selected = options.find(option => option.value === value);
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);
  return <div className={`ui-combobox${open ? ' is-open' : ''}`}><button type="button" className="ui-combobox__trigger" disabled={disabled} onClick={() => setOpen(!open)}><span>{selected?.label || placeholder}</span><ChevronDown /></button>{open && <div className="ui-combobox__menu">{searchable && <div className="ui-combobox__search"><Search /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm kiếm..." /></div>}{loading ? <div className="ui-combobox__empty">Đang tải...</div> : filtered.length ? filtered.map(option => <button type="button" key={option.value} className={value === option.value ? 'is-selected' : ''} onClick={() => { onChange?.(option.value); setOpen(false); }}>{option.label}{value === option.value && <Check />}</button>) : <div className="ui-combobox__empty">Không có dữ liệu</div>}{creatable && query && !filtered.some(option => option.label.toLowerCase() === query.toLowerCase()) && <button type="button" className="ui-combobox__create" onClick={() => { onCreate?.(query); setOpen(false); }}>+ Tạo “{query}”</button>}</div>}</div>;
}

export function MultiSelect({ options = [], value = [], onChange, placeholder = 'Chọn...', searchable = true, selectAll = false, creatable = false, onCreate, createLabel = 'Thêm', disabled = false }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const filtered = filterOptions(options, query); const selected = options.filter(option => value.includes(option.value));
  const toggle = item => onChange?.(value.includes(item) ? value.filter(v => v !== item) : [...value, item]);
  const canCreate = creatable && query.trim() && !options.some(option => String(option.label).toLowerCase() === query.trim().toLowerCase());
  return <div className={`ui-multiselect${open ? ' is-open' : ''}`}><button type="button" className="ui-multiselect__trigger" disabled={disabled} onClick={() => setOpen(!open)}><span className="ui-multiselect__values">{selected.length ? selected.map(item => <span className="ui-multiselect__tag" key={item.value}>{item.label}<X onClick={event => { event.stopPropagation(); toggle(item.value); }} /></span>) : <span className="ui-multiselect__placeholder">{placeholder}</span>}</span><ChevronDown /></button>{open && <div className="ui-multiselect__menu">{searchable && <div className="ui-combobox__search"><Search /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm kiếm..." /></div>}{selectAll && <Checkbox label="Chọn tất cả" checked={filtered.length > 0 && filtered.every(item => value.includes(item.value))} indeterminate={filtered.some(item => value.includes(item.value)) && !filtered.every(item => value.includes(item.value))} onChange={() => { const ids = filtered.map(item => item.value); onChange?.(ids.every(id => value.includes(id)) ? value.filter(id => !ids.includes(id)) : [...new Set([...value, ...ids])]); }} />}{filtered.length ? filtered.map(item => <Checkbox key={item.value} label={item.label} checked={value.includes(item.value)} onChange={() => toggle(item.value)} />) : <div className="ui-combobox__empty">Không tìm thấy dữ liệu</div>}{canCreate && <button type="button" className="ui-combobox__create" onClick={async () => { await onCreate?.(query.trim()); setQuery(''); }}>{createLabel} “{query.trim()}”</button>}</div>}</div>;
}

export function TagInput({ value = [], onChange, placeholder = 'Nhập tag và nhấn Enter', disabled = false }) { const [text, setText] = useState(''); const add = () => { const tag = text.trim(); if (tag && !value.includes(tag)) onChange?.([...value, tag]); setText(''); }; return <div className="ui-tag-input"><div className="ui-tag-input__tags">{value.map(tag => <span key={tag}>{tag}<button type="button" onClick={() => onChange?.(value.filter(item => item !== tag))} aria-label={`Xóa ${tag}`}><X /></button></span>)}<input value={text} disabled={disabled} placeholder={value.length ? '' : placeholder} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); } }} onBlur={add} /></div></div>; }
export function RadioCard({ checked, label, description, onChange, disabled = false }) { return <button type="button" role="radio" aria-checked={checked} disabled={disabled} className={`ui-radio-card${checked ? ' is-checked' : ''}`} onClick={onChange}><span className="ui-radio-card__indicator" /> <span><strong>{label}</strong>{description && <small>{description}</small>}</span></button>; }
export function FormSection({ title, description, children, collapsible = false, defaultOpen = true }) { const [open, setOpen] = useState(defaultOpen); return <section className="ui-form-section"><header><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{collapsible && <button type="button" onClick={() => setOpen(!open)}>{open ? 'Thu gọn' : 'Mở rộng'}</button>}</header>{open && <div>{children}</div>}</section>; }
