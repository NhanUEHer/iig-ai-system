import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ArrowRight, Edit2, KeyRound, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import './UserManagementPage.css';
import './UserManagementTypography.css';

const emptyRole = { slug: '', name: '', description: '', permissions: [] };

export default function RoleManagementPage({ currentUser, showMsg }) {
  const canManage = currentUser?.permissions?.includes('roles.manage');
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyRole);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await axios.get('/api/auth/roles', { params: { page: nextPage, limit: 10, search: search.trim() || undefined } });
      setRoles(response.data.data || []); setCatalog(response.data.catalog || []); setMeta(response.data.meta || { page: nextPage, limit: 10, total: 0, totalPages: 1 });
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể tải danh sách vai trò.', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(() => load(page), 250); return () => clearTimeout(timer); }, [page, search]);

  const open = role => {
    setForm(role ? { slug: role.slug, name: role.name, description: role.description || '', permissions: role.permissions || [] } : emptyRole);
    setModal({ slug: role?.slug });
  };
  const togglePermission = permission => setForm(current => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter(item => item !== permission) : [...current.permissions, permission] }));
  const save = async event => {
    event.preventDefault();
    try {
      if (modal.slug) await axios.put(`/api/auth/roles/${modal.slug}`, form);
      else await axios.post('/api/auth/roles', form);
      showMsg?.('Đã lưu vai trò và danh sách quyền.', 'success'); setModal(null); await load(page);
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu vai trò.', 'error'); }
  };
  const remove = async role => {
    if (!window.confirm(`Xóa vai trò ${role.name}?`)) return;
    try { await axios.delete(`/api/auth/roles/${role.slug}`); showMsg?.('Đã xóa vai trò.', 'success'); await load(page); }
    catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xóa vai trò.', 'error'); }
  };

  return <div className="user-admin-page role-admin-page">
    <header className="user-admin-header"><div><span className="user-admin-eyebrow">QUẢN TRỊ · ROLE-BASED ACCESS</span><h1>Vai trò & phân quyền</h1><p>Thiết lập quyền xem và quyền thao tác độc lập cho từng nhóm người dùng.</p></div>{canManage && <button className="btn-primary" onClick={() => open()}><Plus />Tạo vai trò</button>}</header>
    <section className="user-admin-metrics role-admin-metrics"><article><span><ShieldCheck /></span><div><small>Tổng vai trò</small><strong>{meta.total}</strong></div></article><article><span><Users /></span><div><small>Tài khoản trang này</small><strong>{roles.reduce((sum, role) => sum + Number(role.user_count || 0), 0)}</strong></div></article><article><span><KeyRound /></span><div><small>Quyền hệ thống</small><strong>{catalog.reduce((sum, group) => sum + group.permissions.length, 0)}</strong></div></article></section>
    <section className="user-admin-card"><div className="user-admin-toolbar"><strong>Danh sách vai trò</strong><label className="user-search"><Search /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm tên, mã hoặc mô tả vai trò…" /></label></div>{loading ? <div className="user-loading"><RefreshCw className="spin" /></div> : <div className="user-table-wrap"><table className="role-table"><thead><tr><th>Vai trò</th><th>Mô tả</th><th>Tài khoản</th><th>Quyền được cấp</th><th>Loại</th><th /></tr></thead><tbody>{roles.map(role => <tr key={role.slug}><td><div className="role-identity"><span><ShieldCheck /></span><div><strong>{role.name}</strong><small>{role.slug}</small></div></div></td><td><p>{role.description || 'Chưa có mô tả.'}</p></td><td><span className="role-user-count"><Users />{role.user_count || 0}</span></td><td><div className="role-permission-list">{role.permissions.slice(0, 3).map(permission => <span key={permission}>{permission}</span>)}{role.permissions.length > 3 && <em>+{role.permissions.length - 3} quyền</em>}</div></td><td><span className={`role-kind ${role.is_system ? 'system' : 'custom'}`}>{role.is_system ? 'Hệ thống' : 'Tùy chỉnh'}</span></td><td><div className="row-actions">{canManage && <button title="Chỉnh sửa quyền" onClick={() => open(role)}><Edit2 /></button>}{canManage && !role.is_system && <button className="danger" title="Xóa" onClick={() => remove(role)}><Trash2 /></button>}</div></td></tr>)}</tbody></table></div>}{meta.total > 0 && <footer className="list-pagination"><span>Hiển thị {roles.length} / {meta.total} vai trò</span><div><span>Trang {meta.page}/{meta.totalPages}</span><button disabled={meta.page <= 1} onClick={() => setPage(value => value - 1)}><ArrowLeft /></button><button disabled={meta.page >= meta.totalPages} onClick={() => setPage(value => value + 1)}><ArrowRight /></button></div></footer>}</section>
    {modal && <div className="user-modal-backdrop"><form className="user-modal role-modal" onSubmit={save}><h2>{modal.slug ? 'Cấu hình vai trò' : 'Tạo vai trò mới'}</h2><p>Chọn chính xác các tính năng và hành động mà vai trò được phép thực hiện.</p><div className="role-form-grid"><label>Tên vai trò<input value={form.name} onChange={event => setForm({...form,name:event.target.value})} required /></label><label>Mã vai trò<input value={form.slug} disabled={Boolean(modal.slug)} onChange={event => setForm({...form,slug:event.target.value.toLowerCase()})} required /></label></div><label>Mô tả<textarea value={form.description} onChange={event => setForm({...form,description:event.target.value})} /></label><div className="permission-groups">{catalog.map(group => <section key={group.key}><div><strong>{group.label}</strong><button type="button" onClick={() => setForm(current => ({...current,permissions:[...new Set([...current.permissions,...group.permissions.map(([key])=>key)])]}))}>Chọn tất cả</button></div>{group.permissions.map(([key,label]) => <label className="permission-item" key={key}><input type="checkbox" checked={form.permissions.includes(key)} onChange={() => togglePermission(key)} /><span><strong>{label}</strong><small>{key}</small></span></label>)}</section>)}</div><div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setModal(null)}>Hủy</button><button className="btn-primary">Lưu vai trò</button></div></form></div>}
  </div>;
}
