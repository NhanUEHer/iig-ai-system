import React from 'react';
import { SidebarNavGroup } from './SidebarNavGroup';

export function SidebarNav({ groups = [], collapsed = false, onNavigate, LinkComponent, label = 'Primary navigation' }) {
  return <nav className="iig3-sidebar-nav" aria-label={label}>{groups.map(group => <SidebarNavGroup key={group.id || group.label} group={group} collapsed={collapsed} onNavigate={onNavigate} LinkComponent={LinkComponent} />)}</nav>;
}
