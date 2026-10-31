import React, { useState } from 'react';
import {
  AlertTriangle, Bot, Check, ChevronDown, ChevronRight, Circle, Copy,
  ExternalLink, KeyRound, LockKeyhole, RefreshCw, RotateCcw, ShieldCheck,
  Trash2, Webhook,
} from 'lucide-react';
import { Button, ConfirmDialog, IconButton, Menu } from '../primitives/Primitives';
import { Avatar, Badge, ProgressBar, StatusBadge } from '../navigation/Navigation';
import { CodeBlock, HealthIndicator, Timeline } from '../workflow/Workflow';
import './business.css';

const cx = (...names) => names.filter(Boolean).join(' ');

export function ScoringStatus({ status, scope, completed = 0, total = 0, detail }) {
  return <div className="iig3-scoring-status"><header><StatusBadge status={status} /><Badge>{scope}</Badge></header><ProgressBar value={completed} max={total} tone={status === 'completed' ? 'success' : status === 'failed' ? 'danger' : 'ai'} label={detail || 'Planned runs'} /></div>;
}

export function ScoringPlan({ groups = [], activeId, onSelect }) {
  return <div className="iig3-scoring-plan">{groups.map(group => <button type="button" key={group.id} className={activeId === group.id ? 'is-active' : ''} onClick={() => onSelect?.(group.id)}><span className={`iig3-scoring-plan__state is-${group.status}`}>{group.status === 'completed' ? <Check /> : group.status === 'failed' ? <AlertTriangle /> : <Circle />}</span><div><strong>{group.label}</strong><small>{group.description}</small><ProgressBar value={group.completed} max={group.total} showValue /></div><StatusBadge status={group.status} /></button>)}</div>;
}

export function RunMatrix({ runs = [] }) {
  return <div className="iig3-run-matrix">{runs.map(run => <article key={run.id}><header><code>{run.id}</code><StatusBadge status={run.status} /></header><strong>{run.label}</strong><footer><span>{run.agent}</span><time>{run.duration || '—'}</time></footer></article>)}</div>;
}

export function OperationPanel({ job, permissions = [], onAction }) {
  const [confirm, setConfirm] = useState(null);
  const actions = [
    { key: 'retry', label: 'Retry failed work', description: 'Create an immutable retry attempt.', icon: <RotateCcw />, permission: 'retry' },
    { key: 'reconcile', label: 'Reconcile state', description: 'Re-evaluate terminal state from persisted evidence.', icon: <RefreshCw />, permission: 'reconcile' },
    { key: 'cancel', label: 'Cancel active job', description: 'Stop remaining work and preserve completed evidence.', icon: <Trash2 />, permission: 'cancel', danger: true },
  ];
  return <section className="iig3-operation-panel"><header><div><strong>Operations</strong><small>Actions are permission and state aware.</small></div><ShieldCheck /></header>{actions.map(action => { const allowed = permissions.includes(action.permission); return <button type="button" key={action.key} disabled={!allowed} onClick={() => setConfirm(action)}>{action.icon}<span><strong>{action.label}</strong><small>{allowed ? action.description : `Requires ${action.permission} permission`}</small></span><ChevronRight /></button>; })}<ConfirmDialog open={Boolean(confirm)} danger={confirm?.danger} title={`${confirm?.label}?`} description={`${confirm?.description || ''} Job ${job}. This action will be recorded in the audit log.`} confirmLabel={confirm?.label} onClose={() => setConfirm(null)} onConfirm={() => { onAction?.(confirm?.key); setConfirm(null); }} /></section>;
}

export function CredentialCard({ name, prefix, scopes = [], environment, status = 'healthy', lastUsed, expiresAt, onRotate, onRevoke }) {
  const [confirm, setConfirm] = useState(null);
  const complete = () => { if (confirm === 'rotate') onRotate?.(); else onRevoke?.(); setConfirm(null); };
  return <article className="iig3-credential-card"><header><span><KeyRound /></span><div><strong>{name}</strong><code>{prefix}••••••••</code></div><Menu trigger={<IconButton size="sm" label="Credential actions"><ChevronDown /></IconButton>} items={[{ label: 'Rotate credential', icon: <RefreshCw />, onClick: () => setConfirm('rotate') }, { label: 'Revoke credential', icon: <Trash2 />, danger: true, onClick: () => setConfirm('revoke') }]} /></header><div>{scopes.map(scope => <Badge key={scope}>{scope}</Badge>)}</div><dl><div><dt>Environment</dt><dd>{environment}</dd></div><div><dt>Last used</dt><dd>{lastUsed}</dd></div><div><dt>Expires</dt><dd>{expiresAt}</dd></div></dl><footer><StatusBadge status={status} label={status === 'healthy' ? 'Active' : status} /><Button size="sm" variant="ghost" onClick={() => setConfirm('rotate')}>Rotate</Button></footer><ConfirmDialog open={Boolean(confirm)} danger={confirm === 'revoke'} title={`${confirm === 'rotate' ? 'Rotate' : 'Revoke'} credential?`} description={confirm === 'rotate' ? 'A new secret will be issued and this action will be audited.' : 'Requests using this credential will fail immediately.'} confirmLabel={confirm === 'rotate' ? 'Rotate credential' : 'Revoke credential'} onClose={() => setConfirm(null)} onConfirm={complete} /></article>;
}

export function SecretReveal({ value, label = 'API credential', onDone }) {
  const [copied, setCopied] = useState(false);
  return <div className="iig3-secret-reveal"><span><LockKeyhole /></span><div><strong>Save your {label}</strong><p>This value is shown once. Store it securely before closing.</p></div><code>{value}</code><Button variant="secondary" icon={copied ? <Check /> : <Copy />} onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); }}>{copied ? 'Copied' : 'Copy secret'}</Button>{onDone && <Button variant="ghost" onClick={onDone}>I have saved it</Button>}</div>;
}

export function WebhookEndpointCard({ name, url, events = [], status = 'healthy', successRate, lastDelivery, onTest }) {
  const [testing, setTesting] = useState(false); const [tested, setTested] = useState(false);
  const test = () => { setTesting(true); setTested(false); Promise.resolve(onTest?.()).finally(() => setTimeout(() => { setTesting(false); setTested(true); }, 500)); };
  return <article className="iig3-webhook-card"><header><span><Webhook /></span><div><strong>{name}</strong><code>{url}</code></div><StatusBadge status={status} label={status === 'healthy' ? 'Healthy' : status} /></header><div>{events.map(event => <Badge key={event}>{event}</Badge>)}</div>{tested && <small className="iig3-webhook-card__result">Test delivered · HTTP 200 · 312ms</small>}<footer><HealthIndicator label={`${successRate} success`} detail={`Last delivery ${lastDelivery}`} status={status} /><Button size="sm" variant="outline" loading={testing} onClick={test}>{testing ? 'Testing' : 'Send test'}</Button></footer></article>;
}

export function DeliveryAttempt({ attempt, status, code, latency, timestamp, selected, onClick }) {
  return <button type="button" className={cx('iig3-delivery-attempt', selected && 'is-selected')} onClick={onClick}><span className="iig3-delivery-attempt__number">{attempt}</span><StatusBadge status={status} /><code>HTTP {code}</code><small>{latency}</small><time>{timestamp}</time><ChevronRight /></button>;
}

export function DeliveryInspector({ delivery }) {
  if (!delivery) return null;
  return <section className="iig3-delivery-inspector"><header><div><strong>Delivery attempt #{delivery.attempt}</strong><small>{delivery.id}</small></div><StatusBadge status={delivery.status} /></header><dl><div><dt>Response</dt><dd>HTTP {delivery.code}</dd></div><div><dt>Latency</dt><dd>{delivery.latency}</dd></div><div><dt>Timestamp</dt><dd>{delivery.timestamp}</dd></div><div><dt>Signature</dt><dd>Verified · HMAC SHA-256</dd></div><div><dt>Event</dt><dd>scoring.completed</dd></div><div><dt>Delivery ID</dt><dd>{delivery.id}</dd></div></dl><CodeBlock title="Response body" value={delivery.response} /></section>;
}

export function PermissionMatrix({ roles = [], permissions = [], values = {}, onChange, readOnly = false }) {
  const toggle = (role, permission) => { const next = new Set(values[role] || []); if (next.has(permission)) next.delete(permission); else next.add(permission); onChange?.({ ...values, [role]: [...next] }); };
  return <div className="iig3-permission-matrix"><table><caption className="iig3-sr-only">Permissions by role</caption><thead><tr><th scope="col">Permission</th>{roles.map(role => <th scope="col" key={role}>{role}</th>)}</tr></thead><tbody>{permissions.map(permission => <tr key={permission.key}><th scope="row"><strong>{permission.label}</strong><small>{permission.description}</small></th>{roles.map(role => { const checked = (values[role] || []).includes(permission.key); return <td key={role}><button type="button" aria-label={`${checked ? 'Remove' : 'Grant'} ${permission.label} for ${role}`} aria-pressed={checked} disabled={readOnly} className={checked ? 'is-checked' : ''} onClick={() => toggle(role, permission.key)}>{checked && <Check />}</button></td>; })}</tr>)}</tbody></table></div>;
}

export function AuditEvent({ actor, action, target, timestamp, requestId, changes, expanded = false }) {
  const [open, setOpen] = useState(expanded);
  return <article className="iig3-audit-event"><button type="button" onClick={() => setOpen(v => !v)}><Avatar name={actor} size="sm" /><span className="iig3-audit-event__content"><strong>{actor}</strong><p><b>{action}</b> {target}</p><small>{timestamp} · <code>{requestId}</code></small></span>{open ? <ChevronDown /> : <ChevronRight />}</button>{open && changes && <div><CodeBlock title="Recorded changes" value={changes} /></div>}</article>;
}

export function TenantSummary({ name, code, environment, status, credentials, webhooks, jobs }) {
  return <article className="iig3-tenant-summary"><header><Avatar name={name} size="lg" status={status === 'healthy' ? 'online' : undefined} /><div><strong>{name}</strong><code>{code}</code></div><StatusBadge status={status} label={status === 'healthy' ? 'Active' : status} /></header><dl><div><dt>Environment</dt><dd>{environment}</dd></div><div><dt>Credentials</dt><dd>{credentials}</dd></div><div><dt>Webhooks</dt><dd>{webhooks}</dd></div><div><dt>Jobs today</dt><dd>{jobs}</dd></div></dl></article>;
}

export function IncidentCard({ title, service, severity = 'warning', startedAt, description, actions }) {
  return <article className={cx('iig3-incident-card', `is-${severity}`)}><header><AlertTriangle /><div><strong>{title}</strong><small>{service} · started {startedAt}</small></div><Badge tone={severity === 'danger' ? 'danger' : 'warning'}>{severity}</Badge></header><p>{description}</p>{actions && <footer>{actions}</footer>}</article>;
}

export function JobIdentity({ keycode, jobId, secondaryId, tenant, scope, status, statusLabel, metrics = [] }) {
  return <header className="iig3-job-identity">
    <span className="iig3-job-identity__icon"><Bot /></span>
    <div className="iig3-job-identity__content">
      <small>{tenant} · {scope}</small>
      <div className="iig3-job-identity__title"><strong>{keycode}</strong><StatusBadge status={status} label={statusLabel} /></div>
      <div className="iig3-job-identity__ids"><code>{jobId}</code>{secondaryId && <code>{secondaryId}</code>}</div>
    </div>
    {metrics.length > 0 && <dl className="iig3-job-identity__metrics">{metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value ?? '—'}</dd></div>)}</dl>}
  </header>;
}

export function AuditTimeline({ events }) { return <Timeline items={events.map(event => ({ ...event, title: `${event.actor} · ${event.title}` }))} />; }
export function IntegrationLink({ label, value, href, external = false }) { return <a className="iig3-integration-link" href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}><span><strong>{label}</strong><code>{value}</code></span><ExternalLink aria-hidden="true" /></a>; }
