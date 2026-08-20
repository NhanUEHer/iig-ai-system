import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ArrowRight, Edit2, Eye, EyeOff, KeyRound, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';
import './UserManagementPage.css';
import './UserManagementTypography.css';
import './UserMultiRole.css';
import './UserPassword.css';

const emptyUser = { name: '', email: '', password: '', roleSlugs: [], primaryRoleSlug: '', isActive: true };
export default function UserManagementPage({ currentUser, showMsg }) {
  const can = permission => currentUser?.permissions?.includes(permission);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [userForm, setUserForm] = useState(emptyUser);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const requests = [axios.get('/api/auth/users', { params: { page: nextPage, limit: 10, search: search.trim() || undefined } })];
      if (can('roles.view') || can('users.manage')) requests.push(axios.get('/api/auth/roles', { params: { page: 1, limit: 100 } }));
      const [userResponse, roleResponse] = await Promise.all(requests);
      setUsers(userResponse.data.users || []);
      setMeta(userResponse.data.meta || { page: nextPage, limit: 10, total: 0, totalPages: 1 });
      if (roleResponse) setRoles(roleResponse.data.data || []);
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể tải dữ liệu quản trị.', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(() => load(page), 250); return () => clearTimeout(timer); }, [page, search]);
  useEffect(() => { setShowPassword(false); }, [modal?.type, modal?.id]);

  const visibleUsers = users;
  const openUser = user => {
    setShowPassword(false);
    const defaults = user?.roles?.map(role => role.slug) || [];
    const fallback = roles.find(role => role.slug === 'user')?.slug || roles[0]?.slug || '';
    const roleSlugs = defaults.length ? defaults : [user?.role || fallback].filter(Boolean);
    setUserForm(user ? { name: user.name, email: user.email, password: '', roleSlugs, primaryRoleSlug: user.roles?.find(role => role.isPrimary)?.slug || user.role || roleSlugs[0], isActive: user.is_active }
      : { ...emptyUser, roleSlugs: fallback ? [fallback] : [], primaryRoleSlug: fallback });
    setModal({ type: 'user', id: user?.id });
  };
  const toggleRole = slug => setUserForm(current => {
    const selected = current.roleSlugs.includes(slug) ? current.roleSlugs.filter(item => item !== slug) : [...current.roleSlugs, slug];
    return { ...current, roleSlugs: selected, primaryRoleSlug: selected.includes(current.primaryRoleSlug) ? current.primaryRoleSlug : (selected[0] || '') };
  });
  const effectivePermissions = [...new Set(roles.filter(role => userForm.roleSlugs.includes(role.slug)).flatMap(role => role.permissions || []))];

  const saveUser = async event => {
    event.preventDefault();
    try {
      if (!userForm.roleSlugs.length) return showMsg?.('Vui lòng chọn ít nhất một vai trò.', 'error');
      if (modal.id) await axios.put(`/api/auth/users/${modal.id}`, userForm);
      else await axios.post('/api/auth/users', userForm);
      showMsg?.(modal.id ? 'Đã cập nhật tài khoản.' : 'Đã tạo tài khoản.', 'success'); setModal(null); await load(page);
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu tài khoản.', 'error'); }
  };
  const resetPassword = async event => { event.preventDefault(); try { await axios.put(`/api/auth/users/${modal.id}/password`, { password: userForm.password }); showMsg?.('Đã đặt lại mật khẩu.', 'success'); setModal(null); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể đặt lại mật khẩu.', 'error'); } };
  const removeUser = async user => { if (!window.confirm(`Xóa tài khoản ${user.email}?`)) return; try { await axios.delete(`/api/auth/users/${user.id}`); showMsg?.('Đã xóa tài khoản.', 'success'); await load(page); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xóa tài khoản.', 'error'); } };

  return <div className="user-admin-page">
    <header className="user-admin-header"><div><span className="user-admin-eyebrow">QUẢN TRỊ · ACCOUNT MANAGEMENT</span><h1>Quản lý tài khoản</h1><p>Quản lý tài khoản, trạng thái truy cập và vai trò được gán.</p></div>{can('users.manage') && <button className="btn-primary" onClick={() => openUser()}><Plus />Tạo tài khoản</button>}</header>
    <section className="user-admin-metrics"><article><span><Users /></span><div><small>Tổng tài khoản</small><strong>{meta.total}</strong></div></article><article><span><UserCheck /></span><div><small>Đang hoạt động trang này</small><strong>{users.filter(u => u.is_active).length}</strong></div></article><article><span><ShieldCheck /></span><div><small>Vai trò</small><strong>{roles.length}</strong></div></article></section>
    <section className="user-admin-card">
      <div className="user-admin-toolbar"><div className="user-admin-tabs"><button className="active">Tài khoản</button></div><label className="user-search"><Search /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm tên, email hoặc vai trò…" /></label></div>
      {loading ? <div className="user-loading"><RefreshCw className="spin" /></div> : <div className="user-table-wrap"><table><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th /></tr></thead><tbody>{visibleUsers.map(user => <tr key={user.id}><td><div className="user-identity"><span>{(user.name || 'U').slice(0,2).toUpperCase()}</span><div><strong>{user.name}{user.id === currentUser?.id && <em>Bạn</em>}</strong><small>{user.email}</small></div></div></td><td><div className="role-pill-list">{(user.roles || []).slice(0,2).map(role => <span className="role-pill" key={role.slug}><KeyRound />{role.name}</span>)}{user.roles?.length > 2 && <span className="role-more">+{user.roles.length - 2}</span>}</div></td><td><span className={`account-status ${user.is_active ? 'active' : 'locked'}`}>{user.is_active ? 'Đang hoạt động' : 'Đã khóa'}</span></td><td><small>{user.last_login_at ? new Date(user.last_login_at).toLocaleString('vi-VN') : 'Chưa đăng nhập'}</small></td><td><div className="row-actions">{can('users.manage') && <button title="Đặt lại mật khẩu" onClick={() => { setUserForm({...emptyUser,password:''}); setModal({type:'password',id:user.id,name:user.name}); }}><KeyRound /></button>}{can('users.manage') && <button title="Chỉnh sửa" onClick={() => openUser(user)}><Edit2 /></button>}{can('users.manage') && <button className="danger" disabled={user.id === currentUser?.id} title="Xóa" onClick={() => removeUser(user)}><Trash2 /></button>}</div></td></tr>)}</tbody></table></div>}
      {meta.total > 0 && <footer className="list-pagination"><span>Hiển thị {users.length} / {meta.total} tài khoản</span><div><span>Trang {meta.page}/{meta.totalPages}</span><button disabled={meta.page <= 1} onClick={() => setPage(value => value - 1)}><ArrowLeft /></button><button disabled={meta.page >= meta.totalPages} onClick={() => setPage(value => value + 1)}><ArrowRight /></button></div></footer>}
    </section>

    {modal?.type === 'user' && <div className="user-modal-backdrop"><form className="user-modal" onSubmit={saveUser}><h2>{modal.id ? 'Cập nhật tài khoản' : 'Tạo tài khoản mới'}</h2><p>{modal.id ? 'Cập nhật thông tin, vai trò và trạng thái truy cập.' : 'Nhập mật khẩu ban đầu để tài khoản có thể đăng nhập ngay.'}</p><label>Họ và tên<input value={userForm.name} onChange={e => setUserForm({...userForm,name:e.target.value})} required /></label><label>Email<input type="email" value={userForm.email} onChange={e => setUserForm({...userForm,email:e.target.value})} required /></label>{!modal.id&&<label>Mật khẩu ban đầu<div className="admin-password-input"><input type={showPassword?'text':'password'} value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} minLength={8} autoComplete="new-password" required /><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}>{showPassword?<EyeOff/>:<Eye/>}</button></div><small>Tối thiểu 8 ký tự.</small></label>}<div className="multi-role-field"><strong>Vai trò</strong><small>Chọn một hoặc nhiều vai trò cho tài khoản.</small><div className="multi-role-options">{roles.map(role => <label key={role.slug} className={userForm.roleSlugs.includes(role.slug) ? 'selected' : ''}><input type="checkbox" checked={userForm.roleSlugs.includes(role.slug)} onChange={() => toggleRole(role.slug)} /><span><b>{role.name}</b><small>{role.description || role.slug}</small></span></label>)}</div></div>{userForm.roleSlugs.length > 1 && <label>Vai trò chính<select value={userForm.primaryRoleSlug} onChange={e => setUserForm({...userForm,primaryRoleSlug:e.target.value})}>{roles.filter(role => userForm.roleSlugs.includes(role.slug)).map(role => <option key={role.slug} value={role.slug}>{role.name}</option>)}</select></label>}<div className="effective-permissions"><ShieldCheck /><span><strong>{effectivePermissions.length} quyền hiệu lực</strong><small>Được hợp nhất từ {userForm.roleSlugs.length} vai trò đã chọn</small></span></div>{modal.id && <label className="switch-line"><input type="checkbox" checked={userForm.isActive} onChange={e => setUserForm({...userForm,isActive:e.target.checked})} /> Cho phép đăng nhập</label>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setModal(null)}>Hủy</button><button className="btn-primary">{modal.id ? 'Lưu thay đổi' : 'Tạo tài khoản'}</button></div></form></div>}
    {modal?.type==='password'&&<div className="user-modal-backdrop"><form className="user-modal" onSubmit={resetPassword}><h2>Đặt lại mật khẩu</h2><p>Tạo mật khẩu mới cho {modal.name}. Các phiên đăng nhập hiện tại sẽ bị thu hồi.</p><label>Mật khẩu mới<div className="admin-password-input"><input type={showPassword?'text':'password'} value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} minLength={8} autoComplete="new-password" required /><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}>{showPassword?<EyeOff/>:<Eye/>}</button></div><small>Tối thiểu 8 ký tự.</small></label><div className="modal-actions"><button type="button" className="btn-secondary" onClick={()=>setModal(null)}>Hủy</button><button className="btn-primary">Đặt lại mật khẩu</button></div></form></div>}
  </div>;
}
