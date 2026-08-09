import {
  AudioLines, Bot, ChevronLeft, ChevronRight, ClipboardCheck, FileSearch,
  FileText, KeyRound, LayoutGrid, LogOut, Moon, NotebookPen, ScrollText, Settings2,
  Sun, UserRoundCog, ShieldCheck
} from 'lucide-react';
import './Sidebar.css';
import { buildInfo } from '../../services/buildInfo';

const groups = [
  {
    label: 'AI Scoring',
    items: [
      { id: 'submissions', label: 'Quản lý bài chấm', icon: ClipboardCheck, path: '/submissions', permission: 'submissions.view' },
      { id: 'mappings', label: 'Đồng bộ Keycode', icon: FileSearch, path: '/mappings', permission: 'mappings.view' },
      { id: 'ai', label: 'Cấu hình AI Agents', icon: Bot, path: '/ai', permission: 'agents.view' }
    ]
  },
  {
    label: 'Content Tools',
    items: [
      { id: 'local-tts', label: 'Audio Studio', icon: AudioLines, path: '/local-tts', permission: 'audio.view' },
      { id: 'question-gen', label: 'Tạo câu hỏi', icon: NotebookPen, upcoming: true },
      { id: 'lesson-content', label: 'Nội dung bài học', icon: FileText, upcoming: true }
    ]
  },
  {
    label: 'Báo cáo',
    items: [
      { id: 'report-kpi', label: 'Dashboard KPI', icon: LayoutGrid, path: '/reports/kpi', permission: 'reports.view' },
      { id: 'report-manage', label: 'Quản lý báo cáo', icon: FileText, path: '/reports/manage', permissions: ['reports.forms.view','reports.entry','reports.review','reports.assign','reports.publish','reports.manage'] },
      { id: 'report-kpi-config', label: 'Cấu hình KPI', icon: Settings2, path: '/reports/kpi-config', permission: 'reports.manage' }
    ]
  },
  {
    label: 'Quản trị',
    items: [
      { id: 'users', label: 'Quản lý tài khoản', icon: UserRoundCog, path: '/users', permission: 'users.view' },
      { id: 'roles', label: 'Vai trò & phân quyền', icon: ShieldCheck, path: '/roles', permission: 'roles.view' },
      { id: 'logs', label: 'Nhật ký hệ thống', icon: ScrollText, path: '/logs', permission: 'logs.view' }
    ]
  }
];

export default function Sidebar({
  sidebarCollapsed, toggleSidebar, activeTab, navigate, currentUser,
  handleLogout, toggleTheme, isLightTheme
}) {
  return <aside className={`workspace-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
    <header className="workspace-sidebar-brand">
      <div className="workspace-sidebar-logo"><img src="/IIG_logo.webp" alt="IIG" /></div>
      {!sidebarCollapsed && <div className="workspace-sidebar-brand-copy"><strong>IIG Workspace</strong><span>Digital Product Hub</span></div>}
      <button className="workspace-collapse-button" onClick={toggleSidebar} title={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>{sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}</button>
    </header>

    <nav className="workspace-sidebar-nav">
      {groups.map(group => <section className="workspace-nav-group" key={group.label}>
        {!sidebarCollapsed && <div className="workspace-nav-label">{group.label}</div>}
        {group.items.filter(item => (!item.permission || currentUser?.permissions?.includes(item.permission))&&(!item.permissions||item.permissions.some(permission=>currentUser?.permissions?.includes(permission)))).map(item => {
          const Icon = item.icon;
          return <button
            key={item.id}
            className={`workspace-nav-item${activeTab === item.id ? ' active' : ''}${item.upcoming ? ' upcoming' : ''}`}
            onClick={() => !item.upcoming && navigate(item.path)}
            title={item.upcoming ? `${item.label} · Sắp có` : item.label}
            disabled={item.upcoming}
          >
            <Icon /><span className="workspace-nav-text">{item.label}</span>
            {!sidebarCollapsed && item.upcoming && <em>Sắp có</em>}
          </button>;
        })}
      </section>)}
    </nav>

    <footer className="workspace-sidebar-footer">
      {!sidebarCollapsed && <div className={`workspace-build-badge ${buildInfo.environment}`} title={buildInfo.commit ? `Commit ${buildInfo.commit}` : undefined}><span>{buildInfo.label}</span><strong>v{buildInfo.version}</strong></div>}
      <button className="workspace-nav-item" onClick={() => navigate('/change-password')} title="Đổi mật khẩu"><KeyRound /><span className="workspace-nav-text">Đổi mật khẩu</span></button>
      <div className="workspace-user-card">
        <div className="workspace-user-avatar">{(currentUser?.name || 'US').trim().slice(0, 2).toUpperCase()}</div>
        {!sidebarCollapsed && <div className="workspace-user-copy"><strong>{currentUser?.name}</strong><span>{currentUser?.roleName || currentUser?.role}</span></div>}
        <div className="workspace-user-actions">
          <button onClick={toggleTheme} title={isLightTheme ? 'Dùng giao diện tối' : 'Dùng giao diện sáng'}>{isLightTheme ? <Moon /> : <Sun />}</button>
          <button onClick={handleLogout} title="Đăng xuất"><LogOut /></button>
        </div>
      </div>
    </footer>
  </aside>;
}
