import React from 'react';
import './typography.css';

const cx = (...names) => names.filter(Boolean).join(' ');

export function Display({ as: Tag = 'h1', children, className = '', ...props }) {
  return <Tag className={cx('iig3-type', 'iig3-display', className)} {...props}>{children}</Tag>;
}

export function Title({ as: Tag = 'h1', level = 1, children, className = '', ...props }) {
  return <Tag className={cx('iig3-type', `iig3-title-${level}`, className)} {...props}>{children}</Tag>;
}

export function Text({ as: Tag = 'p', size = 'md', tone = 'default', weight = 'regular', children, className = '', ...props }) {
  return <Tag className={cx('iig3-type', `iig3-text-${size}`, `is-${tone}`, `weight-${weight}`, className)} {...props}>{children}</Tag>;
}

export function Label({ as: Tag = 'span', children, className = '', ...props }) {
  return <Tag className={cx('iig3-type', 'iig3-label', className)} {...props}>{children}</Tag>;
}

export function Caption({ as: Tag = 'small', children, className = '', ...props }) {
  return <Tag className={cx('iig3-type', 'iig3-caption', className)} {...props}>{children}</Tag>;
}

export function CodeText({ as: Tag = 'code', children, className = '', ...props }) {
  return <Tag className={cx('iig3-type', 'iig3-code-text', className)} {...props}>{children}</Tag>;
}
