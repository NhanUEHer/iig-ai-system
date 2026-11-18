import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Eye, FileClock } from 'lucide-react';
import { Button, ErrorState, Modal, PageFrame, Skeleton } from '../../../design-system-v2';
import { errorMessage, exportLogs, getLog, getUsage, listAgents, listLogs } from '../services/aiCoreApi';
import './AiCoreOperations.css';

const date = value => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(value));
const time = value => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
const number = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const usd = value => `$${Number(value || 0).toFixed(4)}`;
const latency = value => value == null ? '—' : value < 1000 ? `${number(value)} ms` : `${(value / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} s`;
const statusMeta = item => {
  if (item.finishReason === 'length' || item.errorCode === 'OUTPUT_TRUNCATED') return ['Bị cắt', 'warning'];
  if (item.status === 'blocked') return [`Chặn${item.errorCode ? `: ${item.errorCode === 'COST_CEILING' ? 'trần' : item.errorCode}` : ''}`, 'danger'];
  if (item.status === 'failed') return ['Thất bại', 'danger'];
  if (item.usedFallback) return ['Dự phòng', 'warning'];
  return ['Thành công', 'success'];
};
const sourceLabel = item => item.refType === 'cs_item' ? `Học liệu · ${item.refId}` : item.refType ? `${item.refType} · ${item.refId || '—'}` : '—';

function filtersFromParams(params) {
  const days = params.get('days') === '30' ? '30' : '7';
  const now = new Date(); const from = new Date(now); from.setDate(from.getDate() - Number(days) + 1); from.setHours(0, 0, 0, 0);
  return {
    days, agentKey: params.get('agentKey') || '', status: params.get('status') || '', refType: params.get('refType') || '',
    from: from.toISOString(), to: now.toISOString(), pageSize: 50,
  };
}

function DetailPanel({ item, canManage, onPreview }) {
  if (!item) return <aside className="aic-log-detail is-empty"><FileClock /><strong>Chi tiết lượt gọi</strong><p>Chọn một dòng trong bảng để xem token, giá, lần thử và lỗi.</p></aside>;
  const [label, tone] = statusMeta(item); const prices = item.priceSnapshot || {};
  return <aside className="aic-log-detail"><header><h2>Chi tiết lượt gọi</h2><span className={`aic-badge is-${tone}`}>{label}</span></header><dl>
    <dt>Agent</dt><dd><code>{item.agentKey} · v{item.version}</code></dd>
    <dt>Provider</dt><dd>{item.provider || '—'} · <code>{item.model || '—'}</code></dd>
    <dt>Token vào</dt><dd><code>{number(Number(item.inputTokens) + Number(item.cachedInputTokens))} (cache {number(item.cachedInputTokens)} · mới {number(item.inputTokens)})</code></dd>
    <dt>Token ra</dt><dd><code>{number(item.outputTokens)} · suy nghĩ {number(item.thinkingTokens)} · finish: {item.finishReason || '—'}</code></dd>
    <dt>Giá lúc gọi</dt><dd><code>in ${prices.in ?? 0} · cache ${prices.cachedIn ?? 0} · out ${prices.out ?? 0} / 1M</code></dd>
    <dt>Chi phí</dt><dd><code>{usd(item.costUsd)} · ước tính tối đa {usd(item.estimatedMaxCostUsd)}</code></dd>
    <dt>Lần thử</dt><dd>{number(item.attempts)}{item.repaired ? ' · đã sửa JSON' : ''}</dd>
    <dt>Nguồn</dt><dd>{item.refType === 'cs_item' ? <Link to={`/content-studio/items/${encodeURIComponent(item.refId)}`}>{sourceLabel(item)}</Link> : sourceLabel(item)}</dd>
    {item.errorCode && <><dt>Lỗi</dt><dd><code>{item.errorCode}</code>{item.errorMessage ? ` · ${item.errorMessage}` : ''}</dd></>}
  </dl>
  {(item.finishReason === 'length' || item.errorCode === 'OUTPUT_TRUNCATED') && <div className="aic-log-hint">Đầu ra chạm max token nên JSON có thể bị cụt. Gợi ý: tăng max token đầu ra hoặc giảm dữ liệu mỗi lượt.</div>}
  {canManage && (item.requestPreview || item.responsePreview) && <nav>{item.requestPreview && <Button variant="outline" icon={<Eye />} onClick={() => onPreview('Prompt đã gửi', item.requestPreview)}>Xem prompt đã gửi</Button>}{item.responsePreview && <Button variant="outline" icon={<Eye />} onClick={() => onPreview('Đầu ra thô', item.responsePreview)}>Xem đầu ra thô</Button>}</nav>}
  </aside>;
}

export default function LogsPage({ canManage = false, showMsg }) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const [agents, setAgents] = useState([]); const [usage, setUsage] = useState(null);
  const [items, setItems] = useState([]); const [cursor, setCursor] = useState(null);
  const [selected, setSelected] = useState(null); const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError(''); setSelected(null);
    try {
      const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
      const [agentItems, result, summary] = await Promise.all([listAgents(), listLogs(query), getUsage({ days: Number(filters.days), ...(filters.agentKey ? { agentKey: filters.agentKey } : {}) })]);
      setAgents(agentItems); setItems(result.items || []); setCursor(result.nextCursor); setUsage(summary);
    } catch (requestError) { setError(errorMessage(requestError, 'Không thể tải nhật ký gọi.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); };
  const choose = async item => {
    setSelected(item);
    try { setSelected(await getLog(item.id)); } catch (requestError) { setError(errorMessage(requestError, 'Không thể tải chi tiết lượt gọi.')); }
  };
  const more = async () => {
    setLoadingMore(true);
    try { const result = await listLogs({ ...filters, cursor }); setItems(current => [...current, ...(result.items || [])]); setCursor(result.nextCursor); }
    catch (requestError) { setError(errorMessage(requestError, 'Không thể tải thêm nhật ký.')); }
    finally { setLoadingMore(false); }
  };
  const download = async () => {
    try {
      const response = await exportLogs(filters); const url = URL.createObjectURL(response.data); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'ai-core-logs.csv'; anchor.click(); URL.revokeObjectURL(url);
      showMsg?.('Đã xuất nhật ký CSV.');
    } catch (requestError) { setError(errorMessage(requestError, 'Không thể xuất CSV.')); }
  };
  const days = usage?.days || []; const maxCost = Math.max(...days.map(item => Number(item.cost || 0)), 0.000001);
  const totalCost = days.reduce((sum, item) => sum + Number(item.cost || 0), 0); const totalCalls = days.reduce((sum, item) => sum + Number(item.calls || 0), 0);

  return <div className="aic-page aic-logs-page"><PageFrame breadcrumb={[{ label: 'AI Core', to: '/ai-core' }, { label: 'Nhật ký gọi' }]} breadcrumbLinkComponent={Link}>
    <div className="aic-page-head"><h1>Nhật ký gọi &amp; chi phí</h1><nav><Button variant="outline" icon={<Download />} onClick={download}>Xuất CSV</Button></nav></div>
    <div className="aic-filters aic-log-filters">
      <label><span className="aic-sr-only">Khoảng ngày</span><select value={filters.days} onChange={event => update('days', event.target.value)}><option value="7">7 ngày qua</option><option value="30">30 ngày qua</option></select></label>
      <label><span className="aic-sr-only">Agent</span><select value={filters.agentKey} onChange={event => update('agentKey', event.target.value)}><option value="">Agent: Tất cả</option>{agents.map(agent => <option key={agent.key} value={agent.key}>{agent.name}</option>)}</select></label>
      <label><span className="aic-sr-only">Trạng thái</span><select value={filters.status} onChange={event => update('status', event.target.value)}><option value="">Trạng thái: Tất cả</option><option value="success">Thành công</option><option value="failed">Thất bại</option><option value="blocked">Bị chặn</option></select></label>
      <label><span className="aic-sr-only">Nguồn</span><select value={filters.refType} onChange={event => update('refType', event.target.value)}><option value="">Nguồn: Tất cả</option><option value="cs_item">Học liệu Content Studio</option></select></label>
    </div>
    {error && <div className="aic-inline-error">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    {loading ? <div className="aic-loading"><Skeleton lines={10} /></div> : error && !usage ? <ErrorState title="Không thể tải nhật ký" description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /> : <>
      <section className="aic-cost-chart"><div><span>Chi phí {filters.days} ngày</span><strong>{usd(totalCost)}</strong><small>TB {usd(totalCalls ? totalCost / totalCalls : 0)} / lượt · {number(totalCalls)} lượt</small></div><div className="aic-bars">{days.map(item => <div key={item.day}><code>{usd(item.cost)}</code><i style={{ height: `${Math.max(2, Number(item.cost || 0) / maxCost * 80)}px` }} /><span>{date(item.day)}</span></div>)}</div></section>
      <div className="aic-logs-layout"><section><div className="aic-table-wrap"><table className="aic-table aic-logs-table"><thead><tr><th>Thời gian</th><th>Agent · phiên bản</th><th>Model</th><th>Token vào / ra</th><th>Chi phí</th><th>Thời gian xử lý</th><th>Kết quả</th><th>Nguồn</th></tr></thead><tbody>{items.map(item => { const [label, tone] = statusMeta(item); return <tr key={item.id} className={selected?.id === item.id ? 'is-selected' : ''} onClick={() => choose(item)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter') choose(item); }}><td><code>{time(item.createdAt)}</code></td><td><code>{item.agentKey}</code> <span className="aic-badge is-info">v{item.version}</span></td><td><code>{item.usedFallback ? 'dự phòng · ' : ''}{item.model || '—'}</code></td><td><code>{number(Number(item.inputTokens) + Number(item.cachedInputTokens))} / {number(item.outputTokens)}</code></td><td><code>{usd(item.costUsd)}</code></td><td><code>{latency(item.latencyMs)}</code></td><td><span className={`aic-badge is-${tone}`}>{label}</span></td><td>{item.refType === 'cs_item' ? <Link onClick={event => event.stopPropagation()} to={`/content-studio/items/${encodeURIComponent(item.refId)}`}>{sourceLabel(item)}</Link> : sourceLabel(item)}</td></tr>; })}</tbody></table></div>{!items.length && <p className="aic-no-rows">Không có lượt gọi phù hợp bộ lọc.</p>}{cursor && <div className="aic-load-more"><Button variant="outline" loading={loadingMore} onClick={more}>Tải thêm</Button></div>}</section><DetailPanel item={selected} canManage={canManage} onPreview={(title, content) => setPreview({ title, content })} /></div>
    </>}
    <Modal open={Boolean(preview)} title={preview?.title || ''} onClose={() => setPreview(null)} size="lg"><pre className="aic-preview-content">{preview?.content}</pre></Modal>
  </PageFrame></div>;
}
