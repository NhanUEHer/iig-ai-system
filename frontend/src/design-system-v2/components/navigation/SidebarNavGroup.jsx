import React, { useId } from 'react';
import { SidebarNavItem } from './SidebarNavItem';

export function SidebarNavGroup({ group, collapsed, onNavigate, LinkComponent }) {
  const headingId = useId();
  return <section className="iig3-sidebar-group" aria-labelledby={headingId}><h2 id={headingId}>{group.label}</h2>{group.items.filter(item => !item.hidden).map(item => <SidebarNavItem key={item.id || item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} LinkComponent={LinkComponent} />)}</section>;
}
