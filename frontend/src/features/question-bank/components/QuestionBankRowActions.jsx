import React, { useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { IconButton } from '../../../components/ui/Button';
import FloatingPortal from '../../../components/common/FloatingPortal';

export default function QuestionBankRowActions({ actions = [] }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  return <div ref={root} className="question-bank-row-menu">
    <IconButton size="sm" aria-label="Thao tác" title="Thao tác" onClick={() => setOpen(current => !current)}><MoreVertical /></IconButton>
    <FloatingPortal open={open} anchorRef={root} onDismiss={() => setOpen(false)} align="end" minWidth={132} className="question-bank-row-menu__popup">{actions.map(action => <button key={action.label} type="button" className={action.danger ? 'is-danger' : ''} disabled={action.disabled} onClick={() => { setOpen(false); action.onClick?.(); }}>{action.icon}{action.label}</button>)}</FloatingPortal>
  </div>;
}
