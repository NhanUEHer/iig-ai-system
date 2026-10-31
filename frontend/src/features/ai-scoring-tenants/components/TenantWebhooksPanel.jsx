import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Eye, Pencil, Plus, RefreshCw, RotateCw, Send, Webhook } from 'lucide-react';
import {
  Alert, Badge, Button, Checkbox, DataTable, DateTimeDisplay, DetailsList,
  FormField, Input, Modal, Select, Surface,
} from '../../../design-system-v2';
import {
  createTenantWebhook, getWebhookDelivery, listTenantWebhooks, listWebhookDeliveries,
  replayWebhookDelivery, rotateTenantWebhookSecret, testTenantWebhook, updateTenantWebhook,
} from '../../../services/aiScoringTenantService';

const EVENTS = [
  { value: 'scoring.completed', label: 'Chấm điểm hoàn tất' },
  { value: 'scoring.failed', label: 'Chấm điểm thất bại' },
];
const EMPTY_FORM = { name: '', url: '', eventTypes: EVENTS.map(item => item.value), status: 'ACTIVE' };
const DELIVERY_STATUS = {
  PENDING: ['Đang chờ', 'neutral'], PROCESSING: ['Đang gửi', 'info'], RETRY: ['Chờ gửi lại', 'warning'],
  DELIVERED: ['Thành công', 'success'], DEAD_LETTER: ['Thất bại', 'danger'],
};

function WebhookForm({ value, onChange, errors }) {
  const set = (key, next) => onChange(current => ({ ...current, [key]: next }));
  const toggle = event => set('eventTypes', value.eventTypes.includes(event)
    ? value.eventTypes.filter(item => item !== event) : [...value.eventTypes, event]);
  return <div className="webhook-form">
    <FormField label="Tên webhook" required error={errors.name}><Input value={value.name} placeholder="Hệ thống thi Production" onChange={event => set('name', event.target.value)} /></FormField>
    <FormField label="Endpoint HTTPS" required error={errors.url}><Input value={value.url} placeholder="https://example.com/webhooks/ai-scoring" onChange={event => set('url', event.target.value)} /></FormField>
    <FormField label="Trạng thái"><Select value={value.status} onChange={event => set('status', event.target.value)}><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Tạm tắt</option></Select></FormField>
    <fieldset><legend>Sự kiện nhận</legend><div>{EVENTS.map(item => <Checkbox key={item.value} label={item.label} checked={value.eventTypes.includes(item.value)} onChange={() => toggle(item.value)} />)}</div>{errors.eventTypes && <small>{errors.eventTypes}</small>}</fieldset>
  </div>;
}

export default function TenantWebhooksPanel({ tenant, canManage, canReplay, showMsg, onChanged }) {
  const [endpoints, setEndpoints] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [secret, setSecret] = useState(null);
  const [detail, setDetail] = useState(null);
  const [replay, setReplay] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [endpointResult, deliveryResult] = await Promise.all([
        listTenantWebhooks(tenant.id), listWebhookDeliveries({ tenantId: tenant.id, pageSize: 10 }),
      ]);
      setEndpoints(endpointResult.items || []); setDeliveries(deliveryResult.items || []);
    } catch (requestError) { setError(requestError.response?.data?.error || 'Không thể tải webhook.'); }
    finally { setLoading(false); }
  }, [tenant.id]);
  useEffect(() => { load(); }, [load]);

  const validate = () => {
    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Nhập tên webhook.';
    if (!form.url.trim().startsWith('https://')) errors.url = 'Endpoint phải bắt đầu bằng https://';
    if (!form.eventTypes.length) errors.eventTypes = 'Chọn ít nhất một sự kiện.';
    setFormErrors(errors); return !Object.keys(errors).length;
  };
  const save = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), url: form.url.trim() };
      if (formMode.editing) {
        await updateTenantWebhook(formMode.endpoint.id, payload); showMsg?.('Đã cập nhật webhook.', 'success');
      } else {
        const created = await createTenantWebhook(tenant.id, payload);
        setSecret({ title: 'Signing secret đã được tạo', value: created.secret, prefix: created.secretPrefix });
      }
      setFormMode(null); await load(); await onChanged?.();
    } catch (requestError) {
      const field = requestError.response?.data?.details?.field;
      if (field) setFormErrors(current => ({ ...current, [field]: requestError.response.data.error }));
      else showMsg?.(requestError.response?.data?.error || 'Không thể lưu webhook.', 'error');
    } finally { setSaving(false); }
  };

  const rotate = async endpoint => {
    if (saving) return; setSaving(true);
    try { const result = await rotateTenantWebhookSecret(endpoint.id); setSecret({ title: 'Signing secret mới', value: result.secret, prefix: result.secretPrefix }); await load(); }
    catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể rotate secret.', 'error'); }
    finally { setSaving(false); }
  };
  const test = async endpoint => {
    try { await testTenantWebhook(endpoint.id); showMsg?.('Đã xếp test webhook vào hàng đợi.', 'success'); setTimeout(load, 1200); }
    catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể gửi test webhook.', 'error'); }
  };
  const openDetail = async delivery => {
    try { setDetail(await getWebhookDelivery(delivery.id, tenant.id)); }
    catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể tải delivery.', 'error'); }
  };
  const submitReplay = async () => {
    if (reason.trim().length < 3 || saving) return; setSaving(true);
    try { await replayWebhookDelivery(replay.id, tenant.id, reason.trim()); setReplay(null); setReason(''); showMsg?.('Đã xếp delivery replay vào hàng đợi.', 'success'); await load(); }
    catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể replay delivery.', 'error'); }
    finally { setSaving(false); }
  };

  const endpointColumns = useMemo(() => [
    { key: 'name', label: 'Tên', width: 170, render: row => <strong>{row.name}</strong> },
    { key: 'url', label: 'Endpoint', width: 260, render: row => <span className="webhook-url" title={row.url}>{row.url}</span> },
    { key: 'eventTypes', label: 'Sự kiện', width: 190, render: row => <div className="credential-scopes">{row.eventTypes.map(event => <Badge key={event}>{event}</Badge>)}</div> },
    { key: 'status', label: 'Trạng thái', width: 120, render: row => <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>{row.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm tắt'}</Badge> },
    { key: 'successRate', label: 'Thành công', width: 100, render: row => row.successRate === null ? '—' : `${row.successRate}%` },
  ], []);
  const endpointActions = endpoint => !canManage ? [] : [
    { label: 'Chỉnh sửa', icon: <Pencil />, onClick: () => { setForm({ name: endpoint.name, url: endpoint.url, eventTypes: endpoint.eventTypes, status: endpoint.status }); setFormErrors({}); setFormMode({ editing: true, endpoint }); } },
    { label: 'Gửi thử', icon: <Send />, onClick: () => test(endpoint) },
    { label: 'Rotate secret', icon: <RotateCw />, onClick: () => rotate(endpoint) },
  ];
  const deliveryColumns = useMemo(() => [
    { key: 'eventType', label: 'Sự kiện', width: 180, render: row => <strong>{row.eventType}</strong> },
    { key: 'endpointName', label: 'Webhook', width: 150 },
    { key: 'status', label: 'Trạng thái', width: 120, render: row => <Badge tone={DELIVERY_STATUS[row.status]?.[1]}>{DELIVERY_STATUS[row.status]?.[0] || row.status}</Badge> },
    { key: 'lastHttpStatus', label: 'HTTP', width: 70, render: row => row.lastHttpStatus || '—' },
    { key: 'attemptCount', label: 'Lần gửi', width: 80 },
    { key: 'createdAt', label: 'Tạo lúc', width: 150, render: row => <DateTimeDisplay value={row.createdAt} /> },
  ], []);
  const deliveryActions = delivery => [
    { label: 'Xem chi tiết', icon: <Eye />, onClick: () => openDetail(delivery) },
    ...(canReplay && ['DEAD_LETTER', 'DELIVERED'].includes(delivery.status) ? [{ label: 'Replay', icon: <RefreshCw />, onClick: () => { setReason(''); setReplay(delivery); } }] : []),
  ];

  return <div className="tenant-webhooks-panel">
    <Surface><header><div><h3>Webhook endpoints</h3><span>{endpoints.length} endpoint</span></div>{canManage && <Button size="sm" icon={<Plus />} disabled={tenant.status !== 'ACTIVE'} onClick={() => { setForm({ ...EMPTY_FORM, eventTypes: [...EMPTY_FORM.eventTypes] }); setFormErrors({}); setFormMode({ editing: false }); }}>Thêm webhook</Button>}</header>
      {error && <Alert tone="danger" title="Không thể tải dữ liệu">{error}</Alert>}
      <DataTable ariaLabel="Danh sách webhook" columns={endpointColumns} rows={endpoints} rowKey="id" loading={loading} emptyIcon={<Webhook />} emptyTitle="Chưa có webhook" emptyDescription="Tạo endpoint để nhận kết quả chấm điểm." getRowActions={endpointActions} />
    </Surface>
    <Surface><header><div><h3>Delivery gần đây</h3><span>{deliveries.length} delivery</span></div><Button size="sm" variant="outline" icon={<RefreshCw />} onClick={load}>Làm mới</Button></header>
      <DataTable ariaLabel="Delivery webhook gần đây" columns={deliveryColumns} rows={deliveries} rowKey="id" loading={loading} emptyIcon={<Send />} emptyTitle="Chưa có delivery" emptyDescription="Delivery sẽ xuất hiện sau khi gửi test hoặc có kết quả chấm." getRowActions={deliveryActions} />
    </Surface>

    <Modal open={Boolean(formMode)} title={formMode?.editing ? 'Chỉnh sửa webhook' : 'Tạo webhook'} size="md" onClose={() => !saving && setFormMode(null)} footer={<><Button variant="outline" onClick={() => setFormMode(null)}>Hủy</Button><Button loading={saving} onClick={save}>{formMode?.editing ? 'Lưu thay đổi' : 'Tạo webhook'}</Button></>}><WebhookForm value={form} onChange={setForm} errors={formErrors} /></Modal>
    <Modal open={Boolean(secret)} title={secret?.title || 'Signing secret'} size="md" onClose={() => setSecret(null)} footer={<Button onClick={() => setSecret(null)}>Tôi đã lưu secret</Button>}><Alert tone="warning" title="Chỉ hiển thị một lần">Sao chép secret để hệ thống nhận xác minh chữ ký HMAC.</Alert><div className="credential-secret"><code>{secret?.value}</code><Button variant="outline" icon={<Copy />} onClick={async () => { await navigator.clipboard.writeText(secret.value); showMsg?.('Đã sao chép signing secret.', 'success'); }}>Sao chép</Button></div></Modal>
    <Modal open={Boolean(detail)} title="Chi tiết webhook delivery" size="lg" onClose={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>Đóng</Button>}>
      {detail && <div className="webhook-delivery-detail"><DetailsList columns={2} items={[{ label: 'Event ID', value: detail.eventId, mono: true }, { label: 'Sự kiện', value: detail.eventType }, { label: 'Trạng thái', value: DELIVERY_STATUS[detail.status]?.[0] || detail.status }, { label: 'HTTP status', value: detail.lastHttpStatus || '—' }, { label: 'Số lần gửi', value: detail.attemptCount }, { label: 'Lỗi cuối', value: detail.lastError || '—' }]} /><h4>Payload</h4><pre>{JSON.stringify(detail.payload, null, 2)}</pre><h4>Lịch sử gửi</h4>{detail.attempts?.map(attempt => <div className="webhook-attempt" key={attempt.id}><strong>Lần {attempt.attemptNumber} · HTTP {attempt.responseStatus || '—'}</strong><span>{attempt.latencyMs ? `${attempt.latencyMs} ms` : attempt.errorMessage || '—'}</span></div>)}</div>}
    </Modal>
    <Modal open={Boolean(replay)} title="Replay webhook delivery?" size="sm" onClose={() => !saving && setReplay(null)} footer={<><Button variant="outline" onClick={() => setReplay(null)}>Hủy</Button><Button loading={saving} disabled={reason.trim().length < 3} onClick={submitReplay}>Replay</Button></>}><FormField label="Lý do" required><Input value={reason} onChange={event => setReason(event.target.value)} placeholder="Nhập lý do gửi lại…" /></FormField></Modal>
  </div>;
}
