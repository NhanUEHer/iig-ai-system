import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ChevronRight, Eye, EyeOff, KeyRound, LogOut, Mail, ShieldCheck, X } from 'lucide-react';
import api from '../../../services/api';
import './AccountProfileModal.css';

const formatDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value)) : 'Chưa có dữ liệu';
const formatDateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Chưa đăng nhập';
const initials = name => (name || 'ND').trim().split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('').toUpperCase();

export default function AccountProfileModal({ open, onClose, currentUser, onLogout, showMsg }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [visiblePasswords, setVisiblePasswords] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    api.get('/auth/profile').then(response => {
      if (active) {
        setProfile(response.data.user);
        setExpandedGroups(Object.fromEntries((response.data.user.permissionGroups || []).map(group => [group.code, true])));
      }
    }).catch(() => {
      if (active) setProfile(currentUser);
      showMsg('Không thể tải đầy đủ thông tin tài khoản.', 'error');
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [open, currentUser, showMsg]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const validPassword = form.newPassword.length >= 8 && form.newPassword === form.confirmPassword;
  const canSave = Boolean(form.currentPassword) && validPassword && !saving;
  const permissions = useMemo(() => profile?.permissionGroups || [], [profile]);
  const user = profile || currentUser || {};

  const submit = async event => {
    event.preventDefault();
    if (!canSave) return showMsg('Mật khẩu mới cần tối thiểu 8 ký tự và khớp xác nhận.', 'error');
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      showMsg('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.', 'success');
      onClose();
      setTimeout(onLogout, 700);
    } catch (error) {
      showMsg(error.response?.data?.error || 'Không thể đổi mật khẩu.', 'error');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return <div className="account-profile-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="account-profile-modal" role="dialog" aria-modal="true" aria-labelledby="account-profile-title">
      <header className="account-profile-modal__hero">
        <button type="button" className="account-profile-modal__close" aria-label="Đóng" onClick={onClose}><X /></button>
        <div><span>Hồ sơ tài khoản</span><small>ID: #{String(user.id || '').slice(0, 8).toUpperCase() || '—'}</small></div>
      </header>
      <form className="account-profile-modal__form" onSubmit={submit}>
      <div className="account-profile-modal__body">
        <article className="account-profile-modal__identity">
          <span className="account-profile-modal__avatar">{initials(user.name)}<i /></span>
          <div className="account-profile-modal__identity-copy"><div className="account-profile-modal__name-row"><h1 id="account-profile-title">{loading ? 'Đang tải…' : (user.name || 'Người dùng')}</h1><em><i />{user.is_active === false ? 'Tạm dừng' : 'Hoạt động'}</em></div><p><Mail />{user.email || '—'}</p></div><b><ShieldCheck />{user.roleName || user.roles?.find(role => role.isPrimary)?.name || 'Chưa có vai trò'}</b>
        </article>

        <section className="account-profile-modal__details" aria-label="Thông tin tài khoản">
          <div><span>Phòng ban / Đơn vị</span><strong>{user.department || 'Chưa cập nhật'}</strong></div>
          <div><span>Ngày gia nhập</span><strong>{formatDate(user.created_at)}</strong></div>
          <div><span>Lần đăng nhập cuối</span><strong>{formatDateTime(user.last_login_at)}</strong></div>
          <div><span>Xác thực 2 bước (2FA)</span><strong className={user.twoFactorEnabled ? 'is-enabled' : ''}>{user.twoFactorEnabled ? 'Đã kích hoạt' : 'Chưa thiết lập'}</strong></div>
        </section>

        <section className="account-profile-modal__permissions">
          <div className="account-profile-modal__section-title"><h2><BadgeCheck />Danh sách quyền hạn được cấp (Permissions)</h2><span>{user.totalPermissions || 0} quyền kích hoạt</span></div>
          <div className="account-profile-modal__permission-actions"><button type="button" onClick={() => setExpandedGroups(Object.fromEntries(permissions.map(group => [group.code, false])))}>Thu gọn tất cả</button><i>|</i><button type="button" onClick={() => setExpandedGroups(Object.fromEntries(permissions.map(group => [group.code, true])))}>Mở rộng tất cả</button></div>
          <div className="account-profile-modal__permission-accordion">{permissions.map(group => <details key={group.code} open={expandedGroups[group.code] !== false} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedGroups(current => ({ ...current, [group.code]: isOpen })); }}>
            <summary><div><ChevronRight /><strong>{group.name}</strong><span>{group.permissions.length} quyền</span></div><em><i />Đã cấp toàn quyền</em></summary>
            <div className="account-profile-modal__permission-items">{group.permissions.map(permission => <article key={permission.code}><div><i /> <strong>{permission.name}</strong></div><code>{permission.code}</code></article>)}</div>
          </details>)}</div>
        </section>

        <section className="account-profile-modal__security">
          <div className="account-profile-modal__security-title"><i><KeyRound /></i><div><h2>Bảo mật & Đổi mật khẩu</h2><p>{user.password_changed_at ? `Cập nhật ${formatDate(user.password_changed_at)}` : 'Chưa có lịch sử thay đổi mật khẩu'}</p></div></div>
          <div className="account-profile-modal__passwords">{[
            ['currentPassword', 'Mật khẩu hiện tại', 'current-password'],
            ['newPassword', 'Mật khẩu mới', 'new-password'],
            ['confirmPassword', 'Xác nhận mật khẩu', 'new-password']
          ].map(([key, placeholder, autoComplete]) => <label key={key}><input aria-label={placeholder} type={visiblePasswords[key] ? 'text' : 'password'} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} autoComplete={autoComplete} placeholder={placeholder} /><button type="button" aria-label={visiblePasswords[key] ? `Ẩn ${placeholder.toLowerCase()}` : `Hiện ${placeholder.toLowerCase()}`} onClick={() => setVisiblePasswords(current => ({ ...current, [key]: !current[key] }))}>{visiblePasswords[key] ? <EyeOff /> : <Eye />}</button></label>)}</div>
        </section>
      </div>
      <footer className="account-profile-modal__footer"><button type="button" className="account-profile-modal__logout" onClick={onLogout}><LogOut />Đăng xuất</button><div><button type="button" className="account-profile-modal__cancel" onClick={onClose}>Đóng</button><button type="submit" className="account-profile-modal__submit" disabled={!canSave}>{saving ? 'Đang cập nhật…' : 'Lưu & Cập nhật'}</button></div></footer>
      </form>
    </section>
  </div>;
}
