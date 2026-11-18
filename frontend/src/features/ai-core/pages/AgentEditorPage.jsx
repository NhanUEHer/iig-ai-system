import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, FileClock, FlaskConical, History, Save, Send, X } from 'lucide-react';
import { Button, ConfirmDialog, ErrorState, PageFrame, Skeleton, Tooltip } from '../../../design-system-v2';
import {
  createAgent, errorMessage, getAgent, listConnections, listModels, publishAgent,
  saveAgentDraft, testAgent, updateAgent,
} from '../services/aiCoreApi';
import { detectTemplateVariables, estimateInputTokens, validateJsonSchemaText } from '../utils/agentEditorUtils';
import './AgentEditorPage.css';

const DEFAULT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };
const DEFAULT_DRAFT = {
  connectionId: '', model: '', fallbackConnectionId: '', fallbackModel: '', systemPrompt: '', userTemplate: '',
  temperature: 0.2, maxInputTokens: 6000, maxOutputTokens: 2000, timeoutMs: 60000, maxRetries: 2,
  repairInvalidJson: true, changeNote: '',
};
const DEFAULT_IDENTITY = {
  key: '', name: '', feature: 'Content Studio', description: '', status: 'active',
  maxCostPerCallUsd: 0.01, monthlyBudgetUsd: 20, alertThresholdPct: 80, maxConcurrency: 4,
};

const usd = value => `$${Number(value || 0).toFixed(4)}`;
const inputNumber = event => event.target.value === '' ? '' : Number(event.target.value);
const serialize = (identity, draft, schemaText) => JSON.stringify({ identity, draft, schemaText });

function Field({ label, help, error, children, className = '' }) {
  return <label className={`aic-field ${error ? 'has-error' : ''} ${className}`}><span>{label}</span>{children}{help && <small>{help}</small>}{error && <em>{error}</em>}</label>;
}

function Card({ title, tools, children, accent = false }) {
  return <section className={`aic-editor-card${accent ? ' is-accent' : ''}`}><header><h2>{title}</h2>{tools}</header>{children}</section>;
}

export default function AgentEditorPage({ canManage = false, showMsg }) {
  const { key: routeKey } = useParams();
  const isNew = !routeKey || routeKey === 'new';
  const navigate = useNavigate();
  const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [schemaText, setSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [connections, setConnections] = useState([]);
  const [models, setModels] = useState([]);
  const [agent, setAgent] = useState(null);
  const [variables, setVariables] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState('');
  const [error, setError] = useState('');
  const baseline = useRef('');

  const variableNames = useMemo(() => detectTemplateVariables(draft.userTemplate), [draft.userTemplate]);
  const schemaValidation = useMemo(() => validateJsonSchemaText(schemaText), [schemaText]);
  const dirty = !loading && baseline.current && baseline.current !== serialize(identity, draft, schemaText);
  const selectedConnection = connections.find(item => item.id === draft.connectionId);
  const mainModels = models.filter(item => item.status === 'active' && item.provider === selectedConnection?.provider);
  const fallbackChoices = connections.filter(item => item.status === 'active').flatMap(connection =>
    models.filter(model => model.status === 'active' && model.provider === connection.provider)
      .map(model => ({ value: `${connection.id}::${model.model}`, label: `${connection.provider === 'gemini' ? 'Gemini' : 'DeepSeek'} · ${connection.name} — ${model.model}` })),
  );
  const fallbackValue = draft.fallbackConnectionId && draft.fallbackModel ? `${draft.fallbackConnectionId}::${draft.fallbackModel}` : '';
  const activeModel = models.find(item => item.provider === selectedConnection?.provider && item.model === draft.model);
  const estimatedTokens = estimateInputTokens(variables);
  const estimatedMaxCost = activeModel
    ? (estimatedTokens * Number(activeModel.priceIn || 0) + Number(draft.maxOutputTokens || 0) * Number(activeModel.priceOut || 0)) / 1_000_000
    : 0;

  const applyLoaded = (loaded, deps) => {
    const version = loaded?.draft || loaded?.published;
    const nextIdentity = loaded ? {
      key: loaded.key, name: loaded.name, feature: loaded.feature, description: loaded.description || '', status: loaded.status,
      maxCostPerCallUsd: loaded.maxCostPerCallUsd, monthlyBudgetUsd: loaded.monthlyBudgetUsd,
      alertThresholdPct: loaded.alertThresholdPct, maxConcurrency: loaded.maxConcurrency,
    } : { ...DEFAULT_IDENTITY };
    const firstConnection = deps.connections.find(item => item.status === 'active');
    const firstModel = deps.models.find(item => item.status === 'active' && item.provider === firstConnection?.provider);
    const nextDraft = version ? {
      connectionId: version.connectionId || '', model: version.model || '', fallbackConnectionId: version.fallbackConnectionId || '',
      fallbackModel: version.fallbackModel || '', systemPrompt: version.systemPrompt || '', userTemplate: version.userTemplate || '',
      temperature: version.temperature, maxInputTokens: version.maxInputTokens, maxOutputTokens: version.maxOutputTokens,
      timeoutMs: version.timeoutMs, maxRetries: version.maxRetries, repairInvalidJson: version.repairInvalidJson,
      changeNote: version.changeNote || '',
    } : { ...DEFAULT_DRAFT, connectionId: firstConnection?.id || '', model: firstModel?.model || '' };
    const nextSchema = JSON.stringify(version?.outputSchema || DEFAULT_SCHEMA, null, 2);
    setAgent(loaded);
    setIdentity(nextIdentity);
    setDraft(nextDraft);
    setSchemaText(nextSchema);
    setVariables(Object.fromEntries(detectTemplateVariables(nextDraft.userTemplate).map(name => [name, ''])));
    baseline.current = serialize(nextIdentity, nextDraft, nextSchema);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [connectionItems, modelItems, loaded] = await Promise.all([
        listConnections(), listModels(), isNew ? Promise.resolve(null) : getAgent(routeKey),
      ]);
      setConnections(connectionItems);
      setModels(modelItems);
      applyLoaded(loaded, { connections: connectionItems, models: modelItems });
    } catch (loadError) {
      setError(errorMessage(loadError, 'Không thể tải cấu hình agent.'));
    } finally {
      setLoading(false);
    }
  };

  // Loading is intentionally keyed by the route; the request helper is local to this screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [routeKey]);
  useEffect(() => {
    setVariables(current => Object.fromEntries(variableNames.map(name => [name, current[name] || ''])));
  }, [variableNames]);
  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    const warnLink = event => {
      if (!dirty) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank') return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      event.preventDefault();
      setPendingNavigation(`${target.pathname}${target.search}${target.hash}`);
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', warnLink, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', warnLink, true); };
  }, [dirty]);

  const updateIdentity = field => event => setIdentity(current => ({ ...current, [field]: event.target.type === 'number' ? inputNumber(event) : event.target.value }));
  const updateDraft = field => event => setDraft(current => ({ ...current, [field]: event.target.type === 'number' ? inputNumber(event) : event.target.value }));
  const safeNavigate = path => { if (dirty) setPendingNavigation(path); else navigate(path); };
  const discardAndNavigate = () => {
    const target = pendingNavigation;
    baseline.current = serialize(identity, draft, schemaText);
    setPendingNavigation('');
    navigate(target);
  };

  const draftBody = () => ({
    ...draft,
    fallbackConnectionId: draft.fallbackConnectionId || null,
    fallbackModel: draft.fallbackModel || null,
    variables: variableNames.map(name => ({ name, required: true, description: '' })),
    outputSchema: schemaValidation.value,
  });

  const validateForm = () => {
    if (!identity.name.trim() || !identity.key.trim() || !identity.feature.trim()) return 'Tên, key và tính năng là bắt buộc.';
    if (!/^[a-z0-9]+(?:\.[a-z0-9_]+)+$/.test(identity.key)) return 'Key phải có dạng feature.agent_name, chỉ gồm chữ thường, số, dấu chấm và gạch dưới.';
    if (!draft.connectionId || !draft.model) return 'Hãy chọn kết nối và model chính.';
    if (!schemaValidation.valid) return schemaValidation.error;
    return '';
  };

  const persist = async ({ silent = false } = {}) => {
    const invalid = validateForm();
    if (invalid) { setError(invalid); return null; }
    setSaving(true);
    setError('');
    try {
      let saved;
      if (isNew && !agent) {
        saved = await createAgent({ ...identity, draft: draftBody() });
        navigate(`/ai-core/agents/${encodeURIComponent(saved.key)}`, { replace: true });
      } else {
        const key = agent?.key || routeKey;
        await updateAgent(key, {
          name: identity.name, description: identity.description, status: identity.status,
          maxCostPerCallUsd: identity.maxCostPerCallUsd, monthlyBudgetUsd: identity.monthlyBudgetUsd,
          alertThresholdPct: identity.alertThresholdPct, maxConcurrency: identity.maxConcurrency,
        });
        await saveAgentDraft(key, draftBody());
        saved = await getAgent(key);
      }
      applyLoaded(saved, { connections, models });
      setResult(null);
      if (!silent) showMsg?.('Đã lưu bản nháp agent.');
      return saved;
    } catch (saveError) {
      setError(errorMessage(saveError, 'Không thể lưu bản nháp.'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    const missing = variableNames.find(name => !String(variables[name] || '').trim());
    if (missing) { setError(`Hãy nhập giá trị chạy thử cho biến {{${missing}}}.`); return; }
    setTesting(true);
    setError('');
    try {
      const saved = dirty || !agent || !agent.draft ? await persist({ silent: true }) : agent;
      if (!saved) return;
      const startedAt = performance.now();
      const tested = await testAgent(saved.key, variables);
      setResult({ ...tested, latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) });
      const refreshed = await getAgent(saved.key);
      setAgent(refreshed);
      showMsg?.('Bản nháp đã chạy thử đạt schema.');
    } catch (testError) {
      setResult({ error: errorMessage(testError, 'Chạy thử không thành công.') });
      setError(errorMessage(testError, 'Chạy thử không thành công.'));
    } finally {
      setTesting(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setError('');
    try {
      const published = await publishAgent(agent.key);
      applyLoaded(published, { connections, models });
      setResult(null);
      showMsg?.(`Đã phát hành v${published.published?.version}.`);
    } catch (publishError) {
      setError(errorMessage(publishError, 'Không thể phát hành agent.'));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <div className="aic-page aic-editor-page"><div className="aic-loading"><Skeleton lines={12} /></div></div>;
  if (error && !connections.length) return <div className="aic-page aic-editor-page"><ErrorState title="Không thể mở agent" description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /></div>;

  const draftVersion = agent?.draft?.version || (agent?.published?.version ? agent.published.version + 1 : 1);
  const canPublish = canManage && Boolean(agent?.draft?.lastTestOkAt || result?.checks?.schemaOk) && !dirty;
  const testUsage = result?.usage || {};
  const responseJson = result?.data ?? result?.preview?.response ?? null;

  return <div className="aic-page aic-editor-page">
    <PageFrame breadcrumb={[{ label: 'AI Core', to: '/ai-core' }, { label: 'Agents', to: '/ai-core' }, { label: isNew && !agent ? 'Tạo agent' : identity.name || identity.key }]} breadcrumbLinkComponent={Link}>
      <div className="aic-editor-head">
        <div><div className="aic-editor-title"><h1>{isNew && !agent ? 'Tạo agent' : identity.name || 'Agent chưa đặt tên'}</h1>{agent?.draft && <span className="aic-badge is-warning">Nháp v{agent.draft.version}{agent.published ? ` · sửa từ v${agent.published.version}` : ''}</span>}{agent?.published && <span className="aic-badge is-success">Đang chạy v{agent.published.version}</span>}</div>{agent ? <code>{identity.key} · {identity.feature}</code> : <p className="aic-editor-sub">Điền thông tin, viết prompt, chạy thử đạt rồi phát hành.</p>}</div>
        <nav>
          {agent && <Button variant="outline" icon={<History />} onClick={() => safeNavigate(`/ai-core/agents/${encodeURIComponent(agent?.key || '')}/versions`)}>Phiên bản</Button>}
          {agent && <Button variant="outline" icon={<FileClock />} onClick={() => safeNavigate(`/ai-core/logs?agentKey=${encodeURIComponent(agent?.key || '')}`)}>Nhật ký</Button>}
          {canManage && <Button variant="outline" icon={<Save />} loading={saving} onClick={() => persist()}>Lưu nháp</Button>}
          {canManage && <Tooltip content={canPublish ? `Phát hành v${draftVersion}` : 'Cần lưu và chạy thử bản nháp đạt schema trước khi phát hành'}><span><Button icon={<Send />} loading={publishing} disabled={!canPublish} onClick={publish}>Phát hành v{draftVersion}</Button></span></Tooltip>}
        </nav>
      </div>
      {error && <div className="aic-inline-error"><X />{error}<button type="button" onClick={() => setError('')} aria-label="Đóng"><X /></button></div>}
      {!canManage && <div className="aic-readonly-note">Bạn đang xem ở chế độ chỉ đọc. Cần quyền <code>ai_core.manage</code> để chỉnh sửa, chạy thử hoặc phát hành.</div>}

      <div className="aic-editor-layout">
        <main>
          <Card title="Thiết kế prompt" tools={<div className="aic-variable-list"><span>Biến:</span>{variableNames.length ? variableNames.map(name => <code key={name}>{`{{${name}}}`}</code>) : <small>chưa phát hiện</small>}</div>}>
            <Field label="System prompt" help="Vai trò và quy tắc chung cho model"><textarea className="is-prose" rows="5" placeholder="You are … Return JSON only." value={draft.systemPrompt} onChange={updateDraft('systemPrompt')} disabled={!canManage} /></Field>
            <Field label="User prompt (template)" help="Biến dùng cú pháp {{variable_name}}"><textarea className="is-prose" rows="5" placeholder="Translate this sentence into Vietnamese: {{sentence}}" value={draft.userTemplate} onChange={updateDraft('userTemplate')} disabled={!canManage} /></Field>
            <Field label="JSON schema đầu ra" error={schemaValidation.valid ? '' : schemaValidation.error}><textarea rows="10" value={schemaText} onChange={event => setSchemaText(event.target.value)} disabled={!canManage} /></Field>
            {schemaValidation.valid && <span className="aic-schema-ok"><Check /> JSON hợp lệ</span>}
          </Card>

          <div className="aic-test-row">
          <Card title="Chạy thử bản nháp" accent tools={<small>không tính vào ngân sách tháng</small>}>
            {!variableNames.length && <p className="aic-test-guidance">Thêm biến <code>{'{{variable}}'}</code> vào user prompt để tạo ô dữ liệu chạy thử.</p>}
            {variableNames.map(name => <Field key={name} label={<code className="aic-variable">{name}</code>}><textarea rows={2} value={variables[name] || ''} onChange={event => setVariables(current => ({ ...current, [name]: event.target.value }))} disabled={!canManage} /></Field>)}
            <div className="aic-test-action"><span>Ước tính trước: {estimatedTokens.toLocaleString('vi-VN')} token vào · tối đa {usd(estimatedMaxCost)}</span><Button variant="secondary" icon={<FlaskConical />} loading={testing || saving} disabled={!canManage || !variableNames.length || !schemaValidation.valid} onClick={runTest}>Chạy thử</Button></div>
          </Card>

          <Card title="Kết quả" tools={result && <span className={`aic-badge is-${result.error ? 'warning' : 'success'}`}>{result.error ? 'Không đạt' : 'Đạt'}</span>}>
            {!result ? <p className="aic-result-empty">Kết quả JSON, token, chi phí và kiểm tra schema sẽ hiển thị sau khi chạy thử.</p> : result.error ? <div className="aic-result-error"><X />{result.error}</div> : <>
              <div className="aic-result-stats">
                <div><span>Token vào</span><strong>{Number(testUsage.input || 0).toLocaleString('vi-VN')} <small>· {Number(testUsage.cachedInput || 0).toLocaleString('vi-VN')} cache</small></strong></div>
                <div><span>Token ra</span><strong>{Number(testUsage.output || 0).toLocaleString('vi-VN')} <small>/ {Number(draft.maxOutputTokens || 0).toLocaleString('vi-VN')}</small></strong></div>
                <div><span>Chi phí</span><strong>{usd(result.costUsd)} <small>/ {usd(identity.maxCostPerCallUsd)}</small></strong></div>
                <div><span>Thời gian</span><strong>{result.latencyMs ? `${(result.latencyMs / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} s` : '—'}</strong></div>
              </div>
              <ul className={result.checks?.schemaOk && result.checks?.notTruncated && result.checks?.underCeiling ? 'is-ok' : 'is-warning'}>
                <li>{result.checks?.schemaOk ? '✓' : '✕'} JSON đúng schema{result.repaired ? ' sau khi sửa' : ' ngay lần đầu'}</li>
                <li>{result.checks?.notTruncated ? '✓ Không bị cắt (finish: stop)' : '✕ Kết quả bị cắt token'}</li>
                <li>{result.checks?.underCeiling ? '✓ Dưới trần mỗi lượt' : '✕ Vượt trần mỗi lượt'}</li>
              </ul>
              <pre>{typeof responseJson === 'string' ? responseJson : JSON.stringify(responseJson, null, 2)}</pre>
            </>}
          </Card>
          </div>
        </main>

        <aside className="aic-config-panel">
          <header><h2>Cấu hình agent</h2></header>
          <section><h3>Thông tin</h3>
            <div className="aic-grid aic-grid-2">
              <Field className="is-wide" label={<>Tên agent <i className="aic-req">*</i></>}><input value={identity.name} onChange={updateIdentity('name')} disabled={!canManage} placeholder="Ví dụ: Từ điển · định nghĩa" /></Field>
              <Field label={<>Key <i className="aic-req">*</i></>} help="Dạng tính_năng.tên, không đổi được sau khi tạo"><input className="is-mono" value={identity.key} onChange={updateIdentity('key')} disabled={!canManage || Boolean(agent)} placeholder="cs.dict_define" /></Field>
              <Field label={<>Tính năng <i className="aic-req">*</i></>}><input value={identity.feature} onChange={updateIdentity('feature')} disabled={!canManage} placeholder="Content Studio" /></Field>
            </div>
          </section>
          <section><h3>Mô hình</h3>
            <div className="aic-grid aic-grid-2">
              <Field className="is-wide" label="Kết nối chính"><select value={draft.connectionId} onChange={event => { const connectionId = event.target.value; const connection = connections.find(item => item.id === connectionId); const model = models.find(item => item.status === 'active' && item.provider === connection?.provider); setDraft(current => ({ ...current, connectionId, model: model?.model || '' })); }} disabled={!canManage}><option value="">Chọn kết nối</option>{connections.filter(item => item.status === 'active').map(item => <option key={item.id} value={item.id}>{item.provider === 'gemini' ? 'Gemini' : 'DeepSeek'} · {item.name}</option>)}</select></Field>
              <Field label="Model"><select value={draft.model} onChange={updateDraft('model')} disabled={!canManage}><option value="">Chọn model</option>{mainModels.map(item => <option key={item.model} value={item.model}>{item.model}</option>)}</select></Field>
              <Field label="Temperature"><input type="number" min="0" max="2" step="0.1" value={draft.temperature} onChange={updateDraft('temperature')} disabled={!canManage} /></Field>
            </div>
            <div className="aic-grid aic-grid-2">
              <Field className="is-wide" label="Dự phòng khi lỗi" help="Chạy khi provider chính lỗi 5xx, timeout hoặc quá tải"><select value={fallbackValue} onChange={event => { const [fallbackConnectionId = '', fallbackModel = ''] = event.target.value.split('::'); setDraft(current => ({ ...current, fallbackConnectionId, fallbackModel })); }} disabled={!canManage}><option value="">Không dùng dự phòng</option>{fallbackChoices.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
              <Field label="Định dạng đầu ra" help="Gemini: ép schema · DeepSeek: JSON + tự kiểm schema"><select value="json_schema" disabled><option value="json_schema">JSON theo schema</option></select></Field>
            </div>
          </section>
          <section><h3>Giới hạn token & thử lại</h3>
            <div className="aic-grid aic-grid-2">
              <Field label="Max token đầu vào" help="Vượt → từ chối, mã INPUT_TOO_LARGE"><input type="number" min="1" value={draft.maxInputTokens} onChange={updateDraft('maxInputTokens')} disabled={!canManage} /></Field>
              <Field label="Max token đầu ra" help="Gồm cả token suy nghĩ của model"><input type="number" min="1" value={draft.maxOutputTokens} onChange={updateDraft('maxOutputTokens')} disabled={!canManage} /></Field>
              <Field label="Timeout (giây)"><input type="number" min="1" max="600" value={Number(draft.timeoutMs || 0) / 1000} onChange={event => setDraft(current => ({ ...current, timeoutMs: Number(event.target.value) * 1000 }))} disabled={!canManage} /></Field>
            </div>
            <div className="aic-grid aic-grid-2">
              <Field label="Số lần thử lại" help="Khi 429 / 5xx / timeout, chờ tăng dần"><input type="number" min="0" max="5" value={draft.maxRetries} onChange={updateDraft('maxRetries')} disabled={!canManage} /></Field>
              <Field label="Sửa JSON sai schema"><select value={draft.repairInvalidJson ? 'yes' : 'no'} onChange={event => setDraft(current => ({ ...current, repairInvalidJson: event.target.value === 'yes' }))} disabled={!canManage}><option value="yes">Nhờ AI sửa 1 lần</option><option value="no">Không tự sửa</option></select></Field>
              <Field label="Chạy đồng thời tối đa"><input type="number" min="1" max="100" value={identity.maxConcurrency} onChange={updateIdentity('maxConcurrency')} disabled={!canManage} /></Field>
            </div>
          </section>
          <section><h3>Trần chi phí & cảnh báo (USD)</h3>
            <div className="aic-grid aic-grid-2">
              <Field label="Trần mỗi lượt" help="Ước tính tối đa vượt → không gọi, mã COST_CEILING"><div className="aic-input-prefix"><span>$</span><input type="number" min="0" step="0.001" value={identity.maxCostPerCallUsd} onChange={updateIdentity('maxCostPerCallUsd')} disabled={!canManage} /></div></Field>
              <Field label="Ngân sách tháng" help="Hết → tạm dừng hàng đợi, mã QUOTA_EXCEEDED"><div className="aic-input-prefix"><span>$</span><input type="number" min="0" step="1" value={identity.monthlyBudgetUsd} onChange={updateIdentity('monthlyBudgetUsd')} disabled={!canManage} /></div></Field>
              <Field label="Cảnh báo khi đạt" help="Báo trên danh sách và gửi thông báo"><div className="aic-input-suffix"><input type="number" min="1" max="100" value={identity.alertThresholdPct} onChange={updateIdentity('alertThresholdPct')} disabled={!canManage} /><span>%</span></div></Field>
            </div>
          </section>
        </aside>
      </div>
      <ConfirmDialog
        open={Boolean(pendingNavigation)}
        title="Bỏ thay đổi chưa lưu?"
        description="Các chỉnh sửa trên bản nháp này chưa được lưu và sẽ bị mất khi rời trang."
        confirmLabel="Bỏ thay đổi"
        cancelLabel="Ở lại"
        danger
        onConfirm={discardAndNavigate}
        onClose={() => setPendingNavigation('')}
      />
    </PageFrame>
  </div>;
}
