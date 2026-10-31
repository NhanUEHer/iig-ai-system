import React, { useState } from 'react';
import { X } from 'lucide-react';
import '../components.css';

export function MultiSelect({ label = 'Selected values', options = [], value = [], onChange, placeholder = 'Add value' }) {
  const [query, setQuery] = useState('');
  const add = candidate => { if (candidate && !value.includes(candidate)) onChange?.([...value, candidate]); setQuery(''); };
  return <div className="iig3-token-list" role="group" aria-label={label}>{value.map(item => <span key={item}>{options.find(option => option.value === item)?.label || item}<button type="button" aria-label={`Remove ${item}`} onClick={() => onChange?.(value.filter(entry => entry !== item))}><X size={12} /></button></span>)}<input value={query} placeholder={placeholder} list={`${label}-options`} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(query); } }} /><datalist id={`${label}-options`}>{options.filter(option => !value.includes(option.value)).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist></div>;
}
