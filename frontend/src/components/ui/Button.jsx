import React from 'react';
import { LoaderCircle } from 'lucide-react';
import './ui.css';

const Button = React.forwardRef(function Button({ variant = 'primary', size = 'normal', iconOnly = false, loading = false, icon, iconPosition = 'start', className = '', children, disabled, ...props }, ref) {
  const classes = ['ui-button', `ui-button--${variant}`, size !== 'normal' && `ui-button--${size}`, iconOnly && 'ui-button--icon', loading && 'ui-button--loading', className].filter(Boolean).join(' ');
  return <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
    {loading ? <LoaderCircle className="ui-button__spinner" aria-hidden="true" /> : iconPosition === 'start' && icon}
    {(!iconOnly || !icon) && children}
    {!loading && iconPosition === 'end' && icon}
  </button>;
});

export default Button;

export function IconButton({ size = 'normal', variant = 'default', className = '', children, ...props }) {
  return <button className={['ui-icon-button', size !== 'normal' && `ui-icon-button--${size}`, variant !== 'default' && `ui-icon-button--${variant}`, className].filter(Boolean).join(' ')} {...props}>{children}</button>;
}
