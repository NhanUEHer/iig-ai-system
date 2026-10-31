import React, { useEffect, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { IconButton, Input } from '../primitives/Primitives';
import '../components.css';

export function InlineEdit({ value, onSave, label = 'Edit value' }) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(value); const ref = useRef(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  if (!editing) return <div className="iig3-inline-edit"><button type="button" className="iig3-inline-edit__value" onClick={() => { setDraft(value); setEditing(true); }}>{value}</button><IconButton label={label} size="sm" onClick={() => setEditing(true)}><Pencil /></IconButton></div>;
  return <div className="iig3-inline-edit"><Input ref={ref} aria-label={label} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { onSave?.(draft); setEditing(false); } if (event.key === 'Escape') setEditing(false); }} /><IconButton label="Save" size="sm" onClick={() => { onSave?.(draft); setEditing(false); }}><Check /></IconButton><IconButton label="Cancel" size="sm" onClick={() => setEditing(false)}><X /></IconButton></div>;
}
