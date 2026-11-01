import React, { useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Input } from '../primitives/Primitives';
import FloatingPortal from '../../../components/common/FloatingPortal';
import '../components.css';

export function Combobox({ label = 'Select option', options = [], value, onChange, placeholder = 'Search…', disabled = false }) {
  const id = useId(); const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const visible = useMemo(() => options.filter(option => option.label.toLowerCase().includes(query.toLowerCase())), [options, query]);
  return <div ref={rootRef} className="iig3-combobox"><Input role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-autocomplete="list" value={query} placeholder={placeholder} disabled={disabled} suffix={<ChevronDown />} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }} /><FloatingPortal open={open} anchorRef={rootRef} onDismiss={() => setOpen(false)} matchAnchorWidth id={id} role="listbox" className="iig3-theme iig3-combobox__list">{visible.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onMouseDown={event => event.preventDefault()} onClick={() => { onChange?.(option.value); setQuery(option.label); setOpen(false); }}>{option.label}{option.value === value && <Check aria-hidden="true" />}</button>)}</FloatingPortal></div>;
}
