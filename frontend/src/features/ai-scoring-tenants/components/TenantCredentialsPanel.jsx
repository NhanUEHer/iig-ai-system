import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Pencil, Plus, RefreshCw, RotateCw, ShieldX } from 'lucide-react';
import {
  Alert, Badge, Button, Checkbox, DataTable, DateTimeDisplay, FormField, Input,
  Modal, Surface,
} from '../../../design-system-v2';
import {
  createTenantCredential, listTenantCredentials, revokeTenantCredential,
  rotateTenantCredential, updateTenantCredential,
} from '../../../services/aiScoringTenantService';
import { scopeLabel } from '../tenantScopes';

const EMPTY_FORM = { name: '', scopes: [], expiresAt: '' };
const STATUS = {
  ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
  ROTATING: { label: 'Đang chuyển đổi', tone: 'warning' },
  REVOKED: { label: 'Đã thu hồi', tone: 'neutral' },
};

function CredentialForm({ value, onChange, allowedScopes, errors }) {
  const set = (key, next) => onChange(current => ({ ...current, [key]: next }));
  const toggle = scope => set('scopes', value.scopes.includes(scope)
    ? value.scopes.filter(item => item !== scope) : [...value.scopes, scope]);
  return <div className="credential-form">
    <FormField label="Tên credential" required error={errors.name}><Input value={value.name} placeholder="Production API" onChange={event => set('name', event.target.value)} /></FormField>
    <FormField label="Ngày hết hạn" error={errors.expiresAt}><Input type="datetime-local" value={value.expiresAt} onChange={event => set('expiresAt', event.target.value)} /></FormField>
    <fieldset><legend>Scope credential</legend><div>{allowedScopes.map(scope => <Checkbox key={scope} label={scopeLabel(scope)} checked={value.scopes.includes(scope)} onChange={() => toggle(scope)} />)}</div>{errors.scopes && <small>{errors.scopes}</small>}</fieldset>
  </div>;
}

export default function TenantCredentialsPanel({ tenant, canManage, showMsg, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [overlapMinutes, setOverlapMinutes] = useState('15');
  const [secret, setSecret] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems((await listTenantCredentials(tenant.id)).items || []); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Không thể tải API credential.'); }
    finally { setLoading(false); }
  }, [tenant.id]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ ...EMPTY_FORM, scopes: [...(tenant.allowedScopes || [])] }); setFormErrors({}); setFormMode({ editing: false }); };
  const openEdit = credential => { setForm({ name: credential.name, scopes: credential.scopes || [], expiresAt: credential.expiresAt ? new Date(credential.expiresAt).toISOString().slice(0, 16) : '' }); setFormErrors({}); setFormMode({ editing: true, credential }); };
  const validate = () => {
    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Nhập tên credential.';
    if (!form.scopes.length) errors.scopes = 'Chọn ít nhất một scope.';
    if (form.expiresAt && new Date(form.expiresAt) <= new Date()) errors.expiresAt = 'Ngày hết hạn phải ở tương lai.';
    setFormErrors(errors); return !Object.keys(errors).length;
  };
  const save = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), scopes: form.scopes, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null };
      if (formMode.editing) {
        await updateTenantCredential(formMode.credential.id, payload);
        showMsg?.('Đã cập nhật credential.', 'success');
      } else {
        const created = await createTenantCredential(tenant.id, payload);
        setSecret({ title: 'API key đã được tạo', value: created.secret, prefix: created.tokenPrefix });
      }
      setFormMode(null); await load(); await onChanged?.();
    } catch (requestError) {
      const field = requestError.response?.data?.details?.field;
      if (field) setFormErrors(current => ({ ...current, [field]: requestError.response.data.error }));
      else showMsg?.(requestError.response?.data?.error || 'Không thể lưu credential.', 'error');
    } finally { setSaving(false); }
  };

  const submitAction = async () => {
    if (!action || reason.trim().length < 3 || saving) return;
    setSaving(true);
    try {
      if (action.type === 'rotate') {
        const rotated = await rotateTenantCredential(action.credential.id, { reason: reason.trim(), overlapMinutes: Number(overlapMinutes) });
        setSecret({ title: 'API key mới sau khi rotate', value: rotated.secret, prefix: rotated.tokenPrefix });
      } else {
        await revokeTenantCredential(action.credential.id, reason.trim());
        showMsg?.('Đã thu hồi credential.', 'success');
      }
      setAction(null); setReason(''); await load(); await onChanged?.();
    } catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể cập nhật credential.', 'error'); }
    finally { setSaving(false); }
  };

  const copySecret = async () => {
    await navigator.clipboard.writeText(secret.value);
    showMsg?.('Đã sao chép API key.', 'success');
  };

  const columns = useMemo(() => [
    { key: 'name', label: 'Tên', width: 180, render: row => <strong>{row.name}</strong> },
    { key: 'tokenPrefix', label: 'Prefix', width: 150, render: row => <code>{row.tokenPrefix}…</code> },
    { key: 'scopes', label: 'Scope', width: 230, render: row => <div className="credential-scopes">{row.scopes.map(scope => <Badge key={scope}>{scope}</Badge>)}</div> },
    { key: 'status', label: 'Trạng thái', width: 130, render: row => <Badge tone={STATUS[row.status]?.tone}>{STATUS[row.status]?.label || row.status}</Badge> },
    { key: 'expiresAt', label: 'Hết hạn', width: 150, render: row => row.expiresAt ? <DateTimeDisplay value={row.expiresAt} /> : 'Không giới hạn' },
    { key: 'lastUsedAt', label: 'Dùng gần nhất', width: 150, render: row => row.lastUsedAt ? <DateTimeDisplay value={row.lastUsedAt} /> : 'Chưa sử dụng' },
  ], []);
  const rowActions = credential => credential.status === 'REVOKED' || !canManage ? [] : [
    { label: 'Chỉnh sửa', icon: <Pencil />, onClick: () => openEdit(credential) },
    { label: 'Rotate key', icon: <RotateCw />, onClick: () => { setReason(''); setOverlapMinutes('15'); setAction({ type: 'rotate', credential }); } },
    { label: 'Thu hồi', icon: <ShieldX />, danger: true, onClick: () => { setReason(''); setAction({ type: 'revoke', credential }); } },
  ];

  return <div className="tenant-credentials-panel">
    <Surface><header><div><h3>API credentials</h3><span>{items.length} credential</span></div>{canManage && <Button size="sm" icon={<Plus />} disabled={tenant.status !== 'ACTIVE'} onClick={openCreate}>Tạo key</Button>}</header>
      {tenant.status !== 'ACTIVE' && <Alert tone="warning" title="Tenant đang bị khóa">Kích hoạt tenant trước khi tạo hoặc rotate API key.</Alert>}
      <DataTable ariaLabel="Danh sách API credential" columns={columns} rows={items} rowKey="id" loading={loading} error={error} errorAction={<Button size="sm" variant="outline" icon={<RefreshCw />} onClick={load}>Thử lại</Button>} emptyIcon={<KeyRound />} emptyTitle="Chưa có API credential" emptyDescription="Tạo key đầu tiên để hệ thống tích hợp gọi API AI Scoring." getRowActions={rowActions} />
    </Surface>

    <Modal open={Boolean(formMode)} title={formMode?.editing ? 'Chỉnh sửa credential' : 'Tạo API credential'} size="md" onClose={() => !saving && setFormMode(null)} footer={<><Button variant="outline" onClick={() => setFormMode(null)}>Hủy</Button><Button loading={saving} onClick={save}>{formMode?.editing ? 'Lưu thay đổi' : 'Tạo key'}</Button></>}><CredentialForm value={form} onChange={setForm} allowedScopes={tenant.allowedScopes || []} errors={formErrors} /></Modal>

    <Modal open={Boolean(action)} title={action?.type === 'rotate' ? 'Rotate API key?' : 'Thu hồi API key?'} size="sm" onClose={() => !saving && setAction(null)} footer={<><Button variant="outline" onClick={() => setAction(null)}>Hủy</Button><Button variant={action?.type === 'revoke' ? 'danger' : 'primary'} loading={saving} disabled={reason.trim().length < 3} onClick={submitAction}>{action?.type === 'rotate' ? 'Rotate key' : 'Thu hồi'}</Button></>}><div className="credential-action-form">{action?.type === 'rotate' && <FormField label="Thời gian chuyển đổi (phút)"><Input type="text" inputMode="numeric" value={overlapMinutes} onChange={event => setOverlapMinutes(event.target.value.replace(/\D/g, ''))} /></FormField>}<FormField label="Lý do" required><Input value={reason} onChange={event => setReason(event.target.value)} /></FormField></div></Modal>

    <Modal open={Boolean(secret)} title={secret?.title || 'API key'} size="md" onClose={() => setSecret(null)} footer={<Button onClick={() => setSecret(null)}>Tôi đã lưu key</Button>}><Alert tone="warning" title="Chỉ hiển thị một lần">Sao chép key ngay bây giờ. Sau khi đóng, hệ thống không thể hiển thị lại secret này.</Alert><div className="credential-secret"><code>{secret?.value}</code><Button variant="outline" icon={<Copy />} onClick={copySecret}>Sao chép</Button></div></Modal>
  </div>;
}
