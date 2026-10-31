import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Edit2, Eye, EyeOff, KeyRound, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Badge, Button, DataTable, DateTimeDisplay, FilterBar, ListPage, Pagination,
  StatusBadge, TableToolbar, UserCell,
} from '../../../design-system-v2';
import {useDialog} from '../../../components/feedback/dialogContext';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import './UserManagementPage.css';
import './UserManagementListPage.css';
import './UserManagementTypography.css';
import './UserMultiRole.css';
import './UserPassword.css';

const emptyUser = { name: '', email: '', password: '', roleSlugs: [], primaryRoleSlug: '', isActive: true };
export default function UserManagementPage({ currentUser, showMsg }) {
  const {confirm:confirmDialog}=useDialog();
  const can = useCallback(permission => currentUser?.permissions?.includes(permission), [currentUser?.permissions]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [modal, setModal] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [userForm, setUserForm] = useState(emptyUser);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requests = [axios.get('/api/auth/users', { params: { page, limit: pageSize, search: debouncedSearch.trim() || undefined } })];
      if (can('roles.view') || can('users.manage')) requests.push(axios.get('/api/auth/roles', { params: { page: 1, limit: 100 } }));
      const [userResponse, roleResponse] = await Promise.all(requests);
      setUsers(userResponse.data.users || []);
      setMeta(userResponse.data.meta || { page, limit: pageSize, total: 0, totalPages: 1 });
      if (roleResponse) setRoles(roleResponse.data.data || []);
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Không thể tải dữ liệu quản trị.';
      setError(message);
      showMsg?.(message, 'error');
    }
    finally { setLoading(false); }
  }, [can, debouncedSearch, page, pageSize, showMsg]);
  useEffect(() => { load(); }, [load]);
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
      showMsg?.(modal.id ? 'Đã cập nhật tài khoản.' : 'Đã tạo tài khoản.', 'success'); setModal(null); await load();
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu tài khoản.', 'error'); }
  };
  const resetPassword = async event => { event.preventDefault(); try { await axios.put(`/api/auth/users/${modal.id}/password`, { password: userForm.password }); showMsg?.('Đã đặt lại mật khẩu.', 'success'); setModal(null); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể đặt lại mật khẩu.', 'error'); } };
  const removeUser = async user => { if (!await confirmDialog({title:'Xóa tài khoản?',message:`Tài khoản ${user.email} sẽ bị xóa khỏi hệ thống.`,confirmText:'Xóa tài khoản'})) return; try { await axios.delete(`/api/auth/users/${user.id}`); showMsg?.('Đã xóa tài khoản.', 'success'); await load(); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xóa tài khoản.', 'error'); } };

  const createButton = can('users.manage') ? <Button size="sm" icon={<Plus />} onClick={() => openUser()}>Tạo tài khoản</Button> : null;
  const columns = useMemo(() => [
    { key: 'name', label: 'Người dùng', sortable: true, width: 340, sortValue: user => user.name, render: user => <div className="user-list__identity"><UserCell name={user.name || 'Người dùng'} description={user.email} status={user.is_active ? 'online' : undefined} />{user.id === currentUser?.id && <Badge tone="info">Bạn</Badge>}</div> },
    { key: 'roles', label: 'Vai trò', width: 360, render: user => <div className="user-list__roles">{(user.roles || []).slice(0, 2).map(role => <Badge key={role.slug}>{role.name}</Badge>)}{user.roles?.length > 2 && <Badge>+{user.roles.length - 2}</Badge>}{!user.roles?.length && <span>Chưa gán vai trò</span>}</div> },
    { key: 'is_active', label: 'Trạng thái', sortable: true, sortValue: user => user.is_active ? 1 : 0, width: 170, render: user => <StatusBadge status={user.is_active ? 'active' : 'disabled'} label={user.is_active ? 'Đang hoạt động' : 'Đã khóa'} /> },
    { key: 'last_login_at', label: 'Đăng nhập gần nhất', sortable: true, sortType: 'date', width: 210, render: user => user.last_login_at ? <DateTimeDisplay value={user.last_login_at} /> : <span className="user-list__muted">Chưa đăng nhập</span> },
  ], [currentUser?.id]);
  const rowActions = user => [
    { label: 'Đặt lại mật khẩu', icon: <KeyRound />, onClick: () => { setUserForm({...emptyUser,password:''}); setModal({type:'password',id:user.id,name:user.name}); } },
    { label: 'Chỉnh sửa', icon: <Edit2 />, onClick: () => openUser(user) },
    { label: 'Xóa tài khoản', icon: <Trash2 />, danger: true, disabled: user.id === currentUser?.id, description: user.id === currentUser?.id ? 'Không thể xóa tài khoản đang đăng nhập' : undefined, onClick: () => removeUser(user) },
  ];

  return <div className="iig3-list-screen user-management-page"><ListPage
    breadcrumb={[{ label: 'Quản trị' }, { label: 'Tài khoản' }]}
    title="Quản lý tài khoản"
    toolbar={<><TableToolbar title="Tất cả tài khoản" count={meta.total || 0} loading={loading} actions={createButton} /><FilterBar search={search} onSearch={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm tên, email hoặc vai trò…" loading={loading} /></>}
    table={<DataTable ariaLabel="Danh sách tài khoản" columns={columns} rows={visibleUsers} rowKey="id" loading={loading} error={error} errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={load}>Thử lại</Button>} emptyTitle="Chưa có tài khoản" emptyDescription={search ? 'Không có tài khoản phù hợp với từ khóa tìm kiếm.' : 'Tạo tài khoản đầu tiên để bắt đầu phân quyền.'} emptyAction={search ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>Xóa tìm kiếm</Button> : createButton} getRowActions={can('users.manage') ? rowActions : undefined} />}
    pagination={<Pagination page={meta.page || 1} pageCount={meta.totalPages || 1} pageSize={meta.limit || pageSize} total={meta.total || 0} loading={loading} onPage={setPage} onPageSize={value => { setPageSize(value); setPage(1); }} />}
  />

    {modal?.type === 'user' && <div className="user-modal-backdrop"><form className="user-modal" onSubmit={saveUser}><h2>{modal.id ? 'Cập nhật tài khoản' : 'Tạo tài khoản mới'}</h2><p>{modal.id ? 'Cập nhật thông tin, vai trò và trạng thái truy cập.' : 'Nhập mật khẩu ban đầu để tài khoản có thể đăng nhập ngay.'}</p><label>Họ và tên<input value={userForm.name} onChange={e => setUserForm({...userForm,name:e.target.value})} required /></label><label>Email<input type="email" value={userForm.email} onChange={e => setUserForm({...userForm,email:e.target.value})} required /></label>{!modal.id&&<label>Mật khẩu ban đầu<div className="admin-password-input"><input type={showPassword?'text':'password'} value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} minLength={8} autoComplete="new-password" required /><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}>{showPassword?<EyeOff/>:<Eye/>}</button></div><small>Tối thiểu 8 ký tự.</small></label>}<div className="multi-role-field"><strong>Vai trò</strong><small>Chọn một hoặc nhiều vai trò cho tài khoản.</small><div className="multi-role-options">{roles.map(role => <label key={role.slug} className={userForm.roleSlugs.includes(role.slug) ? 'selected' : ''}><input type="checkbox" checked={userForm.roleSlugs.includes(role.slug)} onChange={() => toggleRole(role.slug)} /><span><b>{role.name}</b><small>{role.description || role.slug}</small></span></label>)}</div></div>{userForm.roleSlugs.length > 1 && <label>Vai trò chính<select value={userForm.primaryRoleSlug} onChange={e => setUserForm({...userForm,primaryRoleSlug:e.target.value})}>{roles.filter(role => userForm.roleSlugs.includes(role.slug)).map(role => <option key={role.slug} value={role.slug}>{role.name}</option>)}</select></label>}<div className="effective-permissions"><ShieldCheck /><span><strong>{effectivePermissions.length} quyền hiệu lực</strong><small>Được hợp nhất từ {userForm.roleSlugs.length} vai trò đã chọn</small></span></div>{modal.id && <label className="switch-line"><input type="checkbox" checked={userForm.isActive} onChange={e => setUserForm({...userForm,isActive:e.target.checked})} /> Cho phép đăng nhập</label>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setModal(null)}>Hủy</button><button className="btn-primary">{modal.id ? 'Lưu thay đổi' : 'Tạo tài khoản'}</button></div></form></div>}
    {modal?.type==='password'&&<div className="user-modal-backdrop"><form className="user-modal" onSubmit={resetPassword}><h2>Đặt lại mật khẩu</h2><p>Tạo mật khẩu mới cho {modal.name}. Các phiên đăng nhập hiện tại sẽ bị thu hồi.</p><label>Mật khẩu mới<div className="admin-password-input"><input type={showPassword?'text':'password'} value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} minLength={8} autoComplete="new-password" required /><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}>{showPassword?<EyeOff/>:<Eye/>}</button></div><small>Tối thiểu 8 ký tự.</small></label><div className="modal-actions"><button type="button" className="btn-secondary" onClick={()=>setModal(null)}>Hủy</button><button className="btn-primary">Đặt lại mật khẩu</button></div></form></div>}
  </div>;
}
