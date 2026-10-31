import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Edit2, Plus, RotateCcw, ShieldCheck, Trash2, Users } from 'lucide-react';
import {
  Badge, Button, CodeText, DataTable, FilterBar, ListPage, Pagination,
  TableToolbar,
} from '../../../design-system-v2';
import {useDialog} from '../../../components/feedback/dialogContext';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import './UserManagementPage.css';
import './UserManagementTypography.css';
import './RoleManagementListPage.css';

const emptyRole = { slug: '', name: '', description: '', permissions: [] };

export default function RoleManagementPage({ currentUser, showMsg }) {
  const {confirm:confirmDialog}=useDialog();
  const canManage = currentUser?.permissions?.includes('roles.manage');
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyRole);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/auth/roles', { params: { page, limit: pageSize, search: debouncedSearch.trim() || undefined } });
      setRoles(response.data.data || []); setCatalog(response.data.catalog || []); setMeta(response.data.meta || { page, limit: pageSize, total: 0, totalPages: 1 });
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Không thể tải danh sách vai trò.';
      setError(message);
      showMsg?.(message, 'error');
    }
    finally { setLoading(false); }
  }, [debouncedSearch, page, pageSize, showMsg]);
  useEffect(() => { load(); }, [load]);

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
      showMsg?.('Đã lưu vai trò và danh sách quyền.', 'success'); setModal(null); await load();
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu vai trò.', 'error'); }
  };
  const remove = async role => {
    if (!await confirmDialog({title:'Xóa vai trò?',message:`Vai trò ${role.name} sẽ bị xóa khỏi hệ thống.`,confirmText:'Xóa vai trò'})) return;
    try { await axios.delete(`/api/auth/roles/${role.slug}`); showMsg?.('Đã xóa vai trò.', 'success'); await load(); }
    catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xóa vai trò.', 'error'); }
  };

  const createButton = canManage ? <Button size="sm" icon={<Plus />} onClick={() => open()}>Tạo vai trò</Button> : null;
  const columns = useMemo(() => [
    { key: 'name', label: 'Vai trò', sortable: true, width: 260, sortValue: role => role.name, render: role => <div className="role-list__identity"><span><ShieldCheck /></span><div><strong>{role.name}</strong><CodeText>{role.slug}</CodeText></div></div> },
    { key: 'description', label: 'Mô tả', width: 360, render: role => <span className="role-list__description">{role.description || 'Chưa có mô tả.'}</span> },
    { key: 'user_count', label: 'Tài khoản', sortable: true, sortType: 'number', align: 'center', width: 130, render: role => <Badge icon={<Users />}>{role.user_count || 0}</Badge> },
    { key: 'permissions', label: 'Quyền được cấp', width: 420, render: role => <div className="role-list__permissions">{(role.permissions || []).slice(0, 3).map(permission => <CodeText key={permission}>{permission}</CodeText>)}{role.permissions?.length > 3 && <Badge>+{role.permissions.length - 3} quyền</Badge>}</div> },
    { key: 'is_system', label: 'Loại', sortable: true, align: 'center', width: 140, sortValue: role => role.is_system ? 1 : 0, render: role => <Badge tone={role.is_system ? 'info' : 'success'}>{role.is_system ? 'Hệ thống' : 'Tùy chỉnh'}</Badge> },
  ], []);
  const rowActions = role => [
    { label: 'Chỉnh sửa quyền', icon: <Edit2 />, onClick: () => open(role) },
    ...(!role.is_system ? [{ label: 'Xóa vai trò', icon: <Trash2 />, danger: true, onClick: () => remove(role) }] : []),
  ];

  return <div className="iig3-list-screen role-management-page"><ListPage
    breadcrumb={[{ label: 'Quản trị' }, { label: 'Vai trò & phân quyền' }]}
    title="Vai trò & phân quyền"
    toolbar={<><TableToolbar title="Tất cả vai trò" count={meta.total || 0} loading={loading} actions={createButton} /><FilterBar search={search} onSearch={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm tên, mã hoặc mô tả vai trò…" loading={loading} /></>}
    table={<DataTable ariaLabel="Danh sách vai trò" columns={columns} rows={roles} rowKey="slug" loading={loading} error={error} errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={load}>Thử lại</Button>} emptyTitle="Chưa có vai trò" emptyDescription={search ? 'Không có vai trò phù hợp với từ khóa tìm kiếm.' : 'Tạo vai trò đầu tiên để bắt đầu phân quyền.'} emptyAction={search ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>Xóa tìm kiếm</Button> : createButton} getRowActions={canManage ? rowActions : undefined} />}
    pagination={<Pagination page={meta.page || 1} pageCount={meta.totalPages || 1} pageSize={meta.limit || pageSize} total={meta.total || 0} loading={loading} onPage={setPage} onPageSize={value => { setPageSize(value); setPage(1); }} />}
  />
    {modal && <div className="user-modal-backdrop"><form className="user-modal role-modal" onSubmit={save}><h2>{modal.slug ? 'Cấu hình vai trò' : 'Tạo vai trò mới'}</h2><p>Chọn chính xác các tính năng và hành động mà vai trò được phép thực hiện.</p><div className="role-form-grid"><label>Tên vai trò<input value={form.name} onChange={event => setForm({...form,name:event.target.value})} required /></label><label>Mã vai trò<input value={form.slug} disabled={Boolean(modal.slug)} onChange={event => setForm({...form,slug:event.target.value.toLowerCase()})} required /></label></div><label>Mô tả<textarea value={form.description} onChange={event => setForm({...form,description:event.target.value})} /></label><div className="permission-groups">{catalog.map(group => <section key={group.key}><div><strong>{group.label}</strong><button type="button" onClick={() => setForm(current => ({...current,permissions:[...new Set([...current.permissions,...group.permissions.map(([key])=>key)])]}))}>Chọn tất cả</button></div>{group.permissions.map(([key,label]) => <label className="permission-item" key={key}><input type="checkbox" checked={form.permissions.includes(key)} onChange={() => togglePermission(key)} /><span><strong>{label}</strong><small>{key}</small></span></label>)}</section>)}</div><div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setModal(null)}>Hủy</button><button className="btn-primary">Lưu vai trò</button></div></form></div>}
  </div>;
}
