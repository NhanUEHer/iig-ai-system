import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Circle, Clock3, Copy, Search, X } from 'lucide-react';
import { Button, IconButton, Input } from '../primitives/Primitives';
import { Badge, StatusBadge } from '../navigation/Navigation';
import './workflow.css';

const cx = (...names) => names.filter(Boolean).join(' ');

export function DateRangePicker({ from, to, onChange, presets = ['Today', '7 days', '30 days'], placeholder = 'Select date range', fromLabel = 'From', toLabel = 'To', cancelLabel = 'Cancel', applyLabel = 'Apply range' }) {
  const [open, setOpen] = useState(false);
  const display = from || to ? `${from || '…'} → ${to || '…'}` : placeholder;
  return <div className="iig3-date-range"><button type="button" onClick={() => setOpen(value => !value)}><Clock3 /><span>{display}</span><ChevronDown /></button>{open && <div className="iig3-date-range__panel"><header>{presets.map(item => <button type="button" key={item}>{item}</button>)}</header><label>{fromLabel}<input type="date" value={from} onChange={event => onChange?.({ from: event.target.value, to })} /></label><label>{toLabel}<input type="date" value={to} onChange={event => onChange?.({ from, to: event.target.value })} /></label><footer><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{cancelLabel}</Button><Button size="sm" onClick={() => setOpen(false)}>{applyLabel}</Button></footer></div>}</div>;
}

export function HealthIndicator({ label, detail, status = 'healthy' }) {
  return <span className={cx('iig3-health', `is-${status}`)}><i><span /></i><span><strong>{label}</strong>{detail && <small>{detail}</small>}</span></span>;
}

export function Stepper({ steps = [], orientation = 'horizontal', value, onChange }) {
  return <ol className={cx('iig3-stepper', `is-${orientation}`)}>{steps.map((step, index) => <li className={cx(step.status && `is-${step.status}`, value === (step.value ?? index) && 'is-selected')} key={step.label}><button type="button" onClick={() => onChange?.(step.value ?? index)}><span>{step.status === 'done' ? <Check /> : index + 1}</span><div><strong>{step.label}</strong>{step.description && <small>{step.description}</small>}</div></button></li>)}</ol>;
}

export function Timeline({ items = [] }) {
  return <ol className="iig3-timeline">{items.map((item, index) => <li key={item.id || index} className={item.tone ? `is-${item.tone}` : ''}><i>{item.tone === 'success' ? <Check /> : <Circle />}</i><div><header><strong>{item.title}</strong><time>{item.time}</time></header>{item.description && <p>{item.description}</p>}{item.meta && <code>{item.meta}</code>}</div></li>)}</ol>;
}

export function TraceTree({ items = [], selected, onSelect, depth = 0 }) {
  return <div className="iig3-trace-tree">{items.map(item => <TraceNode key={item.id} item={item} selected={selected} onSelect={onSelect} depth={depth} />)}</div>;
}
function TraceNode({ item, selected, onSelect, depth }) {
  const [expanded, setExpanded] = useState(item.expanded !== false);
  return <><button type="button" className={selected === item.id ? 'is-selected' : ''} style={{ '--iig3-depth': depth }} onClick={() => onSelect?.(item.id)}>{item.children?.length ? <span onClick={event => { event.stopPropagation(); setExpanded(value => !value); }}>{expanded ? <ChevronDown /> : <ChevronRight />}</span> : <span />}<i className={`is-${item.status || 'idle'}`} /><strong>{item.label}</strong>{item.duration && <small>{item.duration}</small>}</button>{expanded && item.children?.length > 0 && <TraceTree items={item.children} selected={selected} onSelect={onSelect} depth={depth + 1} />}</>;
}

export function TreeView({ items = [], selected, onSelect, depth = 0 }) {
  return <div className="iig3-tree-view">{items.map(item => <TreeNode key={item.id} item={item} selected={selected} onSelect={onSelect} depth={depth} />)}</div>;
}
function TreeNode({ item, selected, onSelect, depth }) {
  const [expanded, setExpanded] = useState(item.expanded !== false);
  return <><button type="button" className={selected === item.id ? 'is-selected' : ''} style={{ '--iig3-depth': depth }} onClick={() => onSelect?.(item.id)}>{item.children?.length ? <span onClick={event => { event.stopPropagation(); setExpanded(value => !value); }}>{expanded ? <ChevronDown /> : <ChevronRight />}</span> : <span />}{item.icon}<strong>{item.label}</strong>{item.count != null && <Badge>{item.count}</Badge>}</button>{expanded && item.children?.length > 0 && <TreeView items={item.children} selected={selected} onSelect={onSelect} depth={depth + 1} />}</>;
}

export function SplitPane({ left, children, right, leftWidth = 240, rightWidth = 280 }) {
  return <div className="iig3-split-pane" style={{ '--iig3-left': `${leftWidth}px`, '--iig3-right': `${rightWidth}px` }}>{left && <aside>{left}</aside>}<main>{children}</main>{right && <aside>{right}</aside>}</div>;
}

export function CodeBlock({ title = 'JSON', value, language = 'json', copyable = true }) {
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const [copied, setCopied] = useState(false);
  return <div className="iig3-code-block"><header><span>{title}</span><small>{language}</small>{copyable && <IconButton size="sm" variant="ghost" label="Copy" onClick={() => { navigator.clipboard?.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? <Check /> : <Copy />}</IconButton>}</header><pre>{content}</pre></div>;
}

export function JsonViewer({ value, defaultExpanded = true }) {
  return <div className="iig3-json-viewer"><JsonNode name="root" value={value} depth={0} defaultExpanded={defaultExpanded} root /></div>;
}
function JsonNode({ name, value, depth, defaultExpanded, root = false }) {
  const [open, setOpen] = useState(defaultExpanded || depth < 1); const complex = value && typeof value === 'object';
  if (!complex) return <div className="iig3-json-row" style={{ '--iig3-depth': depth }}><span /><b>{name}</b><em>:</em><code className={`is-${typeof value}`}>{JSON.stringify(value)}</code></div>;
  const entries = Object.entries(value);
  return <div><button type="button" className="iig3-json-row" style={{ '--iig3-depth': depth }} onClick={() => setOpen(v => !v)}>{open ? <ChevronDown /> : <ChevronRight />}<b>{root ? 'response' : name}</b><em>{Array.isArray(value) ? ` [${entries.length}]` : ` {${entries.length}}`}</em></button>{open && entries.map(([key, child]) => <JsonNode key={key} name={key} value={child} depth={depth + 1} defaultExpanded={defaultExpanded} />)}</div>;
}

export function ChartCard({ title, description, legend, action, children, state = 'data' }) {
  return <section className="iig3-chart-card"><header><div><strong>{title}</strong>{description && <small>{description}</small>}</div>{action}</header>{legend && <div className="iig3-chart-legend">{legend.map(item => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>}<main>{state === 'empty' ? <span className="iig3-chart-empty">No data in this range</span> : state === 'loading' ? <div className="iig3-chart-loading"><i /><i /><i /><i /></div> : state === 'error' ? <span className="iig3-chart-empty is-error">Chart data could not load</span> : children}</main></section>;
}

export function Sparkline({ values = [], color = 'var(--iig3-accent)' }) {
  const points = useMemo(() => { const max = Math.max(...values, 1); const min = Math.min(...values, 0); return values.map((value, index) => `${index / Math.max(values.length - 1, 1) * 100},${36 - ((value - min) / Math.max(max - min, 1) * 32)}`).join(' '); }, [values]);
  return <svg className="iig3-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

export function BarChart({ values = [], labels = [] }) {
  const max = Math.max(...values, 1);
  return <div className="iig3-bar-chart">{values.map((value, index) => <div key={labels[index] || index}><span title={`${labels[index]}: ${value}`} style={{ height: `${value / max * 100}%` }} /><small>{labels[index]}</small></div>)}</div>;
}

export function CommandPalette({ open, commands = [], query, onQuery, onClose, onSelect }) {
  const filtered = commands.filter(item => `${item.label} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase()));
  if (!open) return null;
  return <div className="iig3-command-overlay" onMouseDown={onClose}><section onMouseDown={event => event.stopPropagation()}><header><Search /><Input autoFocus value={query} onChange={event => onQuery?.(event.target.value)} placeholder="Search pages and actions…" /><kbd>esc</kbd></header><main>{filtered.map(item => <button type="button" key={item.label} onClick={() => onSelect?.(item)}>{item.icon}<span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}{filtered.length === 0 && <p>No commands found.</p>}</main><footer><span>↑↓ Navigate</span><span>↵ Open</span><button type="button" onClick={onClose}><X /> Close</button></footer></section></div>;
}

export function MetricStrip({ items = [] }) { return <div className="iig3-metric-strip">{items.map(item => <div key={item.label}><small>{item.label}</small><strong>{item.value}</strong>{item.status && <StatusBadge status={item.status} label={item.detail} />}</div>)}</div>; }
