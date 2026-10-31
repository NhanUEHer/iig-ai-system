import React, { useState } from 'react';
import { Check, CheckCircle2, Circle, Clipboard, Eye, EyeOff, Search, X } from 'lucide-react';
import Badge from './Badge';
import Button from './Button';
import './operational.css';

const STATUS_TONES = {
  active: 'success', completed: 'success', healthy: 'success', success: 'success',
  processing: 'info', running: 'info', queued: 'neutral', pending: 'warning',
  warning: 'warning', failed: 'danger', error: 'danger', cancelled: 'neutral',
  disabled: 'neutral', draft: 'neutral',
};

export function StatusBadge({ status, label, tone, showDot = true, className = '' }) {
  const normalized = String(status || 'neutral').toLowerCase();
  const resolvedTone = tone || STATUS_TONES[normalized] || 'neutral';
  return <Badge tone={resolvedTone} className={['ui-status-badge', className].filter(Boolean).join(' ')}>
    {showDot && <span className="ui-status-badge__dot" aria-hidden="true" />}
    {label || status}
  </Badge>;
}

export function SectionHeader({ eyebrow, title, description, actions, className = '' }) {
  return <header className={['ui-section-header', className].filter(Boolean).join(' ')}>
    <div>{eyebrow && <span className="ui-section-header__eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>
    {actions && <div className="ui-section-header__actions">{actions}</div>}
  </header>;
}

export function FilterBar({ value = '', onChange, placeholder = 'Tìm kiếm...', children, activeFilters = [], onClear, trailing, className = '' }) {
  return <div className={['ui-filter-bar', className].filter(Boolean).join(' ')}>
    <label className="ui-filter-bar__search">
      <Search aria-hidden="true" />
      <input value={value} onChange={event => onChange?.(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && <button type="button" onClick={() => onChange?.('')} aria-label="Xóa từ khóa"><X /></button>}
    </label>
    <div className="ui-filter-bar__controls">{children}</div>
    {activeFilters.length > 0 && <div className="ui-filter-bar__active">{activeFilters.map(filter => <span key={filter}>{filter}</span>)}<button type="button" onClick={onClear}>Xóa lọc</button></div>}
    {trailing && <div className="ui-filter-bar__trailing">{trailing}</div>}
  </div>;
}

export function KpiStatCard({ label, value, trend, trendDirection = 'up', description, icon: Icon, tone = 'primary', chart, className = '' }) {
  return <article className={['ui-kpi-card', `ui-kpi-card--${tone}`, className].filter(Boolean).join(' ')}>
    <div className="ui-kpi-card__top"><span>{label}</span>{Icon && <i><Icon /></i>}</div>
    <div className="ui-kpi-card__value">{value}</div>
    <div className="ui-kpi-card__footer">{trend && <strong className={`is-${trendDirection}`}>{trend}</strong>}{description && <span>{description}</span>}</div>
    {chart && <div className="ui-kpi-card__chart" aria-hidden="true">{chart}</div>}
  </article>;
}

export function DetailsList({ items = [], columns = 2, className = '' }) {
  return <dl className={['ui-details-list', `ui-details-list--${columns}`, className].filter(Boolean).join(' ')}>{items.map(item => <div key={item.label} className={item.fullWidth ? 'is-full' : ''}><dt>{item.label}</dt><dd>{item.value ?? '—'}</dd></div>)}</dl>;
}

export function Timeline({ items = [], className = '' }) {
  return <ol className={['ui-timeline', className].filter(Boolean).join(' ')}>{items.map((item, index) => <li key={item.id || `${item.title}-${index}`} className={`is-${item.tone || 'neutral'}`}>
    <span className="ui-timeline__marker">{item.tone === 'success' ? <Check /> : <Circle />}</span>
    <div className="ui-timeline__content"><div><strong>{item.title}</strong>{item.time && <time>{item.time}</time>}</div>{item.description && <p>{item.description}</p>}{item.meta && <small>{item.meta}</small>}</div>
  </li>)}</ol>;
}

export function ProgressSteps({ steps = [], className = '' }) {
  return <ol className={['ui-progress-steps', className].filter(Boolean).join(' ')}>{steps.map((step, index) => <li key={step.id || step.label} className={`is-${step.status || 'pending'}`}>
    <span>{step.status === 'completed' ? <CheckCircle2 /> : index + 1}</span>
    <div><strong>{step.label}</strong>{step.description && <small>{step.description}</small>}</div>
  </li>)}</ol>;
}

export function HealthIndicator({ label, status = 'healthy', detail, className = '' }) {
  return <div className={['ui-health', `is-${status}`, className].filter(Boolean).join(' ')}><span aria-hidden="true" /><div><strong>{label}</strong>{detail && <small>{detail}</small>}</div></div>;
}

export function CopyField({ label, value, masked = false, className = '' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <div className={['ui-copy-field', className].filter(Boolean).join(' ')}>{label && <label>{label}</label>}<div><code>{masked ? '••••••••••••••••••••••••' : value}</code><button type="button" onClick={copy} aria-label="Sao chép">{copied ? <Check /> : <Clipboard />}</button></div></div>;
}

export function SecretField({ label, value, hint, className = '' }) {
  const [visible, setVisible] = useState(false);
  return <div className={['ui-secret-field', className].filter(Boolean).join(' ')}>
    <div className="ui-secret-field__label"><label>{label}</label>{hint && <small>{hint}</small>}</div>
    <div className="ui-secret-field__control"><code>{visible ? value : `sk_live_${'•'.repeat(24)}`}</code><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ẩn secret' : 'Hiện secret'}>{visible ? <EyeOff /> : <Eye />}</button><CopyField value={value} masked className="ui-secret-field__copy" /></div>
  </div>;
}

export function SafeActionPanel({ title, description, actionLabel, tone = 'danger', onAction, children }) {
  return <section className={`ui-safe-action ui-safe-action--${tone}`}><div><strong>{title}</strong><p>{description}</p>{children}</div><Button variant={tone === 'danger' ? 'danger' : 'secondary'} size="sm" onClick={onAction}>{actionLabel}</Button></section>;
}
