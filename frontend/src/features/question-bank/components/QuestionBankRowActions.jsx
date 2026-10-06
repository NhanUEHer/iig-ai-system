import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { IconButton } from '../../../components/ui/Button';

export default function QuestionBankRowActions({ actions = [] }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => !root.current?.contains(event.target) && setOpen(false);
    const closeWithEscape = event => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  return <div ref={root} className="question-bank-row-menu">
    <IconButton size="sm" aria-label="Thao tác" title="Thao tác" onClick={() => setOpen(current => !current)}><MoreVertical /></IconButton>
    {open && <div>{actions.map(action => <button key={action.label} type="button" className={action.danger ? 'is-danger' : ''} disabled={action.disabled} onClick={() => { setOpen(false); action.onClick?.(); }}>{action.icon}{action.label}</button>)}</div>}
  </div>;
}
