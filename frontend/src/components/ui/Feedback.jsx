import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import FloatingPortal from '../common/FloatingPortal';
import './feedback.css';
import './toast-overrides.css';
import './floating-portal-overrides.css';

const icons = { success: CheckCircle2, error: XCircle, warning: AlertCircle, info: Info };

export function Alert({ severity = 'info', title, children, onClose, className = '' }) {
  const Icon = icons[severity] || Info;
  return <div className={['ui-alert', `ui-alert--${severity}`, className].filter(Boolean).join(' ')} role="alert"><Icon aria-hidden="true" /><div className="ui-alert__content">{title && <strong>{title}</strong>}{children && <div>{children}</div>}</div>{onClose && <button type="button" onClick={onClose} aria-label="Đóng"><X /></button>}</div>;
}

export function Toast({ severity = 'info', title, children, onClose, autoClose = 0 }) {
  useEffect(() => { if (!autoClose || !onClose) return undefined; const timer = window.setTimeout(onClose, autoClose); return () => window.clearTimeout(timer); }, [autoClose, onClose]);
  return <div className="ui-toast" role="status"><Alert severity={severity} title={title} onClose={onClose}>{children}</Alert></div>;
}

export function Modal({ open, title, children, footer, onClose, size = 'medium', closeOnOverlay = true, className = '' }) {
  const dialogRef = useRef(null);
  useEffect(() => { if (!open) return undefined; const onKeyDown = event => event.key === 'Escape' && onClose?.(); document.addEventListener('keydown', onKeyDown); dialogRef.current?.focus(); return () => document.removeEventListener('keydown', onKeyDown); }, [open, onClose]);
  if (!open) return null;
  return <div className="ui-modal-backdrop" onMouseDown={event => closeOnOverlay && event.target === event.currentTarget && onClose?.()}><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ui-modal-title" className={['ui-modal', `ui-modal--${size}`, className].filter(Boolean).join(' ')}>
    <header className="ui-modal__header"><h2 id="ui-modal-title">{title}</h2><button type="button" onClick={onClose} aria-label="Đóng"><X /></button></header>
    <div className="ui-modal__body">{children}</div>
    {footer && <footer className="ui-modal__footer">{footer}</footer>}
  </section></div>;
}

export function ConfirmDialog({ open, title = 'Xác nhận thao tác', message, severity = 'warning', confirmText = 'Xác nhận', cancelText = 'Hủy', onConfirm, onCancel, loading = false }) {
  return <Modal open={open} title={title} onClose={onCancel} size="small" footer={<><button type="button" className="ui-feedback-button ui-feedback-button--secondary" onClick={onCancel} disabled={loading}>{cancelText}</button><button type="button" className={`ui-feedback-button ui-feedback-button--${severity}`} onClick={onConfirm} disabled={loading}>{loading ? 'Đang xử lý...' : confirmText}</button></>}><div className="ui-confirm"><div className={`ui-confirm__icon ui-confirm__icon--${severity}`}><AlertCircle /></div><p>{message}</p></div></Modal>;
}

export function ConfirmPopup({ open, anchorRef, message, onConfirm, onCancel, confirmText = 'Xác nhận', cancelText = 'Hủy' }) {
  return <FloatingPortal open={open} anchorRef={anchorRef} onDismiss={onCancel} align="end" minWidth={280} className="ui-confirm-popup" role="dialog"><p>{message}</p><div><button type="button" onClick={onCancel}>{cancelText}</button><button type="button" className="is-danger" onClick={onConfirm}>{confirmText}</button></div></FloatingPortal>;
}

export function OverlayPanel({ open, anchorRef, children, onClose, placement = 'bottom', className = '' }) {
  return <FloatingPortal open={open} anchorRef={anchorRef} onDismiss={onClose} placement={placement === 'top' ? 'top' : 'auto'} minWidth={240} className={['ui-overlay-panel', `ui-overlay-panel--${placement}`, className].filter(Boolean).join(' ')} role="dialog"><button type="button" className="ui-overlay-panel__close" onClick={onClose} aria-label="Đóng"><X /></button>{children}</FloatingPortal>;
}

export function Tooltip({ content, children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  return <span ref={rootRef} className="ui-tooltip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}><span>{children}</span><FloatingPortal open={open} anchorRef={rootRef} placement="top" align="start" offset={8} className="ui-tooltip__content" role="tooltip">{content}</FloatingPortal></span>;
}

export function Popover({ open, trigger, children, className = '', onClose }) { const rootRef = useRef(null); return <span ref={rootRef} className="ui-popover"><span>{trigger}</span><FloatingPortal open={open} anchorRef={rootRef} onDismiss={onClose} minWidth={240} className={['ui-popover__content', className].filter(Boolean).join(' ')} role="dialog">{children}</FloatingPortal></span>; }

export function Accordion({ items = [], multiple = false, defaultOpenKeys = [], className = '' }) {
  const [openKeys, setOpenKeys] = useState(defaultOpenKeys);
  const toggle = key => setOpenKeys(current => current.includes(key) ? current.filter(item => item !== key) : multiple ? [...current, key] : [key]);
  return <div className={['ui-accordion', className].filter(Boolean).join(' ')}>{items.map(item => { const open = openKeys.includes(item.key); return <section className={`ui-accordion__item${open ? ' is-open' : ''}`} key={item.key}><button type="button" className="ui-accordion__trigger" onClick={() => toggle(item.key)} aria-expanded={open}>{open ? <ChevronDown /> : <ChevronRight />}<span>{item.label}</span></button>{open && <div className="ui-accordion__content">{item.content}</div>}</section>; })}</div>;
}
