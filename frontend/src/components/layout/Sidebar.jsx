import React from 'react';
import { Archive, BarChart3, BookOpen, ChevronDown, ChevronLeft, ChevronRight, LogOut, Monitor, Settings, ShieldCheck, WalletCards } from 'lucide-react';
import { buildInfo } from '../../services/buildInfo';
import './Sidebar.css';
import './SidebarCollapsed.css';
import './SidebarCollapsedFix.css';

const groups = [
  { id: 'content-management', label: 'Quản lý nội dung', icon: Archive, items: [
    { id: 'question-bank', label: 'Ngân hàng câu hỏi', path: '/question-bank', permissions: ['question_bank.view', 'question_bank.manage'] },
    { id: 'question-groups', label: 'Quản lý nhóm câu hỏi', path: '/question-bank/groups', permissions: ['question_bank.view', 'question_bank.taxonomy_manage'] },
    { id: 'exams', label: 'Quản lý đề thi', path: '/exams', permissions: ['exams.view', 'exams.manage'] },
    { id: 'exam-events', label: 'Quản lý kỳ thi', path: '/exam-events', permissions: ['exam_events.view', 'exam_events.manage'] },
    { id: 'exam-candidates', label: 'Quản lý thí sinh', path: '/exam-candidates', permissions: ['exam_candidates.view', 'exam_candidates.export'] },
    { id: 'question-gen', label: 'Tạo câu hỏi', upcoming: true, permissions: ['audio.view', 'key_vocab.view', 'key_vocab.generate', 'key_vocab.manage'] },
    { id: 'lesson-content', label: 'Nội dung bài học', upcoming: true, permissions: ['audio.view', 'key_vocab.view', 'key_vocab.generate', 'key_vocab.manage'] },
  ] },
  { id: 'content-tools', label: 'Tạo & Phát triển', icon: BookOpen, items: [
    { id: 'content-sources', label: 'Nguồn học liệu', path: '/content-sources', permissions: ['content_sources.view', 'content_sources.create'] },
    { id: 'content-development', label: 'Phát triển học liệu', path: '/content-development', permissions: ['content_sources.view', 'content_sources.analyze'] },
    { id: 'local-tts', label: 'Audio Studio', path: '/local-tts', permission: 'audio.view' },
    { id: 'key-vocab', label: 'Tạo học liệu', path: '/key-vocab', permissions: ['key_vocab.view', 'key_vocab.generate', 'key_vocab.manage', 'dictionary.view', 'dictionary.generate', 'dictionary.manage'] },
  ] },
  { id: 'ai-scoring', label: 'AI Scoring & Khảo thí', icon: Monitor, items: [
    { id: 'submissions', label: 'Quản lý bài chấm', path: '/submissions', permission: 'submissions.view' },
    { id: 'mappings', label: 'Đồng bộ Keycode', path: '/mappings', permission: 'mappings.view' },
    { id: 'ai', label: 'Cấu hình AI Agents', path: '/ai', permission: 'agents.view' },
  ] },
  { id: 'reports', label: 'Báo cáo & Thống kê', icon: BarChart3, items: [
    { id: 'report-kpi', label: 'Dashboard KPI', path: '/reports/kpi', permission: 'reports.view' },
    { id: 'report-manage', label: 'Quản lý báo cáo', path: '/reports/manage', permissions: ['reports.forms.view', 'reports.entry', 'reports.review', 'reports.assign', 'reports.publish', 'reports.manage'] },
    { id: 'report-kpi-config', label: 'Cấu hình KPI', path: '/reports/kpi-config', permission: 'reports.manage' },
  ] },
  { id: 'expenses-group', label: 'Chi phí', icon: WalletCards, items: [
    { id: 'expenses', label: 'Import sao kê', path: '/expenses/imports', permissions: ['expenses.view', 'expenses.import', 'expenses.manage'] },
    { id: 'expense-transactions', label: 'Giao dịch ngân hàng', path: '/expenses/transactions', permissions: ['expenses.view', 'expenses.manage'] },
    { id: 'expense-dashboard', label: 'Báo cáo chi phí', path: '/expenses/dashboard', permissions: ['expenses.view', 'expenses.manage'] },
  ] },
  { id: 'administration', label: 'Quản trị', icon: ShieldCheck, items: [
    { id: 'users', label: 'Quản lý tài khoản', path: '/users', permission: 'users.view' },
    { id: 'roles', label: 'Vai trò & phân quyền', path: '/roles', permission: 'roles.view' },
    { id: 'logs', label: 'Nhật ký hệ thống', path: '/logs', permission: 'logs.view' },
  ] },
];

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || 'NH').toUpperCase();
}

export default function Sidebar({ sidebarCollapsed, toggleSidebar, activeTab, navigate, currentUser, handleLogout, onOpenAccount }) {
  const permissions = currentUser?.permissions || [];
  const canSee = item => (!item.permission || permissions.includes(item.permission)) && (!item.permissions || item.permissions.some(permission => permissions.includes(permission)));
  const visibleGroups = groups.map(group => ({ ...group, items: group.items.filter(canSee) })).filter(group => group.items.length);
  const [openGroups, setOpenGroups] = React.useState(() => Object.fromEntries(groups.map(group => [group.id, true])));
  const [flyoutGroup, setFlyoutGroup] = React.useState(null);
  const displayName = currentUser?.name || 'Người dùng';
  const roleName = currentUser?.roles?.map(role => role.name).join(', ') || currentUser?.roleName || 'Quản trị viên';

  return <aside className={`stitch-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
    <div className="stitch-sidebar__brand">
      <div className="stitch-sidebar__identity"><span className="stitch-sidebar__logo"><img src="/IIG_logo.webp" alt="IIG Việt Nam" /></span>{!sidebarCollapsed && <span className="stitch-sidebar__brand-copy"><strong>IIG Workspace</strong><small>Digital Product Hub</small></span>}</div>
      <button type="button" className="stitch-sidebar__collapse" onClick={toggleSidebar} title={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'} aria-label={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>{sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}</button>
    </div>
    <nav className="stitch-sidebar__nav" aria-label="Menu chính">{visibleGroups.map(group => {
      const GroupIcon = group.icon;
      const open = openGroups[group.id];
      const groupActive = group.items.some(item => item.id === activeTab);
      return <section className={`stitch-sidebar__group${groupActive ? ' is-active' : ''}${sidebarCollapsed ? ' is-collapsed-group' : ''}`} key={group.id} onMouseEnter={() => sidebarCollapsed && setFlyoutGroup(group.id)} onMouseLeave={() => sidebarCollapsed && setFlyoutGroup(null)}>
        <button type="button" className="stitch-sidebar__group-button" onClick={() => sidebarCollapsed ? setFlyoutGroup(current => current === group.id ? null : group.id) : setOpenGroups(current => ({ ...current, [group.id]: !current[group.id] }))} title={sidebarCollapsed ? group.label : undefined}>
          <span><GroupIcon aria-hidden="true" />{!sidebarCollapsed && <strong>{group.label}</strong>}</span>{!sidebarCollapsed && <ChevronDown className={open ? '' : 'is-closed'} aria-hidden="true" />}
        </button>
        {!sidebarCollapsed && open && <div className="stitch-sidebar__children">{group.items.map(item => <button type="button" key={item.id} className={`stitch-sidebar__child${activeTab === item.id ? ' is-active' : ''}${item.upcoming ? ' is-disabled' : ''}`} disabled={item.upcoming} onClick={() => item.path && navigate(item.path)}><span className="stitch-sidebar__dot" aria-hidden="true" /><span className="stitch-sidebar__child-label">{item.label}</span>{item.upcoming && <em>Sắp có</em>}</button>)}</div>}
        {sidebarCollapsed && flyoutGroup === group.id && <div className="stitch-sidebar__flyout" role="menu" aria-label={group.label}>
          <div className="stitch-sidebar__flyout-title"><span><i />{group.label}</span><b>{group.items.length} mục</b></div>
          <div className="stitch-sidebar__flyout-items">{group.items.map(item => <button type="button" role="menuitem" key={item.id} className={`stitch-sidebar__flyout-item${activeTab === item.id ? ' is-active' : ''}${item.upcoming ? ' is-disabled' : ''}`} disabled={item.upcoming} onClick={() => { if (item.path) navigate(item.path); setFlyoutGroup(null); }}><i /><span>{item.label}</span>{item.upcoming && <em>Sắp có</em>}</button>)}</div>
        </div>}
      </section>;
    })}</nav>
    <div className="stitch-sidebar__footer">
      {!sidebarCollapsed && <div className="stitch-sidebar__build"><span><b>{buildInfo.label}</b><code>v{buildInfo.version}</code></span><span><i />System Active</span></div>}
      <div className="stitch-sidebar__account"><span className="stitch-sidebar__avatar">{initials(displayName)}</span>{!sidebarCollapsed && <span className="stitch-sidebar__user-copy"><strong>{displayName}</strong><small>{roleName}</small></span>}<span className="stitch-sidebar__account-actions"><button type="button" onClick={onOpenAccount} title="Thông tin tài khoản" aria-label="Thông tin tài khoản"><Settings /></button><button type="button" className="is-logout" onClick={handleLogout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut /></button></span></div>
    </div>
  </aside>;
}
