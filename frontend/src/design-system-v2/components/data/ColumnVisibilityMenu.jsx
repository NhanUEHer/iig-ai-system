import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Columns3 } from 'lucide-react';
import { Button } from '../primitives/Primitives';
import '../components.css';

export function ColumnVisibilityMenu({ columns = [], visibleKeys = [], onChange, requiredKeys = [], label = 'Cột', resetLabel = 'Mặc định' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const required = new Set(requiredKeys);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const keyboard = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
  }, [open]);
  const toggle = key => onChange?.(visibleKeys.includes(key) ? visibleKeys.filter(item => item !== key) : [...visibleKeys, key]);
  return <div className="iig3-column-visibility" ref={rootRef}><Button variant="outline" size="sm" icon={<Columns3 />} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(current => !current)}>{label}</Button>{open && <section id={menuId} role="menu"><header><strong>Hiển thị cột</strong><button type="button" onClick={() => onChange?.(columns.map(column => column.key))}>{resetLabel}</button></header>{columns.map(column => <button type="button" role="menuitemcheckbox" aria-checked={visibleKeys.includes(column.key)} disabled={required.has(column.key)} key={column.key} onClick={() => toggle(column.key)}><i>{visibleKeys.includes(column.key) && <Check />}</i><span>{column.label}</span></button>)}</section>}</div>;
}
