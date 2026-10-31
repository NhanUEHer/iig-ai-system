import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, Clipboard, Eye, EyeOff,
  FileUp, Info, LoaderCircle, Search, X, XCircle,
} from 'lucide-react';
import '../../tokens.css';
import './primitives.css';

const cx = (...names) => names.filter(Boolean).join(' ');

export function ThemeScope({ children, className = '' }) {
  return <div className={cx('iig3-theme', className)}>{children}</div>;
}

export function Surface({ children, tone = 'raised', padding = 'md', className = '', ...props }) {
  return <section className={cx('iig3-surface', `is-${tone}`, `has-${padding}-padding`, className)} {...props}>{children}</section>;
}

export function Stack({ children, gap = 'md', direction = 'vertical', align, className = '' }) {
  return <div className={cx('iig3-stack', `is-${direction}`, `has-${gap}-gap`, align && `align-${align}`, className)}>{children}</div>;
}

export function Grid({ children, columns = 2, className = '' }) {
  return <div className={cx('iig3-grid', className)} style={{ '--iig3-columns': columns }}>{children}</div>;
}

export function Heading({ level = 2, eyebrow, children, description, className = '' }) {
  const Tag = `h${level}`;
  return <div className={cx('iig3-heading', className)}>{eyebrow && <span>{eyebrow}</span>}<Tag>{children}</Tag>{description && <p>{description}</p>}</div>;
}

export function Divider({ label }) {
  return <div className="iig3-divider" role="separator">{label && <span>{label}</span>}</div>;
}

export function Button({ variant = 'primary', size = 'md', icon, iconAfter, loading = false, children, className = '', ...props }) {
  return <button className={cx('iig3-button', `is-${variant}`, `is-${size}`, className)} disabled={loading || props.disabled} {...props}>{loading ? <LoaderCircle className="is-spinning" /> : icon}<span>{children}</span>{iconAfter}</button>;
}

export function IconButton({ label, variant = 'outline', size = 'md', children, className = '', ...props }) {
  return <button className={cx('iig3-icon-button', `is-${variant}`, `is-${size}`, className)} aria-label={label} data-tooltip={label} {...props}>{children}</button>;
}

export function ButtonGroup({ children }) { return <div className="iig3-button-group">{children}</div>; }

export function Menu({ trigger, items = [], align = 'end' }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeWithKeyboard = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', closeWithKeyboard);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('keydown', closeWithKeyboard);
    };
  }, [open]);
  const enhancedTrigger = React.cloneElement(trigger, { 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': open ? menuId : undefined, onClick: event => { trigger.props.onClick?.(event); setOpen(value => !value); } });
  return <div ref={menuRef} className={cx('iig3-menu', `align-${align}`)}>{enhancedTrigger}{open && <div id={menuId} className="iig3-menu__popup" role="menu">{items.map((item, index) => item.separator ? <Divider key={index} /> : <button type="button" role="menuitem" className={item.danger ? 'is-danger' : ''} key={item.label} disabled={item.disabled} onClick={() => { if (item.disabled) return; item.onClick?.(); setOpen(false); }}>{item.icon}<span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}</div>}</div>;
}

export function SplitButton({ children, items = [], ...props }) {
  return <ButtonGroup><Button {...props}>{children}</Button><Menu trigger={<IconButton label="More actions" variant="primary"><ChevronDown /></IconButton>} items={items} /></ButtonGroup>;
}

export function FormField({ label, description, error, required, children, className = '' }) {
  return <label className={cx('iig3-field', error && 'has-error', className)}><span className="iig3-field__label">{label}{required && <b>*</b>}</span>{description && <span className="iig3-field__description">{description}</span>}{children}{error && <span className="iig3-field__error"><AlertTriangle />{error}</span>}</label>;
}

export function Input({ prefix, suffix, invalid = false, className = '', ...props }) {
  return <span className={cx('iig3-control', invalid && 'is-invalid', className)}>{prefix && <i>{prefix}</i>}<input {...props} />{suffix && <i>{suffix}</i>}</span>;
}

export function SearchInput({ value, onChange, placeholder = 'Search', ...props }) {
  return <Input prefix={<Search />} suffix={value ? <button type="button" aria-label="Clear" onClick={() => onChange?.({ target: { value: '' } })}><X /></button> : null} value={value} onChange={onChange} placeholder={placeholder} {...props} />;
}

export function Textarea({ className = '', ...props }) { return <textarea className={cx('iig3-textarea', className)} {...props} />; }

export function Select({ children, className = '', ...props }) {
  return <span className={cx('iig3-select', className)}><select {...props}>{children}</select><ChevronDown /></span>;
}

export function Checkbox({ label, description, className = '', ...props }) {
  return <label className={cx('iig3-check', className)}><input type="checkbox" {...props} /><i><Check /></i><span><strong>{label}</strong>{description && <small>{description}</small>}</span></label>;
}

export function RadioGroup({ label, options = [], value, onChange, direction = 'row' }) {
  return <fieldset className={cx('iig3-radio-group', `is-${direction}`)}><legend>{label}</legend>{options.map(option => <label key={option.value}><input type="radio" value={option.value} checked={value === option.value} onChange={() => onChange?.(option.value)} /><i /><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span></label>)}</fieldset>;
}

export function Switch({ label, description, className = '', ...props }) {
  return <label className={cx('iig3-switch', className)}><input type="checkbox" {...props} /><i><span /></i><span><strong>{label}</strong>{description && <small>{description}</small>}</span></label>;
}

export function SegmentedControl({ options = [], value, onChange }) {
  return <div className="iig3-segmented">{options.map(option => <button type="button" key={option.value} className={value === option.value ? 'is-active' : ''} onClick={() => onChange?.(option.value)}>{option.icon}{option.label}{option.count != null && <em>{option.count}</em>}</button>)}</div>;
}

export function NumberInput({ value, onChange, min, max, step = 1, compact = false, className = '', ...props }) {
  const update = next => onChange?.(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)));
  return <div className={cx('iig3-number', compact && 'is-compact', className)}><button type="button" onClick={() => update(Number(value) - step)}>−</button><input type="number" value={value} onChange={event => update(Number(event.target.value))} min={min} max={max} step={step} {...props} /><button type="button" onClick={() => update(Number(value) + step)}>+</button></div>;
}

export function TagInput({ value = [], onChange, placeholder = 'Add tag' }) {
  const [draft, setDraft] = useState('');
  const add = () => { const tag = draft.trim(); if (tag && !value.includes(tag)) onChange?.([...value, tag]); setDraft(''); };
  return <div className="iig3-tag-input">{value.map(tag => <span key={tag}>{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange?.(value.filter(item => item !== tag))}><X /></button></span>)}<input value={draft} placeholder={placeholder} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); } }} /></div>;
}

export function SecretInput({ value, onCopy }) {
  const [visible, setVisible] = useState(false);
  return <div className="iig3-secret"><code>{visible ? value : '•'.repeat(Math.min(value.length, 30))}</code><IconButton label={visible ? 'Hide secret' : 'Reveal secret'} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff /> : <Eye />}</IconButton><IconButton label="Copy secret" onClick={() => { navigator.clipboard?.writeText(value); onCopy?.(); }}><Clipboard /></IconButton></div>;
}

export function FileDropzone({ title = 'Drop files or browse', description, accept, multiple, onChange }) {
  return <label className="iig3-dropzone"><span><FileUp /></span><strong>{title}</strong>{description && <small>{description}</small>}<span className="iig3-dropzone__action">Add files</span><input type="file" accept={accept} multiple={multiple} onChange={onChange} /></label>;
}

export function CodeInput({ language = 'JSON', value, onChange, rows = 7, className = '', ...props }) {
  return <div className={cx('iig3-code-input', className)}><header><span>{language}</span><small>Structured input</small></header><textarea spellCheck="false" rows={rows} value={value} onChange={onChange} {...props} /></div>;
}

const feedbackIcon = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
export function Alert({ tone = 'info', title, children, action, compact = false }) {
  const Icon = feedbackIcon[tone];
  return <div className={cx('iig3-alert', `is-${tone}`, compact && 'is-compact')} role={tone === 'danger' ? 'alert' : 'status'}><Icon /><div><strong>{title}</strong>{children && <p>{children}</p>}</div>{action && <aside>{action}</aside>}</div>;
}

export function Banner({ tone = 'info', title, children, onClose }) {
  return <div className={cx('iig3-banner', `is-${tone}`)}><Alert tone={tone} title={title}>{children}</Alert>{onClose && <IconButton label="Dismiss" variant="ghost" onClick={onClose}><X /></IconButton>}</div>;
}

export function Toast({ tone = 'success', title, children, onClose }) {
  return <aside className={cx('iig3-toast', `is-${tone}`)} role={tone === 'danger' ? 'alert' : 'status'} aria-live={tone === 'danger' ? 'assertive' : 'polite'}><Alert tone={tone} title={title}>{children}</Alert>{onClose && <IconButton label="Dismiss" variant="ghost" onClick={onClose}><X /></IconButton>}</aside>;
}

function useDialogA11y(open, onClose) {
  const ref = useRef(null);
  const returnFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return undefined;
    returnFocus.current = document.activeElement;
    const node = ref.current;
    const focusable = () => [...node.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(element => !element.disabled);
    focusable()[0]?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') onCloseRef.current?.();
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); returnFocus.current?.focus?.(); };
  }, [open]);
  return ref;
}

export function Modal({ open, title, description, children, footer, onClose, size = 'md' }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogA11y(open, onClose);
  if (!open) return null;
  return <div className="iig3-overlay" onMouseDown={onClose}><section ref={dialogRef} className={cx('iig3-modal', `is-${size}`)} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onMouseDown={event => event.stopPropagation()}><header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><IconButton label="Close" variant="ghost" onClick={onClose}><X /></IconButton></header><main>{children}</main>{footer && <footer>{footer}</footer>}</section></div>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', danger = false, loading = false, onConfirm, onClose }) {
  const close = loading ? undefined : onClose;
  return <Modal open={open} title={title} description={description} onClose={close} size="sm" footer={<><Button variant="outline" disabled={loading} onClick={onClose}>{cancelLabel}</Button><Button loading={loading} variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button></>}/>;
}

export function Drawer({ open, title, description, children, footer, onClose }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogA11y(open, onClose);
  if (!open) return null;
  return <div className="iig3-overlay is-drawer" onMouseDown={onClose}><aside ref={dialogRef} className="iig3-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onMouseDown={event => event.stopPropagation()}><header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><IconButton label="Close" variant="ghost" onClick={onClose}><X /></IconButton></header><main>{children}</main>{footer && <footer>{footer}</footer>}</aside></div>;
}

export function Tooltip({ content, children }) { return <span className="iig3-tooltip" data-tooltip={content}>{children}</span>; }

export function Popover({ trigger, children }) {
  const [open, setOpen] = useState(false);
  return <div className="iig3-popover"><span onClick={() => setOpen(current => !current)}>{trigger}</span>{open && <div>{children}</div>}</div>;
}

export function EmptyState({ icon = <Info />, title, description, action }) { return <div className="iig3-empty"><span>{icon}</span><strong>{title}</strong>{description && <p>{description}</p>}{action}</div>; }
export function ErrorState({ title = 'Something went wrong', description, action }) { return <EmptyState icon={<AlertTriangle />} title={title} description={description} action={action} />; }
export function Spinner({ label = 'Loading' }) { return <span className="iig3-spinner" role="status"><LoaderCircle />{label}</span>; }
export function Skeleton({ lines = 3 }) { return <div className="iig3-skeleton" aria-hidden="true">{Array.from({ length: lines }, (_, index) => <i key={index} />)}</div>; }

export function ComponentIndex({ components = [] }) {
  const groups = useMemo(() => components.reduce((result, item) => {
    const group = item.group || 'Other';
    result[group] = [...(result[group] || []), item];
    return result;
  }, {}), [components]);
  return <div className="iig3-component-index">{Object.entries(groups).map(([group, items]) => <Surface key={group}><strong>{group}</strong><div>{items.map(item => <span key={item}>{item.name ?? item}</span>)}</div></Surface>)}</div>;
}
