import React, { useEffect } from 'react';
import { Menu } from 'lucide-react';
import { IconButton } from '../primitives/Primitives';
import { Sidebar } from './Sidebar';
import { useControllableState } from './useControllableState';
import './sidebar.css';

export function AppShell({ brand = 'IIG Admin', brandMark = 'AI', workspace, navigation = [], sidebarFooter, topbar, children, sidebarCollapsed, defaultSidebarCollapsed = false, onSidebarCollapsedChange, mobileNavigationOpen, defaultMobileNavigationOpen = false, onMobileNavigationOpenChange, onNavigate, LinkComponent, className = '' }) {
  const [collapsed, setCollapsed] = useControllableState({ value: sidebarCollapsed, defaultValue: defaultSidebarCollapsed, onChange: onSidebarCollapsedChange });
  const [mobileOpen, setMobileOpen] = useControllableState({ value: mobileNavigationOpen, defaultValue: defaultMobileNavigationOpen, onChange: onMobileNavigationOpenChange });
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const close = event => { if (event.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', close); document.body.classList.add('iig3-has-open-navigation');
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('iig3-has-open-navigation'); };
  }, [mobileOpen, setMobileOpen]);
  return <div className={`iig3-app-shell ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'has-mobile-navigation' : ''} ${className}`}><button type="button" className="iig3-sidebar-backdrop" aria-label="Close navigation" tabIndex={mobileOpen ? 0 : -1} onClick={() => setMobileOpen(false)} /><Sidebar brand={brand} brandMark={brandMark} workspace={workspace} groups={navigation} footer={sidebarFooter} collapsed={collapsed} onCollapsedChange={setCollapsed} onMobileOpenChange={setMobileOpen} onNavigate={onNavigate} LinkComponent={LinkComponent} /><main className="iig3-app-main"><header className="iig3-app-topbar"><IconButton className="iig3-app-topbar__menu" size="sm" label="Open navigation" onClick={() => setMobileOpen(true)}><Menu /></IconButton><div className="iig3-app-topbar__content">{topbar}</div></header><div className="iig3-app-content">{children}</div></main></div>;
}
