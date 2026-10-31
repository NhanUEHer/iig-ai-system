import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clipboard, Code2, KeyRound, Search, Webhook } from 'lucide-react';
import Button from './Button';
import { DetailsList, HealthIndicator, ProgressSteps, StatusBadge, Timeline } from './Operational';
import './business.css';

export function SegmentedControl({ items = [], value, onChange, ariaLabel = 'Chọn chế độ', className = '' }) {
  return <div className={['ui-segmented', className].filter(Boolean).join(' ')} role="group" aria-label={ariaLabel}>{items.map(item => <button key={item.value} type="button" className={value === item.value ? 'is-active' : ''} onClick={() => onChange?.(item.value)} disabled={item.disabled}>{item.icon}{item.label}{item.count != null && <em>{item.count}</em>}</button>)}</div>;
}

export function ChartCard({ title, description, legend = [], actions, children, empty = false, emptyText = 'Chưa có dữ liệu', className = '' }) {
  return <section className={['ui-chart-card', className].filter(Boolean).join(' ')}><header><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{actions}</header>{legend.length > 0 && <div className="ui-chart-card__legend">{legend.map(item => <span key={item.label} className={`is-${item.tone || 'primary'}`}><i />{item.label}</span>)}</div>}<div className="ui-chart-card__body">{empty ? <div className="ui-chart-card__empty">{emptyText}</div> : children}</div></section>;
}

export function BarChart({ data = [], valueFormatter = value => value, className = '' }) {
  const max = Math.max(...data.map(item => item.value), 1);
  return <div className={['ui-bar-chart', className].filter(Boolean).join(' ')}>{data.map(item => <div key={item.label}><span>{valueFormatter(item.value)}</span><i><b style={{ '--ui-bar-size': `${Math.round((item.value / max) * 100)}%` }} /></i><small>{item.label}</small></div>)}</div>;
}

export function CodeViewer({ value, language = 'json', title, copyable = true, collapsible = false, className = '' }) {
  const [open, setOpen] = useState(true); const [copied, setCopied] = useState(false);
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const copy = async () => { await navigator.clipboard?.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1400); };
  return <section className={['ui-code-viewer', className].filter(Boolean).join(' ')}><header><div><Code2 /><strong>{title || language.toUpperCase()}</strong></div><div>{copyable && <button type="button" onClick={copy}>{copied ? <Check /> : <Clipboard />}{copied ? 'Đã copy' : 'Copy'}</button>}{collapsible && <button type="button" onClick={() => setOpen(!open)}>{open ? <ChevronDown /> : <ChevronRight />}</button>}</div></header>{open && <pre><code>{content}</code></pre>}</section>;
}

export function SplitPane({ navigation, children, inspector, navigationTitle, inspectorTitle, className = '' }) {
  const [leftOpen, setLeftOpen] = useState(true); const [rightOpen, setRightOpen] = useState(true);
  return <div className={['ui-split-pane', !leftOpen && 'is-left-closed', !rightOpen && 'is-right-closed', className].filter(Boolean).join(' ')}>{leftOpen && <aside><header><strong>{navigationTitle}</strong><button type="button" onClick={() => setLeftOpen(false)} aria-label="Ẩn điều hướng">‹</button></header>{navigation}</aside>}<main>{(!leftOpen || !rightOpen) && <div className="ui-split-pane__restore">{!leftOpen && <button type="button" onClick={() => setLeftOpen(true)}>Mở cấu trúc</button>}{!rightOpen && <button type="button" onClick={() => setRightOpen(true)}>Mở thuộc tính</button>}</div>}{children}</main>{rightOpen && <aside><header><strong>{inspectorTitle}</strong><button type="button" onClick={() => setRightOpen(false)} aria-label="Ẩn thuộc tính">›</button></header>{inspector}</aside>}</div>;
}

function TreeNode({ node, selectedKey, onSelect, level = 0 }) {
  const [open, setOpen] = useState(node.open !== false); const hasChildren = node.children?.length > 0;
  return <li><div className={selectedKey === node.key ? 'is-selected' : ''} style={{ '--ui-tree-level': level }}><button type="button" className="ui-entity-tree__toggle" onClick={() => hasChildren && setOpen(!open)} aria-label={open ? 'Thu gọn' : 'Mở rộng'}>{hasChildren ? (open ? <ChevronDown /> : <ChevronRight />) : <span />}</button><button type="button" className="ui-entity-tree__label" onClick={() => onSelect?.(node.key)}>{node.icon}{node.label}{node.badge != null && <em>{node.badge}</em>}</button></div>{hasChildren && open && <ul>{node.children.map(child => <TreeNode key={child.key} node={child} selectedKey={selectedKey} onSelect={onSelect} level={level + 1} />)}</ul>}</li>;
}

export function EntityTree({ items = [], selectedKey, onSelect, className = '' }) { return <ul className={['ui-entity-tree', className].filter(Boolean).join(' ')}>{items.map(node => <TreeNode key={node.key} node={node} selectedKey={selectedKey} onSelect={onSelect} />)}</ul>; }

export function CredentialCard({ name, prefix, scopes = [], status = 'active', lastUsed, expiresAt, onRotate, onRevoke, className = '' }) {
  return <article className={['ui-credential-card', className].filter(Boolean).join(' ')}><header><i><KeyRound /></i><div><strong>{name}</strong><code>{prefix}••••••••</code></div><StatusBadge status={status} label={status === 'active' ? 'Đang hoạt động' : 'Đã thu hồi'} /></header><div className="ui-credential-card__scopes">{scopes.map(scope => <span key={scope}>{scope}</span>)}</div><dl><div><dt>Lần dùng cuối</dt><dd>{lastUsed || 'Chưa sử dụng'}</dd></div><div><dt>Hết hạn</dt><dd>{expiresAt || 'Không hết hạn'}</dd></div></dl><footer><Button size="sm" variant="secondary" onClick={onRotate}>Rotate</Button><Button size="sm" variant="danger" onClick={onRevoke}>Revoke</Button></footer></article>;
}

export function WebhookEndpointCard({ name, url, events = [], status = 'healthy', lastDelivery, onTest, onEdit, className = '' }) {
  return <article className={['ui-webhook-card', className].filter(Boolean).join(' ')}><header><i><Webhook /></i><div><strong>{name}</strong><code>{url}</code></div><HealthIndicator label={status === 'healthy' ? 'Healthy' : 'Degraded'} status={status} /></header><div className="ui-webhook-card__events">{events.map(event => <span key={event}>{event}</span>)}</div><footer><small>Delivery gần nhất: {lastDelivery || 'Chưa có'}</small><div><Button size="sm" variant="secondary" onClick={onTest}>Gửi test</Button><Button size="sm" onClick={onEdit}>Cấu hình</Button></div></footer></article>;
}

export function PermissionMatrix({ roles = [], permissions = [], values = {}, onChange, readOnly = false, className = '' }) {
  return <div className={['ui-permission-matrix', className].filter(Boolean).join(' ')}><table><thead><tr><th>Quyền</th>{roles.map(role => <th key={role.key}>{role.label}</th>)}</tr></thead><tbody>{permissions.map(permission => <tr key={permission.key}><td><strong>{permission.label}</strong>{permission.description && <small>{permission.description}</small>}</td>{roles.map(role => { const checked = Boolean(values[role.key]?.includes(permission.key)); return <td key={role.key}><input type="checkbox" checked={checked} disabled={readOnly || role.readOnly} onChange={() => onChange?.({ role: role.key, permission: permission.key, checked: !checked })} aria-label={`${role.label}: ${permission.label}`} /></td>; })}</tr>)}</tbody></table></div>;
}

export function ScoringStatus({ status, label, completed, total, className = '' }) {
  return <div className={['ui-scoring-status', className].filter(Boolean).join(' ')}><StatusBadge status={status} label={label} />{total != null && <div><span>{completed || 0} / {total}</span><progress value={completed || 0} max={total || 1} /></div>}</div>;
}

export function ScoringPlan({ steps = [], summary = [], className = '' }) {
  return <section className={['ui-scoring-plan', className].filter(Boolean).join(' ')}><ProgressSteps steps={steps} />{summary.length > 0 && <DetailsList items={summary} />}</section>;
}

export function ExecutionTrace({ items = [], payload, title = 'Execution trace', className = '' }) {
  return <section className={['ui-execution-trace', className].filter(Boolean).join(' ')}><header><strong>{title}</strong><span>{items.length} stages</span></header><Timeline items={items} />{payload != null && <CodeViewer title="Payload / result" value={payload} collapsible />}</section>;
}

export function CommandPalette({ open, commands = [], query = '', onQueryChange, onSelect, onClose }) {
  const visible = useMemo(() => commands.filter(command => `${command.label} ${command.group || ''}`.toLowerCase().includes(query.toLowerCase())), [commands, query]);
  if (!open) return null;
  return <div className="ui-command-backdrop" role="presentation" onMouseDown={onClose}><section className="ui-command" role="dialog" aria-label="Điều hướng nhanh" onMouseDown={event => event.stopPropagation()}><label><Search /><input autoFocus value={query} onChange={event => onQueryChange?.(event.target.value)} placeholder="Tìm màn hình hoặc hành động..." /><kbd>ESC</kbd></label><div>{visible.length ? visible.map(command => <button type="button" key={command.id} onClick={() => onSelect?.(command)}>{command.icon}<span><strong>{command.label}</strong>{command.description && <small>{command.description}</small>}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>) : <p>Không tìm thấy kết quả</p>}</div></section></div>;
}
