import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ArrowRight, Edit2, KeyRound, MailPlus, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';
import './UserManagementPage.css';
import './UserManagementTypography.css';

const emptyUser = { name: '', email: '', role: 'user', isActive: true };
export default function UserManagementPage({ currentUser, showMsg }) {
  const can = permission => currentUser?.permissions?.includes(permission);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
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

  const visibleUsers = users;
  const roleName = slug => roles.find(role => role.slug === slug)?.name || slug;
  const openUser = user => { setUserForm(user ? { name: user.name, email: user.email, role: user.role, isActive: user.is_active } : { ...emptyUser, role: roles.find(r => r.slug === 'user')?.slug || roles[0]?.slug || '' }); setModal({ type: 'user', id: user?.id }); };

  const saveUser = async event => {
    event.preventDefault();
    try {
      if (modal.id) await axios.put(`/api/auth/users/${modal.id}`, userForm);
      else await axios.post('/api/auth/users', userForm);
      showMsg?.(modal.id ? 'Đã cập nhật tài khoản.' : 'Đã tạo tài khoản và gửi email kích hoạt.', 'success'); setModal(null); await load(page);
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu tài khoản.', 'error'); }
  };
  const resend = async user => { try { await axios.post(`/api/auth/users/${user.id}/resend-invite`); showMsg?.(`Đã gửi lại email kích hoạt cho ${user.email}.`, 'success'); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể gửi lại email.', 'error'); } };
  const removeUser = async user => { if (!window.confirm(`Xóa tài khoản ${user.email}?`)) return; try { await axios.delete(`/api/auth/users/${user.id}`); showMsg?.('Đã xóa tài khoản.', 'success'); await load(page); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xóa tài khoản.', 'error'); } };

  return <div className="user-admin-page">
    <header className="user-admin-header"><div><span className="user-admin-eyebrow">QUẢN TRỊ · ACCOUNT MANAGEMENT</span><h1>Quản lý tài khoản</h1><p>Quản lý vòng đời tài khoản, trạng thái kích hoạt và vai trò được gán.</p></div>{can('users.manage') && <button className="btn-primary" onClick={() => openUser()}><Plus />Mời tài khoản</button>}</header>
    <section className="user-admin-metrics"><article><span><Users /></span><div><small>Tổng tài khoản</small><strong>{meta.total}</strong></div></article><article><span><UserCheck /></span><div><small>Đã kích hoạt trang này</small><strong>{users.filter(u => !u.force_password_change && u.is_active).length}</strong></div></article><article><span><MailPlus /></span><div><small>Chờ thiết lập trang này</small><strong>{users.filter(u => u.force_password_change).length}</strong></div></article><article><span><ShieldCheck /></span><div><small>Vai trò</small><strong>{roles.length}</strong></div></article></section>
    <section className="user-admin-card">
      <div className="user-admin-toolbar"><div className="user-admin-tabs"><button className="active">Tài khoản</button></div><label className="user-search"><Search /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm tên, email hoặc vai trò…" /></label></div>
      {loading ? <div className="user-loading"><RefreshCw className="spin" /></div> : <div className="user-table-wrap"><table><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th /></tr></thead><tbody>{visibleUsers.map(user => <tr key={user.id}><td><div className="user-identity"><span>{(user.name || 'U').slice(0,2).toUpperCase()}</span><div><strong>{user.name}{user.id === currentUser?.id && <em>Bạn</em>}</strong><small>{user.email}</small></div></div></td><td><span className="role-pill"><KeyRound />{roleName(user.role)}</span></td><td><span className={`account-status ${user.force_password_change ? 'pending' : user.is_active ? 'active' : 'locked'}`}>{user.force_password_change ? 'Chờ thiết lập mật khẩu' : user.is_active ? 'Đang hoạt động' : 'Đã khóa'}</span></td><td><small>{user.last_login_at ? new Date(user.last_login_at).toLocaleString('vi-VN') : 'Chưa đăng nhập'}</small></td><td><div className="row-actions">{can('users.manage') && user.force_password_change && <button title="Gửi lại email kích hoạt" onClick={() => resend(user)}><MailPlus /></button>}{can('users.manage') && <button title="Chỉnh sửa" onClick={() => openUser(user)}><Edit2 /></button>}{can('users.manage') && <button className="danger" disabled={user.id === currentUser?.id} title="Xóa" onClick={() => removeUser(user)}><Trash2 /></button>}</div></td></tr>)}</tbody></table></div>}
      {meta.total > 0 && <footer className="list-pagination"><span>Hiển thị {users.length} / {meta.total} tài khoản</span><div><span>Trang {meta.page}/{meta.totalPages}</span><button disabled={meta.page <= 1} onClick={() => setPage(value => value - 1)}><ArrowLeft /></button><button disabled={meta.page >= meta.totalPages} onClick={() => setPage(value => value + 1)}><ArrowRight /></button></div></footer>}
    </section>

    {modal?.type === 'user' && <div className="user-modal-backdrop"><form className="user-modal" onSubmit={saveUser}><h2>{modal.id ? 'Cập nhật tài khoản' : 'Mời tài khoản mới'}</h2><p>{modal.id ? 'Cập nhật thông tin, vai trò và trạng thái truy cập.' : 'Người dùng sẽ nhận email để xác thực và thiết lập mật khẩu lần đầu.'}</p><label>Họ và tên<input value={userForm.name} onChange={e => setUserForm({...userForm,name:e.target.value})} required /></label><label>Email<input type="email" value={userForm.email} onChange={e => setUserForm({...userForm,email:e.target.value})} required /></label><label>Vai trò<select value={userForm.role} onChange={e => setUserForm({...userForm,role:e.target.value})}>{roles.map(role => <option key={role.slug} value={role.slug}>{role.name}</option>)}</select></label>{modal.id && <label className="switch-line"><input type="checkbox" checked={userForm.isActive} onChange={e => setUserForm({...userForm,isActive:e.target.checked})} /> Cho phép đăng nhập</label>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setModal(null)}>Hủy</button><button className="btn-primary">{modal.id ? 'Lưu thay đổi' : 'Tạo & gửi email'}</button></div></form></div>}
  </div>;
}
