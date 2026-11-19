import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, FileClock, PlugZap, Plus, Search } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageFrame, Skeleton } from '../../../design-system-v2';
import { getAgent, getUsage, listAgents, listConnections, errorMessage } from '../services/aiCoreApi';
import { formatCompactNumber } from '../utils/agentEditorUtils';
import './AgentsPage.css';

const usd = value => `$${Number(value || 0).toFixed(Number(value || 0) < 0.1 ? 3 : 2)}`;
const number = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

function Progress({ value, max, threshold = 80 }) {
  const percent = max > 0 ? Math.min(100, value / max * 100) : 0;
  const tone = percent >= 100 ? 'danger' : percent >= threshold ? 'warning' : 'success';
  return <div className={`aic-progress is-${tone}`}><i style={{ width: `${percent}%` }} /></div>;
}

export default function AgentsPage({ canManage = false }) {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [feature, setFeature] = useState('all');
  const [provider, setProvider] = useState('all');
  const [status, setStatus] = useState('active');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [items, summary, connections] = await Promise.all([listAgents(), getUsage({ days: 7 }), listConnections()]);
      const connectionById = new Map(connections.map(item => [item.id, item]));
      const details = await Promise.all(items.map(item => getAgent(item.key).catch(() => null)));
      setAgents(items.map((item, index) => {
        const detail = details[index];
        const version = detail?.published || detail?.draft || null;
        return {
          ...item,
          displayVersion: version,
          provider: connectionById.get(version?.connectionId)?.provider || '',
          fallbackProvider: connectionById.get(version?.fallbackConnectionId)?.provider || '',
        };
      }));
      setUsage(summary);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Không thể tải danh sách agent.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const features = useMemo(() => [...new Set(agents.map(item => item.feature).filter(Boolean))].sort(), [agents]);
  const providers = useMemo(() => [...new Set(agents.map(item => item.provider).filter(Boolean))].sort(), [agents]);
  const filtered = useMemo(() => agents.filter(item => {
    const term = query.trim().toLocaleLowerCase('vi');
    return (!term || `${item.name} ${item.key}`.toLocaleLowerCase('vi').includes(term))
      && (feature === 'all' || item.feature === feature)
      && (provider === 'all' || item.provider === provider)
      && (status === 'all' || item.status === status);
  }), [agents, feature, provider, query, status]);

  const calls = agents.reduce((total, item) => total + Number(item.health?.metrics?.calls || 0), 0);
  const failures = agents.reduce((total, item) => {
    const metrics = item.health?.metrics;
    if (!metrics) return total;
    return total + Number(metrics.calls || 0) * Math.min(100, Number(metrics.blockedPct || 0) + Number(metrics.providerErrorPct || 0)) / 100;
  }, 0);
  const success = calls ? Math.max(0, (calls - failures) / calls * 100) : null;
  const attention = agents.filter(item => item.health?.level === 'warn');
  const tokenTotal = Number(usage?.tokens?.input || 0) + Number(usage?.tokens?.output || 0);
  const cachePct = usage?.tokens?.input ? Number(usage.tokens.cachedInput || 0) / Number(usage.tokens.input) * 100 : 0;

  return <div className="aic-page aic-agents-page">
    <PageFrame
      breadcrumb={[{ label: 'AI Core' }, { label: 'Agents' }]}
      header={<div className="aic-page-head"><h1>Agents</h1><nav>
        <Button variant="outline" icon={<PlugZap />} onClick={() => navigate('/ai-core/connections')}>Kết nối &amp; bảng giá</Button>
        <Button variant="outline" icon={<FileClock />} onClick={() => navigate('/ai-core/logs')}>Nhật ký gọi</Button>
        {canManage && <Button icon={<Plus />} onClick={() => navigate('/ai-core/agents/new')}>Tạo agent</Button>}
      </nav></div>}
    >
      {loading ? <div className="aic-loading"><Skeleton lines={8} /></div> : error ? <ErrorState title="Không thể tải AI Core" description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /> : <>
        <section className="aic-overview" aria-label="Tổng quan AI Core">
          <article><span>Chi phí tháng {new Date().getMonth() + 1}</span><strong>{usd(usage?.month?.spent)}</strong><Progress value={usage?.month?.spent || 0} max={usage?.month?.budgetTotal || 0} /><small>{Math.round((usage?.month?.spent || 0) / Math.max(usage?.month?.budgetTotal || 0, 1) * 100)}% ngân sách {usd(usage?.month?.budgetTotal)} · dự báo {usd(usage?.month?.forecast)} cuối tháng</small></article>
          <article><span>Lượt gọi (7 ngày)</span><strong>{number(calls)}</strong><small className="is-success">{success == null ? 'Chưa có dữ liệu thành công' : `${success.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% thành công`}</small></article>
          <article><span>Token (7 ngày)</span><strong>{formatCompactNumber(tokenTotal)}</strong><small>{formatCompactNumber(usage?.tokens?.input)} vào · {formatCompactNumber(usage?.tokens?.output)} ra · {Math.round(cachePct)}% cache</small></article>
          <article className={attention.length ? 'is-warning' : ''}><span>Cần chú ý</span><strong>{attention.length} agent</strong><small>{attention.length ? attention.slice(0, 2).map(item => item.health.label).join(' · ') : 'Tất cả agent đang ổn định'}</small></article>
        </section>

        <div className="aic-filters">
          <label className="aic-search"><Search /><input aria-label="Tìm agent" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc key…" /></label>
          <label><span className="aic-sr-only">Tính năng</span><select value={feature} onChange={event => setFeature(event.target.value)}><option value="all">Tính năng: Tất cả</option>{features.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span className="aic-sr-only">Provider</span><select value={provider} onChange={event => setProvider(event.target.value)}><option value="all">Provider: Tất cả</option>{providers.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span className="aic-sr-only">Trạng thái</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Trạng thái: Tất cả</option><option value="active">Đang chạy</option><option value="paused">Tạm dừng</option></select></label>
        </div>

        {!agents.length ? <EmptyState title="Chưa có agent" description="Tạo agent đầu tiên để cấu hình model, prompt và giới hạn chi phí." action={canManage ? <Button icon={<Plus />} onClick={() => navigate('/ai-core/agents/new')}>Tạo agent</Button> : null} /> : !filtered.length ? <EmptyState title="Không tìm thấy agent" description="Hãy đổi từ khoá hoặc bộ lọc." /> : <div className="aic-table-wrap"><table className="aic-table">
          <thead><tr><th>Agent</th><th>Tính năng</th><th>Model</th><th>Phiên bản</th><th>Max token in / out</th><th>Trần / lượt</th><th>Chi phí tháng / ngân sách</th><th>Sức khoẻ</th><th /></tr></thead>
          <tbody>{filtered.map(item => {
            const version = item.displayVersion;
            const health = item.health || { level: 'ok', label: 'Ổn định' };
            return <tr key={item.key}>
              <td><Link to={`/ai-core/agents/${encodeURIComponent(item.key)}`}>{item.name}</Link><code>{item.key}</code></td>
              <td>{item.feature}</td>
              <td><span>{version?.model || 'Chưa cấu hình'}</span><code>{version?.fallbackModel ? `dự phòng: ${version.fallbackModel}` : 'không có dự phòng'}</code></td>
              <td><span className="aic-badge is-info">{version ? `v${version.version}` : 'Chưa có'}</span></td>
              <td><code>{version ? `${number(version.maxInputTokens)} / ${number(version.maxOutputTokens)}` : '—'}</code></td>
              <td><code>{usd(item.maxCostPerCallUsd)}</code></td>
              <td className="aic-budget-cell"><div><strong>{usd(item.monthSpentUsd)}</strong><span>{usd(item.monthlyBudgetUsd)}</span></div><Progress value={item.monthSpentUsd} max={item.monthlyBudgetUsd} threshold={item.alertThresholdPct} /></td>
              <td><span className={`aic-badge is-${health.level === 'warn' ? 'warning' : 'success'}`}>{health.level === 'warn' && <AlertTriangle />}{health.label}</span></td>
              <td><Link to={`/ai-core/agents/${encodeURIComponent(item.key)}`}>Mở</Link></td>
            </tr>;
          })}</tbody>
        </table></div>}
        <p className="aic-footnote">Chi phí tính bằng USD; quy đổi VND để sau.</p>
      </>}
    </PageFrame>
  </div>;
}
