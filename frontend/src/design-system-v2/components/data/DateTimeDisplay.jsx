import React from 'react';

const formats = {
  date: { dateStyle: 'short' },
  datetime: { dateStyle: 'short', timeStyle: 'short' },
};

export function DateTimeDisplay({ value, variant = 'datetime', locale = 'vi-VN', timeZone, fallback = '—', className = '' }) {
  if (!value) return <span className={className}>{fallback}</span>;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return <span className={className}>{fallback}</span>;
  const options = variant === 'relative' ? null : { ...(formats[variant] || formats.datetime), ...(timeZone ? { timeZone } : {}) };
  let text;
  if (variant === 'relative') {
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const [amount, unit] = Math.abs(seconds) < 60 ? [seconds, 'second'] : Math.abs(seconds) < 3600 ? [Math.round(seconds / 60), 'minute'] : Math.abs(seconds) < 86400 ? [Math.round(seconds / 3600), 'hour'] : [Math.round(seconds / 86400), 'day'];
    text = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit);
  } else text = new Intl.DateTimeFormat(locale, options).format(date);
  return <time className={className} dateTime={date.toISOString()} title={new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'long', ...(timeZone ? { timeZone } : {}) }).format(date)}>{text}</time>;
}
