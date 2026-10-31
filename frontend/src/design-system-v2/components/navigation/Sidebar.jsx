import React from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { IconButton } from '../primitives/Primitives';
import { SidebarNav } from './SidebarNav';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function Sidebar({ brand = 'IIG Admin', brandMark = 'AI', workspace, groups, footer, collapsed, onCollapsedChange, onMobileOpenChange, onNavigate, LinkComponent }) {
  const navigate = item => { onNavigate?.(item); onMobileOpenChange?.(false); };
  return <aside className="iig3-sidebar" aria-label="Application sidebar"><header className="iig3-sidebar__brand"><span>{brandMark}</span><strong>{brand}</strong><IconButton className="iig3-sidebar__collapse" size="sm" variant="ghost" label={collapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => onCollapsedChange?.(!collapsed)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</IconButton><IconButton className="iig3-sidebar__mobile-close" size="sm" variant="ghost" label="Close navigation" onClick={() => onMobileOpenChange?.(false)}><X /></IconButton></header>{workspace && <div className="iig3-sidebar__workspace"><WorkspaceSwitcher {...workspace} collapsed={collapsed} /></div>}<div className="iig3-sidebar__scroll"><SidebarNav groups={groups} collapsed={collapsed} onNavigate={navigate} LinkComponent={LinkComponent} /></div>{footer && <footer className="iig3-sidebar__footer">{footer}</footer>}</aside>;
}
