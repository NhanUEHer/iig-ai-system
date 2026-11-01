import React, { useId, useRef, useState } from 'react';
import { Check, Columns3 } from 'lucide-react';
import { Button } from '../primitives/Primitives';
import FloatingPortal from '../../../components/common/FloatingPortal';
import '../components.css';

export function ColumnVisibilityMenu({ columns = [], visibleKeys = [], onChange, requiredKeys = [], label = 'Cột', resetLabel = 'Mặc định' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const required = new Set(requiredKeys);
  const toggle = key => onChange?.(visibleKeys.includes(key) ? visibleKeys.filter(item => item !== key) : [...visibleKeys, key]);
  return <div className="iig3-column-visibility" ref={rootRef}><Button variant="outline" size="sm" icon={<Columns3 />} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(current => !current)}>{label}</Button><FloatingPortal open={open} anchorRef={rootRef} onDismiss={() => setOpen(false)} align="end" minWidth={240} id={menuId} role="menu" className="iig3-theme iig3-column-visibility__popover"><header><strong>Hiển thị cột</strong><button type="button" onClick={() => onChange?.(columns.map(column => column.key))}>{resetLabel}</button></header>{columns.map(column => <button type="button" role="menuitemcheckbox" aria-checked={visibleKeys.includes(column.key)} disabled={required.has(column.key)} key={column.key} onClick={() => toggle(column.key)}><i>{visibleKeys.includes(column.key) && <Check />}</i><span>{column.label}</span></button>)}</FloatingPortal></div>;
}
