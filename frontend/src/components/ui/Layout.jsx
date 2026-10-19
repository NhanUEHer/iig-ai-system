import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import './layout.css';
import './layout-overrides.css';
import './header-menu.css';

export function AppShell({ sidebar, header, children, collapsed = false, className = '' }) {
  return <div className={['ui-shell', collapsed && 'ui-shell--collapsed', className].filter(Boolean).join(' ')}>
    {sidebar}
    <div className="ui-shell__main">{header}<main className="ui-shell__content">{children}</main></div>
  </div>;
}

export function Sidebar({ brand, items = [], collapsed = false, onToggle, footer, className = '' }) {
  return <aside className={['ui-sidebar', collapsed && 'ui-sidebar--collapsed', className].filter(Boolean).join(' ')}>
    <div className="ui-sidebar__brand">{brand}<button type="button" className="ui-sidebar__toggle" onClick={onToggle} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>{collapsed ? <ChevronRight /> : <ChevronLeft />}</button></div>
    <nav className="ui-sidebar__nav" aria-label="Menu chính">{items.map(item => item.group ? <SidebarGroup key={item.id || item.label} {...item} collapsed={collapsed} /> : <SidebarItem key={item.id || item.label} {...item} collapsed={collapsed} />)}</nav>
    {footer && <div className="ui-sidebar__footer">{footer}</div>}
  </aside>;
}

export function SidebarGroup({ label, items = [], collapsed = false, defaultOpen = true }) { const [open, setOpen] = React.useState(defaultOpen); return <section className="ui-sidebar__group"><button type="button" className="ui-sidebar__group-label" onClick={() => setOpen(!open)}>{!collapsed && <span>{label}</span>}{!collapsed && <ChevronDown className={open ? '' : 'is-collapsed'} />}</button>{open && !collapsed && <div className="ui-sidebar__group-items">{items.map(item => <SidebarItem key={item.id || item.label} {...item} collapsed={collapsed} />)}</div>}</section>; }

export function SidebarItem({ icon: Icon, label, active = false, disabled = false, badge, collapsed = false, children, onClick }) {
  return <div className="ui-sidebar__item-wrap">
    <button type="button" className={['ui-sidebar__item', active && 'is-active', disabled && 'is-disabled'].filter(Boolean).join(' ')} disabled={disabled} onClick={onClick} title={collapsed ? label : undefined}>
      {Icon && <Icon aria-hidden="true" />}{!collapsed && <span>{label}</span>}{!collapsed && badge != null && <em>{badge}</em>}
    </button>
    {!collapsed && children && <div className="ui-sidebar__submenu">{children}</div>}
  </div>;
}

export function Topbar({ left, right, className = '' }) {
  return <header className={['ui-topbar', className].filter(Boolean).join(' ')}><div>{left}</div><div className="ui-topbar__right">{right}</div></header>;
}

export function NotificationMenu({ count = 0, items = [], emptyText = 'Không có thông báo mới' }) { return <HeaderMenu label="Thông báo" badge={count} items={items} emptyText={emptyText} />; }
export function UserMenu({ name = 'Người dùng', email, avatar, items = [] }) { return <HeaderMenu label={name} avatar={avatar} items={items.length ? items : [{ label: 'Thông tin tài khoản' }, { label: 'Đăng xuất', danger: true }]} emptyText={email || ''} />; }
function HeaderMenu({ label, badge, avatar, items, emptyText }) { const [open, setOpen] = React.useState(false); const root = React.useRef(null); React.useEffect(() => { if (!open) return undefined; const outside = event => !root.current?.contains(event.target) && setOpen(false); const escape = event => event.key === 'Escape' && setOpen(false); document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape); return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); }; }, [open]); return <div ref={root} className="ui-header-menu"><button type="button" className="ui-header-menu__trigger" onClick={() => setOpen(!open)}>{avatar ? <img src={avatar} alt="" /> : <span className="ui-header-menu__avatar">{label.slice(0, 1).toUpperCase()}</span>}<span>{label}</span>{badge > 0 && <em>{badge}</em>}<ChevronDown /></button>{open && <div className="ui-header-menu__content">{emptyText && <small>{emptyText}</small>}{items.length ? items.map(item => <button type="button" key={item.label} className={item.danger ? 'is-danger' : ''} onClick={() => { item.onClick?.(); setOpen(false); }}>{item.icon}{item.label}</button>) : <p>{emptyText}</p>}</div>}</div>; }

export function Breadcrumb({ items = [], separator = '/' }) {
  return <nav className="ui-breadcrumb" aria-label="Breadcrumb">{items.map((item, index) => <React.Fragment key={`${item.label}-${index}`}>
    {index > 0 && <span aria-hidden="true">{separator}</span>}
    {item.current ? <strong aria-current="page">{item.label}</strong> : item.href ? <a href={item.href}>{item.label}</a> : <span>{item.label}</span>}
  </React.Fragment>)}</nav>;
}

export function ContextHeader({ breadcrumb = [], backButton, title, actions, className = '' }) {
  return <div className={['ui-context-header', className].filter(Boolean).join(' ')}><div className="ui-context-header__main">{backButton}{title ? <h1>{title}</h1> : <Breadcrumb items={breadcrumb} />}</div><div className="ui-context-header__actions">{actions}</div></div>;
}

export function PageHeader({ eyebrow, title, description, actions, backButton, horizontal = false, className = '' }) {
  return <div className={['ui-page-header', horizontal && 'ui-page-header--horizontal', className].filter(Boolean).join(' ')}>
    <div className="ui-page-header__main">{backButton && <div className="ui-page-header__back">{backButton}</div>}<div>{eyebrow && <div className="ui-page-header__eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div></div>
    {actions && <div className="ui-page-header__actions">{actions}</div>}
  </div>;
}
