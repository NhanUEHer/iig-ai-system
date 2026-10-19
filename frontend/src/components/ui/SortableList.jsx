import React, { useState } from 'react';
import { GripVertical } from 'lucide-react';
import './sortable-list.css';

export function SortableList({ items = [], onChange, renderItem, getKey = item => item.id, disabled = false, className = '' }) {
  const [dragKey, setDragKey] = useState(null); const [overKey, setOverKey] = useState(null);
  const move = targetKey => { if (disabled || dragKey == null || targetKey == null || dragKey === targetKey) return; const from = items.findIndex(item => String(getKey(item)) === String(dragKey)); const to = items.findIndex(item => String(getKey(item)) === String(targetKey)); if (from < 0 || to < 0) return; const next = [...items]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); onChange?.(next); };
  return <div className={`ui-sortable-list ${className}`} onDragEnd={() => { setDragKey(null); setOverKey(null); }}>{items.map((item, index) => { const key = String(getKey(item)); return <div key={key} draggable={!disabled} className={`ui-sortable-item${dragKey === key ? ' is-dragging' : ''}${overKey === key ? ' is-over' : ''}`} onDragStart={() => setDragKey(key)} onDragOver={event => { event.preventDefault(); setOverKey(key); }} onDrop={event => { event.preventDefault(); move(key); }}><button type="button" className="ui-sortable-handle" disabled={disabled} aria-label={`Kéo mục ${index + 1}`}><GripVertical /></button><div className="ui-sortable-content">{renderItem ? renderItem(item, index) : item.label}</div></div>; })}</div>;
}
