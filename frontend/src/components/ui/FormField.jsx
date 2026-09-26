import React from 'react';
import './ui.css';

export function FormField({ label, required, hint, error, id, className = '', children }) {
  return <div className={['ui-field', className].filter(Boolean).join(' ')}>{label && <label className="ui-field__label" htmlFor={id}>{label}{required && <span className="ui-field__required"> *</span>}</label>}{children}{hint && !error && <small className="ui-field__hint">{hint}</small>}{error && <small className="ui-field__error" role="alert">{error}</small>}</div>;
}

export function Input({ size, className = '', ...props }) { return <input className={['ui-control', size && `ui-control--${size}`, className].filter(Boolean).join(' ')} {...props} />; }
export function Select({ size, className = '', children, ...props }) { return <select className={['ui-control', size && `ui-control--${size}`, className].filter(Boolean).join(' ')} {...props}>{children}</select>; }
export function Textarea({ size, className = '', ...props }) { return <textarea className={['ui-control', 'ui-control--textarea', size && `ui-control--${size}`, className].filter(Boolean).join(' ')} {...props} />; }
