import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Input } from '../primitives/Primitives';
import '../components.css';

export function KeyValueEditor({ label = 'Key value pairs', value = [], onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }) {
  const update = (index, field, next) => onChange?.(value.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: next } : row));
  return <div className="iig3-key-value" role="group" aria-label={label}>{value.map((row, index) => <div className="iig3-key-value__row" key={row.id || index}><Input aria-label={`Key ${index + 1}`} placeholder={keyPlaceholder} value={row.key} onChange={event => update(index, 'key', event.target.value)} /><Input aria-label={`Value ${index + 1}`} placeholder={valuePlaceholder} value={row.value} onChange={event => update(index, 'value', event.target.value)} /><IconButton label={`Remove row ${index + 1}`} onClick={() => onChange?.(value.filter((_, rowIndex) => rowIndex !== index))}><Trash2 /></IconButton></div>)}<div><Button type="button" variant="outline" size="sm" icon={<Plus />} onClick={() => onChange?.([...value, { id: crypto.randomUUID(), key: '', value: '' }])}>Add row</Button></div></div>;
}
