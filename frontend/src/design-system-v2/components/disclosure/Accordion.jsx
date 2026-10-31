import React, { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import '../components.css';

export function Accordion({ items = [], multiple = false, defaultOpen = [] }) {
  const baseId = useId(); const [open, setOpen] = useState(defaultOpen);
  const toggle = id => setOpen(current => current.includes(id) ? current.filter(item => item !== id) : multiple ? [...current, id] : [id]);
  return <div className="iig3-accordion">{items.map(item => { const expanded = open.includes(item.id); const panelId = `${baseId}-${item.id}`; return <section className="iig3-accordion__item" key={item.id}><button type="button" className="iig3-accordion__trigger" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggle(item.id)}>{item.title}{expanded ? <ChevronDown /> : <ChevronRight />}</button>{expanded && <div className="iig3-accordion__panel" id={panelId}>{item.content}</div>}</section>; })}</div>;
}
