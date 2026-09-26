import React from 'react';
import './primitives.css';

export function Avatar({ src, name = '', size = 'normal', status, className = '' }) { const initials = name.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase(); return <span className={`ui-avatar ui-avatar--${size} ${className}`} title={name}>{src ? <img src={src} alt={name} /> : initials || '?'}{status && <StatusDot status={status} />}</span>; }
export function AvatarGroup({ users = [], max = 4, size = 'small' }) { return <div className="ui-avatar-group">{users.slice(0, max).map(user => <Avatar key={user.id || user.name} {...user} size={size} />)}{users.length > max && <span className={`ui-avatar ui-avatar--${size} ui-avatar--more`}>+{users.length - max}</span>}</div>; }
export function StatusDot({ status = 'neutral', label }) { return <span className={`ui-status-dot ui-status-dot--${status}`} title={label || status} aria-label={label || status} />; }
export function Spinner({ size = 'normal', label = 'Đang tải...' }) { return <span className={`ui-spinner ui-spinner--${size}`} role="status" aria-label={label} />; }
export function Skeleton({ width = '100%', height = 16, radius = 4, className = '' }) { return <span className={`ui-skeleton ${className}`} style={{ width, height, borderRadius: radius }} aria-hidden="true" />; }
export function Divider({ vertical = false, label }) { return <div className={`ui-divider${vertical ? ' ui-divider--vertical' : ''}`}>{label && <span>{label}</span>}</div>; }
export function Link({ children, href = '#', external = false, className = '', ...props }) { return <a className={`ui-link ${className}`} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} {...props}>{children}</a>; }
