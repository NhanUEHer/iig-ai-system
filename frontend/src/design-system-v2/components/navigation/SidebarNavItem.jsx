import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const cx = (...names) => names.filter(Boolean).join(' ');

export function SidebarNavItem({ item, collapsed = false, depth = 0, onNavigate, LinkComponent }) {
  const [expanded, setExpanded] = useState(item.defaultExpanded ?? item.children?.some(child => child.active) ?? false);
  const Icon = item.icon;
  const hasChildren = Boolean(item.children?.length);
  const content = <><span className="iig3-sidebar-item__icon">{Icon && <Icon aria-hidden="true" />}{item.indicator && <i className={`is-${item.indicator}`} />}</span><span className="iig3-sidebar-item__label">{item.label}</span>{item.count != null && <span className="iig3-sidebar-item__count">{item.count}</span>}{hasChildren && <span className="iig3-sidebar-item__chevron">{expanded ? <ChevronDown /> : <ChevronRight />}</span>}</>;
  const common = { className: cx('iig3-sidebar-item', item.active && 'is-active'), 'aria-current': item.active ? 'page' : undefined, 'aria-label': collapsed ? item.label : undefined, 'data-tooltip': collapsed ? item.label : undefined };
  let control;
  if (hasChildren) control = <button type="button" {...common} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{content}</button>;
  else if (LinkComponent && item.to) control = <LinkComponent {...common} to={item.to} onClick={() => onNavigate?.(item)}>{content}</LinkComponent>;
  else if (item.href || item.to) control = <a {...common} href={item.href || item.to} onClick={() => onNavigate?.(item)}>{content}</a>;
  else control = <button type="button" {...common} disabled={item.disabled} onClick={() => { item.onClick?.(); onNavigate?.(item); }}>{content}</button>;
  return <div className="iig3-sidebar-item-wrap" style={{ '--iig3-sidebar-depth': depth }}>{control}{hasChildren && expanded && !collapsed && <div className="iig3-sidebar-submenu">{item.children.map(child => <SidebarNavItem key={child.id || child.label} item={child} depth={depth + 1} onNavigate={onNavigate} LinkComponent={LinkComponent} />)}</div>}</div>;
}
