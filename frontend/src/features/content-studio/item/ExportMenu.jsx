import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { Button } from '../../../design-system-v2';
import { errorMessage, exportItem } from '../../../services/contentStudioService';

// Each option lists the file formats; `ready` says whether that part has content to export.
export default function ExportMenu({ itemId, options, showMsg }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const run = async (kind, format) => {
    setBusy(`${kind}.${format}`);
    try {
      const result = await exportItem(itemId, kind, format);
      showMsg?.(result.skipped ? `Đã xuất ${result.name} · bỏ qua ${result.skipped} mục chưa hoàn tất.` : `Đã xuất ${result.name}.`, 'success');
      setOpen(false);
    } catch (error) {
      let message = 'Không thể xuất file.';
      try { message = JSON.parse(await error?.response?.data?.text?.())?.error || message; } catch { message = errorMessage(error, message); }
      showMsg?.(message, 'error');
    } finally { setBusy(''); }
  };

  return <div className="cs-export" ref={ref}>
    <Button variant="outline" icon={<Download />} onClick={() => setOpen(value => !value)} aria-expanded={open}>Xuất <ChevronDown className="cs-export__caret" /></Button>
    {open && <div className="cs-export__menu" role="menu">
      {options.map(option => <div key={option.kind} className={`cs-export__row${option.ready ? '' : ' is-disabled'}`}>
        <div><strong>{option.label}</strong><small>{option.ready ? option.hint : option.reason}</small></div>
        <span>{option.formats.map(format => <button type="button" role="menuitem" key={format} disabled={!option.ready || Boolean(busy)}
          onClick={() => run(option.kind, format)}>{busy === `${option.kind}.${format}` ? '…' : format.toUpperCase()}</button>)}</span>
      </div>)}
    </div>}
  </div>;
}
