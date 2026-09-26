import React from 'react';
import { X } from 'lucide-react';
import './ui.css';

export default function Chip({ tone = 'default', removable = false, onRemove, children, className = '' }) {
  return <span className={['ui-chip', tone !== 'default' && `ui-chip--${tone}`, className].filter(Boolean).join(' ')}>
    {children}
    {removable && <button type="button" className="ui-chip__remove" aria-label="Xóa" onClick={onRemove}><X /></button>}
  </span>;
}
