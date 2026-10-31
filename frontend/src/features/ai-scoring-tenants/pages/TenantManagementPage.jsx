import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Boxes, Eye, Pencil, Plus, Power, RefreshCw } from 'lucide-react';
import {
  Alert, Badge, Button, Checkbox, CodeText, ColumnVisibilityMenu, DataTable, DateTimeDisplay,
  DetailsList, Drawer, FilterBar, FormField, Input, ListPage, Modal, MultiSelectFilter,
  Pagination, Select, StatusBadge, Surface, TableToolbar, Tabs, Textarea,
  Timeline,
} from '../../../design-system-v2';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import {
  changeTenantStatus, createTenant, getTenant, listTenantAudit, listTenants, updateTenant,
} from '../../../services/aiScoringTenantService';
import TenantCredentialsPanel from '../components/TenantCredentialsPanel';
import TenantWebhooksPanel from '../components/TenantWebhooksPanel';
import { TENANT_SCOPE_OPTIONS } from '../tenantScopes';
import './TenantManagementPage.css';

const EMPTY_FORM = { code: '', name: '', environment: 'PRODUCTION', contactName: '', contactEmail: '', rateLimit: 120, allowedScopes: [], metadataText: '{}' };
const STATUS = {
  ACTIVE: { label: 'Đang hoạt động', tone: 'active' },
  SUSPENDED: { label: 'Tạm khóa', tone: 'warning' },
  DISABLED: { label: 'Vô hiệu hóa', tone: 'disabled' },
};
const ENVIRONMENT = { PRODUCTION: 'Production', BETA: 'Beta', DEVELOPMENT: 'Development' };
const STATUS_OPTIONS = Object.entries(STATUS).map(([value, item]) => ({ value, label: item.label }));
const ENVIRONMENT_OPTIONS = Object.entries(ENVIRONMENT).map(([value, label]) => ({ value, label }));
const ALL_COLUMN_KEYS = ['stt', 'code', 'name', 'environment', 'status', 'rateLimit', 'activeCredentialCount', 'webhookCount', 'updatedAt'];
const ACTION_LABEL = { TENANT_CREATED: 'Đã tạo tenant', TENANT_UPDATED: 'Đã cập nhật tenant', TENANT_SUSPENDED: 'Đã tạm khóa tenant', TENANT_ACTIVATED: 'Đã kích hoạt tenant' };
const formatDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

function TenantForm({ value, onChange, editing = false, errors = {} }) {
  const set = (key, next) => onChange(current => ({ ...current, [key]: next }));
  const toggleScope = scope => set('allowedScopes', value.allowedScopes.includes(scope)
    ? value.allowedScopes.filter(item => item !== scope)
    : [...value.allowedScopes, scope]);
  return <div className="tenant-form-grid">
    <FormField label="Code tenant" required error={errors.code}><Input value={value.code} disabled={editing} placeholder="IIG_VIETNAM" onChange={event => set('code', event.target.value.toUpperCase())} /></FormField>
    <FormField label="Tên tenant" required error={errors.name}><Input value={value.name} placeholder="IIG Vietnam" onChange={event => set('name', event.target.value)} /></FormField>
    <FormField label="Môi trường"><Select value={value.environment} onChange={event => set('environment', event.target.value)}><option value="PRODUCTION">Production</option><option value="BETA">Beta</option><option value="DEVELOPMENT">Development</option></Select></FormField>
    <FormField label="Rate limit/phút" error={errors.rateLimit}><Input type="text" inputMode="numeric" value={value.rateLimit} onChange={event => set('rateLimit', event.target.value.replace(/\D/g, ''))} /></FormField>
    <FormField label="Người liên hệ"><Input value={value.contactName} placeholder="Nguyễn Văn A" onChange={event => set('contactName', event.target.value)} /></FormField>
    <FormField label="Email liên hệ" error={errors.contactEmail}><Input type="email" value={value.contactEmail} placeholder="admin@example.com" onChange={event => set('contactEmail', event.target.value)} /></FormField>
    <fieldset className="tenant-form-full tenant-scope-field">
      <legend>Scope được phép</legend>
      <div className="tenant-scope-options">{TENANT_SCOPE_OPTIONS.map(option => <Checkbox key={option.value} label={option.label} checked={value.allowedScopes.includes(option.value)} onChange={() => toggleScope(option.value)} />)}</div>
    </fieldset>
    <FormField className="tenant-form-full" label="Metadata JSON" error={errors.metadataText}><Textarea rows="3" spellCheck="false" value={value.metadataText} onChange={event => set('metadataText', event.target.value)} /></FormField>
  </div>;
}

function toForm(tenant) {
  return { code: tenant.code, name: tenant.name, environment: tenant.environment, contactName: tenant.contactName || '', contactEmail: tenant.contactEmail || '', rateLimit: tenant.rateLimit, allowedScopes: tenant.allowedScopes || [], metadataText: JSON.stringify(tenant.metadata || {}, null, 2) };
}

export default function TenantManagementPage({ currentUser, showMsg }) {
  const canManage = currentUser?.permissions?.includes('ai_scoring.tenants.manage');
  const canViewCredentials = currentUser?.permissions?.some(permission => ['ai_scoring.credentials.view', 'ai_scoring.credentials.manage'].includes(permission));
  const canManageCredentials = currentUser?.permissions?.includes('ai_scoring.credentials.manage');
  const canViewWebhooks = currentUser?.permissions?.some(permission => ['ai_scoring.webhooks.view', 'ai_scoring.webhooks.manage', 'ai_scoring.webhooks.replay'].includes(permission));
  const canManageWebhooks = currentUser?.permissions?.includes('ai_scoring.webhooks.manage');
  const canReplayWebhooks = currentUser?.permissions?.includes('ai_scoring.webhooks.replay');
  const canViewAudit = currentUser?.permissions?.includes('ai_scoring.audit.view');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [filters, setFilters] = useState({ status: '', environment: '', page: 1, pageSize: 25 });
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('general');
  const [audit, setAudit] = useState([]);
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState(null);
  const [reason, setReason] = useState('');
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(ALL_COLUMN_KEYS);

  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key === 'page' ? {} : { page: 1 }) }));
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setResult(await listTenants({ search: debouncedSearch || undefined, status: filters.status || undefined, environment: filters.environment || undefined, page: filters.page, pageSize: filters.pageSize })); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Không thể tải danh sách tenant.'); }
    finally { setLoading(false); }
  }, [debouncedSearch, filters]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async tenant => {
    setSelected(tenant); setDetailTab('general'); setDetailLoading(true); setAudit([]);
    try {
      const [detail, auditResult] = await Promise.all([getTenant(tenant.id), canViewAudit ? listTenantAudit(tenant.id) : Promise.resolve({ items: [] })]);
      setSelected(detail); setAudit(auditResult.items || []);
    } catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể tải chi tiết tenant.', 'error'); }
    finally { setDetailLoading(false); }
  };

  const validateForm = () => {
    const errors = {};
    if (!formMode?.editing && !/^[A-Z][A-Z0-9_]{2,39}$/.test(form.code)) errors.code = 'Code phải bắt đầu bằng chữ và chỉ gồm A-Z, 0-9 hoặc _.';
    if (!form.name.trim()) errors.name = 'Tên tenant là bắt buộc.';
    if (!form.rateLimit || Number(form.rateLimit) < 1 || Number(form.rateLimit) > 100000) errors.rateLimit = 'Rate limit phải từ 1 đến 100.000.';
    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) errors.contactEmail = 'Email không hợp lệ.';
    try { const metadata = JSON.parse(form.metadataText || '{}'); if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') throw new Error(); } catch { errors.metadataText = 'Metadata phải là JSON object hợp lệ.'; }
    setFormErrors(errors);
    return !Object.keys(errors).length;
  };

  const save = async () => {
    if (!validateForm() || saving) return;
    setSaving(true);
    try {
      const payload = { ...form, rateLimit: Number(form.rateLimit), metadata: JSON.parse(form.metadataText || '{}') };
      delete payload.metadataText;
      if (formMode.editing) delete payload.code;
      const tenant = formMode.editing ? await updateTenant(formMode.tenant.id, payload) : await createTenant(payload);
      showMsg?.(formMode.editing ? 'Đã cập nhật tenant.' : 'Đã tạo tenant.', 'success');
      setFormMode(null); setSelected(current => current?.id === tenant.id ? tenant : current); await load();
    } catch (requestError) {
      const field = requestError.response?.data?.details?.field;
      if (field) setFormErrors(current => ({ ...current, [field]: requestError.response.data.error }));
      else showMsg?.(requestError.response?.data?.error || 'Không thể lưu tenant.', 'error');
    } finally { setSaving(false); }
  };

  const submitStatus = async () => {
    if (!statusAction || !reason.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await changeTenantStatus(statusAction.tenant.id, statusAction.action, reason.trim());
      showMsg?.(statusAction.action === 'suspend' ? 'Đã tạm khóa tenant.' : 'Đã kích hoạt tenant.', 'success');
      setSelected(current => current?.id === updated.id ? updated : current); setStatusAction(null); setReason(''); await load();
    } catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể đổi trạng thái tenant.', 'error'); }
    finally { setSaving(false); }
  };

  const allColumns = useMemo(() => [
    { key: 'stt', label: 'STT', align: 'center', width: 64, render: (_row, index) => ((result.page || 1) - 1) * (result.pageSize || 25) + index + 1 },
    { key: 'code', label: 'Code', sortable: true, width: 160, render: row => <CodeText className="iig3-list-code">{row.code}</CodeText> },
    { key: 'name', label: 'Tên tenant', sortable: true, width: 260, render: row => <span className="tenant-identity"><strong>{row.name}</strong><small>{row.contactEmail || 'Chưa có email liên hệ'}</small></span> },
    { key: 'environment', label: 'Môi trường', sortable: true, width: 140, render: row => <Badge tone={row.environment === 'PRODUCTION' ? 'info' : 'neutral'}>{ENVIRONMENT[row.environment] || row.environment}</Badge> },
    { key: 'status', label: 'Trạng thái', sortable: true, width: 160, render: row => <StatusBadge status={STATUS[row.status]?.tone} label={STATUS[row.status]?.label || row.status} /> },
    { key: 'rateLimit', label: 'Rate limit/phút', sortable: true, sortType: 'number', align: 'right', width: 150, render: row => Number(row.rateLimit).toLocaleString('vi-VN') },
    { key: 'activeCredentialCount', label: 'Credential', align: 'center', width: 120 },
    { key: 'webhookCount', label: 'Webhook', align: 'center', width: 110 },
    { key: 'updatedAt', label: 'Ngày cập nhật', sortable: true, sortType: 'date', width: 170, render: row => <DateTimeDisplay value={row.updatedAt} /> },
  ], [result.page, result.pageSize]);
  const columns = allColumns.filter(column => visibleColumnKeys.includes(column.key));

  const rowActions = row => [
    { label: 'Xem chi tiết', icon: <Eye />, onClick: () => openDetail(row) },
    ...(canManage ? [{ label: 'Chỉnh sửa', icon: <Pencil />, onClick: () => { setForm(toForm(row)); setFormErrors({}); setFormMode({ editing: true, tenant: row }); } }, row.status === 'ACTIVE' ? { label: 'Tạm khóa', icon: <Ban />, danger: true, onClick: () => { setReason(''); setStatusAction({ action: 'suspend', tenant: row }); } } : { label: 'Kích hoạt', icon: <Power />, onClick: () => { setReason(''); setStatusAction({ action: 'activate', tenant: row }); } }] : []),
  ];
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const appliedCount = Number(Boolean(filters.status)) + Number(Boolean(filters.environment));
  const clearFilters = () => { setSearch(''); setFilters(current => ({ ...current, status: '', environment: '', page: 1 })); };
  const createButton = canManage ? <Button size="sm" icon={<Plus />} onClick={() => { setForm({ ...EMPTY_FORM }); setFormErrors({}); setFormMode({ editing: false }); }}>Thêm mới</Button> : null;

  return <div className="iig3-list-screen tenant-management-page"><ListPage
    breadcrumb={[{ label: 'AI Scoring' }, { label: 'Danh sách tenant' }]}
    title="Danh sách tenant"
    toolbar={<><TableToolbar title="Tất cả tenant" count={result.total} loading={loading} actions={createButton} view={<ColumnVisibilityMenu columns={allColumns} visibleKeys={visibleColumnKeys} requiredKeys={['name']} onChange={setVisibleColumnKeys} />} /><FilterBar search={search} onSearch={event => setSearch(event.target.value)} placeholder="Tìm theo code hoặc tên tenant…" loading={loading} filters={<><MultiSelectFilter label="Trạng thái" options={STATUS_OPTIONS} value={filters.status ? [filters.status] : []} onChange={value => setFilter('status', value.at(-1) || '')} placeholder="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái…" /><MultiSelectFilter label="Môi trường" options={ENVIRONMENT_OPTIONS} value={filters.environment ? [filters.environment] : []} onChange={value => setFilter('environment', value.at(-1) || '')} placeholder="Tất cả môi trường" searchPlaceholder="Tìm môi trường…" /></>} appliedCount={appliedCount} onClear={clearFilters} /> </>}
    table={<DataTable ariaLabel="Danh sách tenant AI Scoring" columns={columns} rows={result.items || []} rowKey="id" loading={loading} error={error} errorAction={<Button variant="outline" size="sm" icon={<RefreshCw />} onClick={load}>Thử lại</Button>} emptyIcon={<Boxes />} emptyTitle="Chưa có tenant" emptyDescription="Không có tenant phù hợp với bộ lọc hiện tại." emptyAction={appliedCount || search ? <Button variant="outline" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button> : createButton} onRowClick={openDetail} getRowActions={rowActions} />}
    pagination={<Pagination page={result.page} pageCount={pageCount} pageSize={result.pageSize} total={result.total} loading={loading} pageSizeOptions={[10, 25, 50, 100]} onPage={page => setFilter('page', page)} onPageSize={pageSize => setFilter('pageSize', pageSize)} />}
  />

  <Modal open={Boolean(formMode)} title={formMode?.editing ? 'Chỉnh sửa tenant' : 'Tạo tenant mới'} description={formMode?.editing ? `Cập nhật cấu hình cho ${formMode.tenant.code}.` : undefined} size="lg" onClose={() => !saving && setFormMode(null)} footer={<><Button variant="outline" disabled={saving} onClick={() => setFormMode(null)}>Hủy</Button><Button loading={saving} onClick={save}>{formMode?.editing ? 'Lưu thay đổi' : 'Tạo tenant'}</Button></>}><TenantForm value={form} onChange={setForm} editing={formMode?.editing} errors={formErrors} /></Modal>

  <Modal open={Boolean(statusAction)} title={statusAction?.action === 'suspend' ? 'Tạm khóa tenant?' : 'Kích hoạt tenant?'} description={statusAction?.action === 'suspend' ? 'Tenant sẽ không thể tạo scoring job mới; job đang chạy và lịch sử vẫn được giữ nguyên.' : 'Tenant có thể tiếp tục gọi API sau khi được kích hoạt.'} size="sm" onClose={() => !saving && setStatusAction(null)} footer={<><Button variant="outline" disabled={saving} onClick={() => setStatusAction(null)}>Hủy</Button><Button variant={statusAction?.action === 'suspend' ? 'danger' : 'primary'} loading={saving} disabled={!reason.trim()} onClick={submitStatus}>{statusAction?.action === 'suspend' ? 'Tạm khóa' : 'Kích hoạt'}</Button></>}><FormField label="Lý do" required description="Lý do được lưu vào audit log."><Textarea rows="4" value={reason} onChange={event => setReason(event.target.value)} placeholder="Nhập lý do thay đổi trạng thái…" /></FormField></Modal>

  <Drawer open={Boolean(selected)} title={selected?.name || 'Chi tiết tenant'} description={selected ? `${selected.code} · ${ENVIRONMENT[selected.environment] || selected.environment}` : ''} onClose={() => setSelected(null)} footer={canManage && selected ? <><Button variant="outline" icon={<Pencil />} onClick={() => { setForm(toForm(selected)); setFormErrors({}); setFormMode({ editing: true, tenant: selected }); }}>Chỉnh sửa</Button>{selected.status === 'ACTIVE' ? <Button variant="danger" icon={<Ban />} onClick={() => { setReason(''); setStatusAction({ action: 'suspend', tenant: selected }); }}>Tạm khóa</Button> : <Button icon={<Power />} onClick={() => { setReason(''); setStatusAction({ action: 'activate', tenant: selected }); }}>Kích hoạt</Button>}</> : null}>
    {selected && <div className="tenant-detail"><Tabs value={detailTab} onChange={setDetailTab} items={[{ value: 'general', label: 'Thông tin chung' }, ...(canViewCredentials ? [{ value: 'credentials', label: 'API Credential', count: selected.activeCredentialCount }] : []), ...(canViewWebhooks ? [{ value: 'webhooks', label: 'Webhook', count: selected.webhookCount }] : []), ...(canViewAudit ? [{ value: 'audit', label: 'Audit' }] : [])]} />
      {detailLoading ? <p className="tenant-detail-loading">Đang tải chi tiết…</p> : detailTab === 'general' ? <><Surface><DetailsList columns={2} items={[{ label: 'Code', value: selected.code, mono: true }, { label: 'Trạng thái', value: STATUS[selected.status]?.label || selected.status }, { label: 'Môi trường', value: ENVIRONMENT[selected.environment] }, { label: 'Rate limit/phút', value: Number(selected.rateLimit).toLocaleString('vi-VN') }, { label: 'Người liên hệ', value: selected.contactName }, { label: 'Email', value: selected.contactEmail }, { label: 'Ngày tạo', value: formatDate(selected.createdAt) }, { label: 'Cập nhật', value: formatDate(selected.updatedAt) }]} /></Surface><Surface><h3>Scope được phép</h3><div className="tenant-scope-list">{selected.allowedScopes?.length ? selected.allowedScopes.map(scope => <Badge key={scope}>{scope}</Badge>) : <span>Chưa cấu hình scope.</span>}</div></Surface></> : detailTab === 'credentials' ? <TenantCredentialsPanel tenant={selected} canManage={canManageCredentials} showMsg={showMsg} onChanged={async () => { const detail = await getTenant(selected.id); setSelected(detail); await load(); }} /> : detailTab === 'webhooks' ? <TenantWebhooksPanel tenant={selected} canManage={canManageWebhooks} canReplay={canReplayWebhooks} showMsg={showMsg} onChanged={async () => { const detail = await getTenant(selected.id); setSelected(detail); await load(); }} /> : <Surface><Timeline items={audit.map(event => ({ title: ACTION_LABEL[event.action] || event.action, description: event.reason || `Request ID: ${event.requestId}`, time: formatDate(event.createdAt), tone: event.outcome === 'SUCCEEDED' ? 'success' : 'danger', meta: event.requestId }))} />{!audit.length && <Alert tone="info" title="Chưa có audit event">Các thay đổi tenant sẽ được ghi nhận tại đây.</Alert>}</Surface>}
    </div>}
  </Drawer>
  </div>;
}
