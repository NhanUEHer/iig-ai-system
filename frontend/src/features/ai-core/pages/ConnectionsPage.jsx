import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Plus, RefreshCw, Save } from 'lucide-react';
import { Button, ConfirmDialog, ErrorState, Modal, PageFrame, Skeleton } from '../../../design-system-v2';
import {
  checkConnection, createConnection, errorMessage, getAgent, listAgents, listConnections, listModels, saveModels, updateConnection,
} from '../services/aiCoreApi';
import './AiCoreOperations.css';

const providerLabel = value => value === 'gemini' ? 'Gemini' : value === 'deepseek' ? 'DeepSeek' : value;
const dateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'chưa kiểm tra';
const compact = value => Number(value || 0) >= 1_000_000 ? `${Number(value) / 1_000_000}M` : Number(value || 0) >= 1_000 ? `${Number(value) / 1_000}K` : String(value || 0);
const EMPTY_CONNECTION = { provider: 'gemini', name: '', apiKey: '', baseUrl: '' };

function ConnectionForm({ value, onChange, keyOnly = false }) {
  const set = field => event => onChange(current => ({ ...current, [field]: event.target.value }));
  if (keyOnly) return <label className="aic-modal-field"><span>API key mới</span><input type="password" autoComplete="new-password" value={value.apiKey} onChange={set('apiKey')} placeholder="Nhập key mới (ít nhất 8 ký tự)" /><small>Key hiện tại không được gửi về trình duyệt và sẽ bị thay thế hoàn toàn.</small></label>;
  return <div className="aic-modal-form"><label className="aic-modal-field"><span>Provider</span><select value={value.provider} onChange={set('provider')}><option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option></select></label><label className="aic-modal-field"><span>Tên kết nối</span><input value={value.name} onChange={set('name')} placeholder="Ví dụ: Gemini · prod" /></label><label className="aic-modal-field"><span>API key</span><input type="password" autoComplete="new-password" value={value.apiKey} onChange={set('apiKey')} /></label><label className="aic-modal-field"><span>Base URL (tuỳ chọn)</span><input type="url" value={value.baseUrl} onChange={set('baseUrl')} placeholder="Để trống để dùng mặc định của provider" /></label></div>;
}

export default function ConnectionsPage({ canManage = false, showMsg }) {
  const [connections, setConnections] = useState([]); const [models, setModels] = useState([]); const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [checking, setChecking] = useState(''); const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); const [form, setForm] = useState(EMPTY_CONNECTION); const [toggleTarget, setToggleTarget] = useState(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [connectionItems, modelItems, agentItems] = await Promise.all([listConnections(), listModels(), listAgents()]);
      const details = await Promise.all(agentItems.map(item => getAgent(item.key).catch(() => null)));
      setConnections(connectionItems); setModels(modelItems); setAgents(details.filter(Boolean));
    } catch (requestError) { setError(errorMessage(requestError, 'Không thể tải kết nối và bảng giá.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usage = useMemo(() => agents.reduce((map, agent) => {
    for (const version of [agent.published, agent.draft].filter(Boolean)) {
      if (version.connectionId) { const entry = map.get(version.connectionId) || { primary: new Set(), fallback: new Set() }; entry.primary.add(agent.key); map.set(version.connectionId, entry); }
      if (version.fallbackConnectionId) { const entry = map.get(version.fallbackConnectionId) || { primary: new Set(), fallback: new Set() }; entry.fallback.add(agent.key); map.set(version.fallbackConnectionId, entry); }
    } return map;
  }, new Map()), [agents]);

  const submitDialog = async () => {
    setBusy(true); setError('');
    try {
      if (dialog?.type === 'add') { await createConnection({ ...form, baseUrl: form.baseUrl || null }); showMsg?.('Đã thêm kết nối.'); }
      else { await updateConnection(dialog.connection.id, { apiKey: form.apiKey }); showMsg?.(`Đã đổi key cho ${dialog.connection.name}.`); }
      setDialog(null); setForm(EMPTY_CONNECTION); await load();
    } catch (requestError) { setError(errorMessage(requestError, 'Không thể lưu kết nối.')); }
    finally { setBusy(false); }
  };
  const runCheck = async connection => {
    setChecking(connection.id); setError('');
    try { const result = await checkConnection(connection.id); showMsg?.(result.ok ? `Kết nối ${connection.name} hoạt động (${result.ms} ms).` : `Kết nối thất bại: ${result.error || 'không rõ lỗi'}`, result.ok ? 'success' : 'error'); await load(); }
    catch (requestError) { setError(errorMessage(requestError, 'Không thể kiểm tra kết nối.')); }
    finally { setChecking(''); }
  };
  const toggle = async () => {
    setBusy(true);
    try { const status = toggleTarget.status === 'active' ? 'disabled' : 'active'; await updateConnection(toggleTarget.id, { status }); showMsg?.(status === 'active' ? 'Đã bật kết nối.' : 'Đã tạm tắt kết nối.'); setToggleTarget(null); await load(); }
    catch (requestError) { setError(errorMessage(requestError, 'Không thể đổi trạng thái kết nối.')); }
    finally { setBusy(false); }
  };
  const editModel = (index, field, value) => setModels(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const savePrices = async () => {
    setBusy(true); setError('');
    try { const saved = await saveModels(models.map(item => ({ ...item, priceIn: Number(item.priceIn), priceCachedIn: Number(item.priceCachedIn), priceOut: Number(item.priceOut), contextWindow: Number(item.contextWindow) }))); setModels(saved); showMsg?.('Đã lưu bảng giá model.'); }
    catch (requestError) { setError(errorMessage(requestError, 'Không thể lưu bảng giá.')); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="aic-page"><div className="aic-loading"><Skeleton lines={12} /></div></div>;
  if (error && !connections.length && !models.length) return <div className="aic-page"><ErrorState title="Không thể mở kết nối" description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /></div>;

  return <div className="aic-page aic-connections-page"><PageFrame breadcrumb={[{ label: 'AI Core', to: '/ai-core' }, { label: 'Kết nối & bảng giá' }]} breadcrumbLinkComponent={Link}>
    <div className="aic-page-head"><h1>Kết nối &amp; bảng giá</h1>{canManage && <nav><Button icon={<Plus />} onClick={() => { setForm(EMPTY_CONNECTION); setDialog({ type: 'add' }); }}>Thêm kết nối</Button></nav>}</div>
    {error && <div className="aic-inline-error">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    <div className="aic-connection-grid">{connections.map(connection => { const connectedModels = models.filter(item => item.provider === connection.provider && item.status === 'active'); const counts = usage.get(connection.id); return <section key={connection.id} className={connection.status === 'disabled' ? 'is-disabled' : ''}>
      <header><span>{providerLabel(connection.provider).charAt(0)}</span><div><strong>{connection.name}</strong><code>{connection.provider}</code></div><em className={`aic-badge is-${connection.status === 'active' ? 'success' : 'warning'}`}>{connection.status === 'active' ? 'Hoạt động' : 'Tạm tắt'}</em></header>
      <dl><dt>API key</dt><dd><code>•••• •••• •••• {connection.apiKeyLast4}</code></dd><dt>Base URL</dt><dd><code>{connection.baseUrl || `mặc định của ${providerLabel(connection.provider)}`}</code></dd><dt>Model dùng được</dt><dd>{connectedModels.map(item => item.model).join(', ') || 'Chưa có model hoạt động'}</dd><dt>Agent đang dùng</dt><dd>{counts?.primary.size || 0} agent (chính) · {counts?.fallback.size || 0} (dự phòng)</dd><dt>Kiểm tra gần nhất</dt><dd className={connection.lastCheckOk === false ? 'is-error' : ''}>{dateTime(connection.lastCheckAt)}{connection.lastCheckAt && ` · ${connection.lastCheckMs ?? '—'} ms`}{connection.lastCheckError && ` · ${connection.lastCheckError}`}</dd></dl>
      {canManage && <nav><Button variant="outline" icon={<RefreshCw />} loading={checking === connection.id} onClick={() => runCheck(connection)}>Kiểm tra kết nối</Button><Button variant="outline" icon={<KeyRound />} onClick={() => { setForm({ apiKey: '' }); setDialog({ type: 'key', connection }); }}>Đổi key</Button><Button variant="outline" onClick={() => setToggleTarget(connection)}>{connection.status === 'active' ? 'Tạm tắt' : 'Bật lại'}</Button></nav>}
    </section>; })}</div>
    {!connections.length && <p className="aic-no-rows">Chưa có kết nối provider.</p>}
    <p className="aic-muted">Key được mã hoá khi lưu và không bao giờ gửi về trình duyệt; chỉ hiện 4 ký tự cuối.</p>
    <section className="aic-pricing-card"><header><h2>Bảng giá model (USD / 1M token)</h2><span>Đổi giá chỉ áp dụng cho lượt gọi sau; log cũ giữ giá lúc gọi.</span>{canManage && <Button variant="outline" icon={<Save />} loading={busy} onClick={savePrices}>Lưu bảng giá</Button>}</header><div className="aic-table-wrap"><table className="aic-table"><thead><tr><th>Provider</th><th>Model</th><th>Vào</th><th>Vào (cache)</th><th>Ra</th><th>Context tối đa</th><th>Trạng thái</th><th>Áp dụng từ</th></tr></thead><tbody>{models.map((item, index) => <tr key={`${item.provider}-${item.model}`}><td>{providerLabel(item.provider)}</td><td><code>{item.model}</code></td>{[['priceIn', 'Giá vào'], ['priceCachedIn', 'Giá vào có cache'], ['priceOut', 'Giá ra']].map(([field, label]) => <td key={field}><input className="aic-price-input" aria-label={`${label} ${item.model}`} type="number" min="0" step="0.001" value={item[field]} onChange={event => editModel(index, field, event.target.value)} disabled={!canManage} /></td>)}<td><input className="aic-price-input" aria-label={`Context tối đa ${item.model}`} type="number" min="0" step="1024" value={item.contextWindow} onChange={event => editModel(index, 'contextWindow', event.target.value)} disabled={!canManage} /></td><td><select className="aic-price-input" aria-label={`Trạng thái ${item.model}`} value={item.status} onChange={event => editModel(index, 'status', event.target.value)} disabled={!canManage}><option value="active">Đang dùng</option><option value="disabled">Tắt</option></select></td><td><code>{dateTime(item.effectiveFrom).split(' ')[0]}</code></td></tr>)}</tbody></table></div><p>Giá hiển thị theo dữ liệu hiện hành trong hệ thống — hãy đối chiếu bảng giá của provider trước khi lưu.</p></section>
    <Modal open={Boolean(dialog)} title={dialog?.type === 'add' ? 'Thêm kết nối' : `Đổi key · ${dialog?.connection?.name || ''}`} description={dialog?.type === 'add' ? 'API key sẽ được mã hoá ngay khi lưu.' : 'Hệ thống không hiển thị hoặc gửi lại key cũ.'} onClose={() => !busy && setDialog(null)} footer={<><Button variant="outline" disabled={busy} onClick={() => setDialog(null)}>Hủy</Button><Button loading={busy} disabled={!form.apiKey || (dialog?.type === 'add' && !form.name)} onClick={submitDialog}>Lưu kết nối</Button></>}><ConnectionForm value={form} onChange={setForm} keyOnly={dialog?.type === 'key'} /></Modal>
    <ConfirmDialog open={Boolean(toggleTarget)} title={toggleTarget?.status === 'active' ? 'Tạm tắt kết nối?' : 'Bật lại kết nối?'} description={toggleTarget?.status === 'active' ? 'Agent dùng kết nối này có thể không chạy được nếu không có dự phòng.' : 'Kết nối sẽ có thể được dùng lại cho các lượt gọi mới.'} confirmLabel={toggleTarget?.status === 'active' ? 'Tạm tắt' : 'Bật lại'} danger={toggleTarget?.status === 'active'} loading={busy} onConfirm={toggle} onClose={() => setToggleTarget(null)} />
  </PageFrame></div>;
}
