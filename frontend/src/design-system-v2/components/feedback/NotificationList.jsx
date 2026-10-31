import React from 'react';
import { Bell, Check } from 'lucide-react';
import { IconButton } from '../primitives/Primitives';
import '../components.css';

export function NotificationList({ items = [], onRead, empty = 'No notifications' }) {
  if (!items.length) return <p role="status">{empty}</p>;
  return <div className="iig3-notification-list" aria-label="Notifications">{items.map(item => <article className={`iig3-notification-item ${item.read ? '' : 'is-unread'}`} key={item.id}><Bell aria-hidden="true" /><div><header><strong>{item.title}</strong><time dateTime={item.dateTime}>{item.time}</time></header>{item.description && <p>{item.description}</p>}</div>{!item.read && <IconButton label={`Mark ${item.title} as read`} size="sm" onClick={() => onRead?.(item.id)}><Check /></IconButton>}</article>)}</div>;
}
