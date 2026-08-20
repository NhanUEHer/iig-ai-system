import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ArrowRight, BookOpenText, Bot, Check, CheckCircle2, Edit3, Eye, EyeOff, KeyRound, LibraryBig, Link2, Mic2, Plus, RefreshCw, Search, Sparkles, Trash2, X } from 'lucide-react';
import {useDialog} from '../../../components/feedback/dialogContext';
import './AIConfigPage.css';
import './AIConfigExtensions.css';

const GROUPS = [
  { key: 'sp_read_aloud', section: 'Speaking', label: 'Q1–2 · Read Aloud' },
  { key: 'sp_describe_pic', section: 'Speaking', label: 'Q3–4 · Describe Picture' },
  { key: 'sp_respond_q', section: 'Speaking', label: 'Q5–7 · Respond Questions' },
  { key: 'sp_respond_info', section: 'Speaking', label: 'Q8–10 · Respond with Info' },
  { key: 'sp_opinion', section: 'Speaking', label: 'Q11 · Express Opinion' },
  { key: 'w_picture', section: 'Writing', label: 'Q1–5 · Picture Sentence' },
  { key: 'w_email', section: 'Writing', label: 'Q6–7 · Written Request' },
  { key: 'w_text', section: 'Writing', label: 'Q8 · Opinion Essay' }
];
const TARGET_LABELS = { student_answer: 'Bài nói học viên', question: 'Audio câu hỏi', context: 'Audio bối cảnh' };
const AGENT_TYPES = [
  { value: 'Grading', label: 'Grading', description: 'Chấm Speaking & Writing', icon: Sparkles },
  { value: 'STT', label: 'Speech to Text', description: 'Nhận dạng audio Speaking', icon: Mic2 },
  { value: 'Gen Key Vocab', label: 'Gen Key Vocab', description: 'Tạo từ vựng trọng tâm', icon: BookOpenText },
  { value: 'Gen Dictionary', label: 'Gen Dictionary', description: 'Tạo nội dung từ điển', icon: LibraryBig }
];
const isContentAgent = type => ['Gen Key Vocab', 'Gen Dictionary'].includes(type);
const emptyForm = { name: '', description: '', api_endpoint: 'https://dify.iigvn.site/v1', api_key: '', api_type: 'Grading', stt_target: 'student_answer', target_questions: [] };

export default function AIConfigPage({ showMsg }) {
  const {confirm:confirmDialog}=useDialog();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const fetchAgents = async (nextPage = page) => {
    setLoading(true);
    try { const response = await axios.get('/api/agents', { params: { page: nextPage, limit: 10, search: search.trim() || undefined, type: filter === 'all' ? undefined : filter } }); setAgents(response.data.data || []); setMeta(response.data.meta || { page: nextPage, limit: 10, total: 0, totalPages: 1 }); }
    catch (error) { showMsg?.(error.response?.data?.error || 'Không thể tải danh sách Agent.', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(() => fetchAgents(page), 250); return () => clearTimeout(timer); }, [page, search, filter]);

  const filtered = agents;

  const openCreate = () => { setForm(emptyForm); setModal({ mode: 'create' }); setShowKey(false); setTestResult(null); };
  const openEdit = agent => { setForm({ ...agent, api_key: '', stt_target: agent.stt_target || 'student_answer' }); setModal({ mode: 'edit', id: agent.id }); setShowKey(false); setTestResult(null); };
  const setType = apiType => setForm(value => ({ ...value, api_type: apiType, stt_target: 'student_answer', target_questions: isContentAgent(apiType) ? [] : apiType === 'STT' ? value.target_questions.filter(key => key.startsWith('sp_')) : value.target_questions }));
  const toggleGroup = key => setForm(value => ({ ...value, target_questions: value.target_questions.includes(key) ? value.target_questions.filter(item => item !== key) : [...value.target_questions, key] }));
  const selectSection = section => {
    const keys = GROUPS.filter(group => group.section === section && (form.api_type !== 'STT' || section === 'Speaking')).map(group => group.key);
    setForm(value => ({ ...value, target_questions: keys.every(key => value.target_questions.includes(key)) ? value.target_questions.filter(key => !keys.includes(key)) : [...new Set([...value.target_questions, ...keys])] }));
  };
  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    try { const response = await axios.post('/api/agents/test-connection', { api_endpoint: form.api_endpoint, api_key: form.api_key }); setTestResult({ type: 'success', text: `${response.data.message} · ${response.data.data.latencyMs}ms` }); }
    catch (error) { setTestResult({ type: 'error', text: error.response?.data?.error || 'Không thể kết nối Agent.' }); }
    finally { setTesting(false); }
  };
  const save = async event => {
    event.preventDefault();
    if (!isContentAgent(form.api_type) && !form.target_questions.length) return showMsg?.('Chọn ít nhất một nhóm câu hỏi.', 'error');
    setSaving(true);
    try {
      if (modal.mode === 'edit') await axios.put(`/api/agents/${modal.id}`, form); else await axios.post('/api/agents', form);
      showMsg?.(modal.mode === 'edit' ? 'Đã cập nhật Agent.' : 'Đã tạo Agent.', 'success');
      setModal(null); await fetchAgents(page);
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu Agent.', 'error'); }
    finally { setSaving(false); }
  };
  const remove = async agent => {
    if (!await confirmDialog({title:'Xóa AI Agent?',message:`Agent “${agent.name}” sẽ bị xóa khỏi hệ thống.`,confirmText:'Xóa Agent'})) return;
    try { await axios.delete(`/api/agents/${agent.id}`); showMsg?.('Đã xóa Agent.', 'success'); await fetchAgents(page); }
    catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xóa Agent.', 'error'); }
  };

  const gradingCount = agents.filter(agent => agent.api_type === 'Grading').length;
  const sttCount = agents.filter(agent => agent.api_type === 'STT').length;
  const contentCount = agents.filter(agent => isContentAgent(agent.api_type)).length;

  return <div className="agent-page">
    <header className="agent-header"><div><span>AI SCORING · AGENT ORCHESTRATION</span><h1>Quản lý AI Agents</h1><p>Cấu hình workflow, phân công nhóm câu hỏi và kiểm soát kết nối Dify.</p></div><button className="agent-button primary" onClick={openCreate}><Plus /> Thiết lập Agent</button></header>
    <section className="agent-metrics"><article><span className="blue"><Bot /></span><div><small>Tổng Agent</small><strong>{meta.total}</strong></div></article><article><span className="purple"><Sparkles /></span><div><small>Grading</small><strong>{gradingCount}</strong></div></article><article><span className="green"><Mic2 /></span><div><small>STT</small><strong>{sttCount}</strong></div></article><article><span className="amber"><BookOpenText /></span><div><small>Học liệu</small><strong>{contentCount}</strong></div></article></section>
    <section className="agent-list-card"><div className="agent-toolbar"><div className="agent-tabs">{['all', ...AGENT_TYPES.map(item => item.value)].map(type => <button key={type} className={filter === type ? 'active' : ''} onClick={() => { setFilter(type); setPage(1); }}>{type === 'all' ? 'Tất cả' : type}</button>)}</div><label><Search /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm tên, mô tả hoặc endpoint…" /></label></div>
      {loading ? <div className="agent-empty"><RefreshCw className="spin" /><strong>Đang tải Agents…</strong></div> : !filtered.length ? <div className="agent-empty"><Bot /><strong>Không tìm thấy Agent</strong><span>Thêm cấu hình mới hoặc thay đổi bộ lọc.</span></div> : <div className="agent-table-wrap"><table className="agent-table"><thead><tr><th>Agent</th><th>Loại</th><th>Phạm vi</th><th>Endpoint</th><th>Trạng thái</th><th>Cập nhật</th><th /></tr></thead><tbody>{filtered.map(agent => { const type = AGENT_TYPES.find(item => item.value === agent.api_type) || AGENT_TYPES[0]; const TypeIcon = type.icon; return <tr key={agent.id}><td><div className="agent-identity"><span className={agent.api_type.toLowerCase().replaceAll(' ', '-')}><TypeIcon /></span><div><strong>{agent.name}</strong><small>{agent.description || 'Chưa có mô tả nhiệm vụ.'}</small></div></div></td><td><span className={`agent-type ${agent.api_type.toLowerCase().replaceAll(' ', '-')}`}>{agent.api_type === 'STT' ? `STT · ${TARGET_LABELS[agent.stt_target]}` : type.label}</span></td><td>{isContentAgent(agent.api_type) ? <div className="agent-group-list"><span>Tạo học liệu</span></div> : <div className="agent-group-list">{agent.target_questions?.slice(0, 3).map(key => <span key={key}>{GROUPS.find(group => group.key === key)?.label || key}</span>)}{agent.target_questions?.length > 3 && <em>+{agent.target_questions.length - 3}</em>}</div>}</td><td><div className="agent-endpoint-cell"><Link2 /><span>{agent.api_endpoint}</span><KeyRound /></div></td><td><span className="agent-ready"><CheckCircle2 />Sẵn sàng</span></td><td><time>{new Date(agent.updated_at).toLocaleDateString('vi-VN')}</time></td><td><div className="agent-row-actions"><button onClick={() => openEdit(agent)} title="Chỉnh sửa"><Edit3 /></button><button className="danger" onClick={() => remove(agent)} title="Xóa"><Trash2 /></button></div></td></tr>; })}</tbody></table></div>}
      {meta.total > 0 && <footer className="list-pagination"><span>Hiển thị {agents.length} / {meta.total} Agent</span><div><span>Trang {meta.page}/{meta.totalPages}</span><button disabled={meta.page <= 1} onClick={() => setPage(value => value - 1)}><ArrowLeft /></button><button disabled={meta.page >= meta.totalPages} onClick={() => setPage(value => value + 1)}><ArrowRight /></button></div></footer>}
    </section>

    {modal && <div className="agent-modal-backdrop"><form className="agent-modal" onSubmit={save}><header><div><span><Bot /></span><div><h2>{modal.mode === 'edit' ? 'Cập nhật Agent' : 'Thiết lập Agent mới'}</h2><p>Kết nối workflow và xác định phạm vi xử lý.</p></div></div><button type="button" onClick={() => setModal(null)}><X /></button></header><div className="agent-modal-body"><div className="agent-type-picker">{AGENT_TYPES.map(type => { const TypeIcon = type.icon; return <button key={type.value} type="button" className={form.api_type === type.value ? `active ${type.value.toLowerCase().replaceAll(' ', '-')}` : ''} onClick={() => setType(type.value)}><TypeIcon /><span><strong>{type.label}</strong><small>{type.description}</small></span></button>; })}</div><div className="agent-form-grid"><label>Tên Agent<input value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} placeholder={isContentAgent(form.api_type) ? form.api_type : 'Ví dụ: Speaking Read Aloud Grader'} required /></label>{form.api_type === 'STT' && <label>Đích nhận dạng<select value={form.stt_target} onChange={event => setForm(value => ({ ...value, stt_target: event.target.value }))}><option value="student_answer">Bài nói học viên</option><option value="question">Audio câu hỏi</option><option value="context">Audio bối cảnh</option></select></label>}<label className={form.api_type === 'Grading' || isContentAgent(form.api_type) ? 'full' : ''}>Mô tả<input value={form.description} onChange={event => setForm(value => ({ ...value, description: event.target.value }))} placeholder="Nhiệm vụ và mục đích của Agent" /></label><label className="full">API endpoint<input value={form.api_endpoint} onChange={event => { setForm(value => ({ ...value, api_endpoint: event.target.value })); setTestResult(null); }} placeholder="https://dify.iigvn.site/v1" required /><small>Nhập base URL; hệ thống tự nối `/workflows/run` khi thực thi.</small></label><label className="full">API key<div className="agent-secret"><input type={showKey ? 'text' : 'password'} value={form.api_key} onChange={event => { setForm(value => ({ ...value, api_key: event.target.value })); setTestResult(null); }} placeholder={modal.mode === 'edit' ? 'Để trống nếu giữ nguyên key hiện tại' : 'app-…'} required={modal.mode === 'create'} /><button type="button" onClick={() => setShowKey(value => !value)}>{showKey ? <EyeOff /> : <Eye />}</button></div></label></div>{!isContentAgent(form.api_type) && <section className="agent-group-picker"><header><div><strong>Nhóm câu hỏi áp dụng</strong><span>{form.target_questions.length} nhóm đã chọn</span></div><div><button type="button" onClick={() => selectSection('Speaking')}>Speaking</button>{form.api_type === 'Grading' && <button type="button" onClick={() => selectSection('Writing')}>Writing</button>}</div></header>{['Speaking', 'Writing'].map(section => (form.api_type === 'Grading' || section === 'Speaking') && <div key={section}><span>{section}</span><div>{GROUPS.filter(group => group.section === section).map(group => <label key={group.key} className={form.target_questions.includes(group.key) ? 'selected' : ''}><input type="checkbox" checked={form.target_questions.includes(group.key)} onChange={() => toggleGroup(group.key)} /><i>{form.target_questions.includes(group.key) && <Check />}</i><span>{group.label}</span></label>)}</div></div>)}</section>}{testResult && <div className={`agent-test-result ${testResult.type}`}>{testResult.type === 'success' ? <CheckCircle2 /> : <X />}<span>{testResult.text}</span></div>}</div><footer><button type="button" className="agent-button test" disabled={testing || !form.api_key || !form.api_endpoint} onClick={testConnection}>{testing ? <RefreshCw className="spin" /> : <Link2 />}{testing ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}</button><div><button type="button" className="agent-button secondary" onClick={() => setModal(null)}>Hủy</button><button className="agent-button primary" disabled={saving}>{saving ? <RefreshCw className="spin" /> : <CheckCircle2 />}{saving ? 'Đang lưu…' : 'Lưu cấu hình'}</button></div></footer></form></div>}
  </div>;
}
