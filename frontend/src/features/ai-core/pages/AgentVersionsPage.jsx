import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { History, RotateCcw, Send } from 'lucide-react';
import { Button, ConfirmDialog, ErrorState, PageFrame, Skeleton, Tooltip } from '../../../design-system-v2';
import {
  diffAgentVersions, errorMessage, getAgent, listAgentVersions, publishAgent, restoreAgentVersion,
} from '../services/aiCoreApi';
import './AiCoreOperations.css';

const number = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const usd = value => `$${Number(value || 0).toFixed(4)}`;
const dateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const statusLabel = { draft: 'Nháp', published: 'Đang chạy', archived: 'Lưu trữ' };
const fieldLabel = {
  connectionId: 'Kết nối chính', model: 'Model', fallbackConnectionId: 'Kết nối dự phòng', fallbackModel: 'Model dự phòng',
  temperature: 'Temperature', maxInputTokens: 'Max token đầu vào', maxOutputTokens: 'Max token đầu ra',
  timeoutMs: 'Timeout (ms)', maxRetries: 'Số lần thử lại', repairInvalidJson: 'Sửa JSON sai schema', variables: 'Biến đầu vào',
};

function valueText(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function VersionStats({ item }) {
  const calls = Number(item.usage?.calls || 0);
  const average = calls ? Number(item.usage?.costUsd || 0) / calls : 0;
  const schemaPct = calls ? Number(item.usage?.schemaFirstTryOk || 0) / calls * 100 : 0;
  const cutPct = calls ? Number(item.usage?.truncated || 0) / calls * 100 : 0;
  if (item.status === 'draft') {
    return <code>chạy thử {number(calls)} lần · đạt {number(item.usage?.success)}/{number(calls)} · TB {usd(average)}/lượt</code>;
  }
  return <code>{number(calls)} lượt · TB {usd(average)} · JSON đúng {schemaPct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% · cắt {cutPct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</code>;
}

function LineDiff({ title, rows }) {
  if (!rows?.length) return <section className="aic-diff-block"><h3>{title}</h3><p className="aic-muted">Không thay đổi.</p></section>;
  return <section className="aic-diff-block"><h3>{title}</h3><pre>{rows.flatMap(row => [
    <span className="is-removed" key={`a-${row.line}`}>- {row.a ?? ''}</span>,
    <span className="is-added" key={`b-${row.line}`}>+ {row.b ?? ''}</span>,
  ])}</pre></section>;
}

export default function AgentVersionsPage({ canManage = false, showMsg }) {
  const { key } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [versions, setVersions] = useState([]);
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoreVersion, setRestoreVersion] = useState(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [agentData, items] = await Promise.all([getAgent(key), listAgentVersions(key)]);
      setAgent(agentData); setVersions(items);
      const first = items[0]?.version;
      const second = items.find(item => item.status === 'published' && item.version !== first)?.version ?? items[1]?.version ?? first;
      setLeft(String(second ?? '')); setRight(String(first ?? ''));
    } catch (requestError) { setError(errorMessage(requestError, 'Không thể tải lịch sử phiên bản.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!left || !right || left === right) { setDiff(null); return; }
    let active = true;
    diffAgentVersions(key, left, right).then(value => active && setDiff(value)).catch(requestError => active && setError(errorMessage(requestError, 'Không thể so sánh phiên bản.')));
    return () => { active = false; };
  }, [key, left, right]);

  const byVersion = useMemo(() => new Map(versions.map(item => [String(item.version), item])), [versions]);
  const leftItem = byVersion.get(left); const rightItem = byVersion.get(right);
  const parameterRows = Object.keys(fieldLabel).map(field => ({ field, a: leftItem?.[field], b: rightItem?.[field] }));

  const restore = async () => {
    setBusy(true);
    try {
      await restoreAgentVersion(key, restoreVersion);
      showMsg?.(`Đã tạo bản nháp mới từ v${restoreVersion}.`); setRestoreVersion(null); await load();
    } catch (requestError) { setError(errorMessage(requestError, 'Không thể khôi phục phiên bản.')); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true);
    try { await publishAgent(key); showMsg?.(`Đã phát hành v${rightItem.version}.`); await load(); }
    catch (requestError) { setError(errorMessage(requestError, 'Không thể phát hành bản nháp.')); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="aic-page"><div className="aic-loading"><Skeleton lines={10} /></div></div>;
  if (error && !agent) return <div className="aic-page"><ErrorState title="Không thể mở phiên bản" description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /></div>;

  return <div className="aic-page aic-versions-page"><PageFrame breadcrumb={[{ label: 'AI Core', to: '/ai-core' }, { label: 'Agents', to: '/ai-core' }, { label: agent?.name || key, to: `/ai-core/agents/${encodeURIComponent(key)}` }, { label: 'Phiên bản' }]} breadcrumbLinkComponent={Link}>
    <div className="aic-page-head"><h1>Phiên bản prompt</h1><nav><Button variant="outline" onClick={() => navigate(`/ai-core/agents/${encodeURIComponent(key)}`)}>Cấu hình agent</Button></nav></div>
    {error && <div className="aic-inline-error">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    <div className="aic-versions-layout">
      <section className="aic-version-list" aria-label="Danh sách phiên bản">
        {versions.map(item => <button type="button" key={item.id} className={right === String(item.version) ? 'is-selected' : ''} onClick={() => setRight(String(item.version))}>
          <span><strong>v{item.version}</strong><em className={`is-${item.status}`}>{statusLabel[item.status]}</em><time>{dateTime(item.publishedAt || item.createdAt)}</time></span>
          <p>{item.changeNote || 'Không có ghi chú thay đổi'}</p><VersionStats item={item} />
        </button>)}
      </section>
      <section className="aic-compare-card">
        <header><div><History /><h2>So sánh phiên bản</h2></div><nav>
          {canManage && <Button variant="outline" icon={<RotateCcw />} disabled={!leftItem || leftItem.status === 'draft'} onClick={() => setRestoreVersion(leftItem?.version)}>Khôi phục v{leftItem?.version}</Button>}
          {canManage && rightItem?.status === 'draft' && <Tooltip content={rightItem.lastTestOkAt ? 'Phát hành bản nháp đã chạy thử đạt schema' : 'Cần chạy thử đạt schema trước khi phát hành'}><span><Button icon={<Send />} disabled={!rightItem.lastTestOkAt} loading={busy} onClick={publish}>Phát hành v{rightItem.version}</Button></span></Tooltip>}
        </nav></header>
        <div className="aic-version-pickers"><label>Bản gốc<select value={left} onChange={event => setLeft(event.target.value)}>{versions.map(item => <option key={item.id} value={item.version}>v{item.version} · {statusLabel[item.status]}</option>)}</select></label><span>so với</span><label>Bản mới<select value={right} onChange={event => setRight(event.target.value)}>{versions.map(item => <option key={item.id} value={item.version}>v{item.version} · {statusLabel[item.status]}</option>)}</select></label></div>
        {left === right ? <p className="aic-empty-comparison">Chọn hai phiên bản khác nhau để so sánh.</p> : <>
          <div className="aic-table-wrap"><table className="aic-table aic-compare-table"><thead><tr><th>Thay đổi</th><th>v{left}</th><th>v{right}</th></tr></thead><tbody>{parameterRows.map(row => <tr key={row.field}><td>{fieldLabel[row.field]}</td><td><code>{valueText(row.a)}</code></td><td className={JSON.stringify(row.a) !== JSON.stringify(row.b) ? 'is-changed' : ''}><code>{valueText(row.b)}</code></td></tr>)}</tbody></table></div>
          <LineDiff title="System prompt" rows={diff?.systemPrompt} /><LineDiff title="User prompt" rows={diff?.userTemplate} /><LineDiff title="JSON schema" rows={diff?.outputSchema} />
        </>}
        <p className="aic-muted">Chỉ phát hành được khi bản nháp đã chạy thử đạt schema ít nhất 1 lần. Mỗi lượt gọi trong nhật ký ghi lại phiên bản đã dùng.</p>
      </section>
    </div>
    <ConfirmDialog open={restoreVersion != null} title={`Khôi phục cấu hình v${restoreVersion}?`} description="Một bản nháp mới sẽ được tạo từ phiên bản này. Bản nháp hiện tại (nếu có) sẽ được thay thế." confirmLabel="Khôi phục" loading={busy} onConfirm={restore} onClose={() => setRestoreVersion(null)} />
  </PageFrame></div>;
}
