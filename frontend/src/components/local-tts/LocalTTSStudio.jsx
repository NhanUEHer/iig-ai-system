import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ArrowRight, AudioLines, CheckCircle2, Clock3, Download, Eye, Gauge, History, Mic2, Play, Plus, RefreshCw, RotateCcw, Save, ShieldCheck, Sparkles, Trash2, Upload, Users, WandSparkles, X } from 'lucide-react';
import { readSession } from '../../services/authSession';
import {useDialog} from '../feedback/dialogContext';
import './LocalTTSStudio.css';
import './LocalTTSStudioTypography.css';
import './LocalTTSHistory.css';
import './LocalTTSClone.css';

const API = '/api/local-tts';
const STYLES = [
  { value: 'natural', label: 'Tự nhiên' }, { value: 'question', label: 'Câu hỏi' },
  { value: 'excited', label: 'Hào hứng' }, { value: 'thoughtful', label: 'Trầm ngâm' },
  { value: 'serious', label: 'Nghiêm túc' }
];
const mediaUrl = (url, version) => url
  ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version || Date.now())}`
  : url;
const makeLine = (index, voices = []) => ({ id: `${Date.now()}-${index}`, speaker_name: `Speaker ${String.fromCharCode(65 + index % 4)}`, text: '', voice_id: voices[index % Math.max(voices.length, 1)]?.id || (index % 2 ? 'en-US-AvaNeural' : 'en-US-AndrewNeural'), style: 'natural', rate: '', pitch: '', pause_after_ms: 450 });

export default function LocalTTSStudio() {
  const {confirm:confirmDialog}=useDialog();
  const currentUser = readSession();
  const canManage = currentUser?.permissions?.includes('audio.manage');
  const [mode, setMode] = useState('dialogue');
  const [title, setTitle] = useState('');
  const [voices, setVoices] = useState([]);
  const [engine, setEngine] = useState(null);
  const [cloneEngine, setCloneEngine] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [lines, setLines] = useState([makeLine(0), makeLine(1)]);
  const [passage, setPassage] = useState('');
  const [passageVoice, setPassageVoice] = useState('en-US-AndrewNeural');
  const [rawDialogue, setRawDialogue] = useState('');
  const [settings, setSettings] = useState({ rate: 0, pitch: 0, pause: 500 });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyDetail, setHistoryDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneForm, setCloneForm] = useState({ name: '', language: 'EN', testText: 'Hello, this is a preview of my cloned voice.', audioBase64: '', fileName: '', consent: false, draftId: '', previewUrl: '' });
  const [cloneBusy, setCloneBusy] = useState(false);

  const load = async (nextHistoryPage = historyPage) => {
    try {
      const [voiceRes, engineRes, historyRes] = await Promise.all([axios.get(`${API}/voices`), axios.get(`${API}/engine`), axios.get(`${API}/history`, { params: { page: nextHistoryPage, limit: 10 } })]);
      const available = voiceRes.data.voices || [];
      setVoices(available); setEngine(engineRes.data.engine); setCloneEngine(engineRes.data.voiceCloneEngine); setHistory(historyRes.data.history || []); setHistoryTotal(historyRes.data.pagination?.total ?? historyRes.data.history?.length ?? 0); setHistoryPages(historyRes.data.pagination?.totalPages || 1);
    } catch (loadError) { setError(loadError.response?.data?.error || 'Không thể tải Audio Studio.'); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (historyPage > 1) load(historyPage); }, [historyPage]);
  const charCount = useMemo(() => mode === 'passage' ? passage.length : lines.reduce((sum, line) => sum + line.text.length, 0), [mode, passage, lines]);
  const estimate = Math.max(1, Math.ceil(charCount / 14));
  const updateLine = (id, key, value) => setLines(current => current.map(line => line.id === id ? { ...line, [key]: value } : line));
  const addLine = () => setLines(current => [...current, makeLine(current.length, voices)]);
  const removeLine = id => setLines(current => current.length > 1 ? current.filter(line => line.id !== id) : current);
  const parseDialogue = () => {
    const parsed = rawDialogue.split('\n').map(value => value.trim()).filter(Boolean).map((value, index) => {
      const match = value.match(/^([^:–-]+)[:–-]\s*(.+)$/);
      return { ...makeLine(index, voices), speaker_name: match?.[1]?.trim() || `Speaker ${String.fromCharCode(65 + index % 4)}`, text: match?.[2]?.trim() || value };
    });
    if (parsed.length) setLines(parsed);
  };
  const generate = async () => {
    const script = mode === 'passage'
      ? [{ speaker_name: 'Narrator', text: passage.trim(), voice_id: passageVoice, style: 'natural' }]
      : lines.map(({ speaker_name, text, voice_id, style, rate, pitch, pause_after_ms }) => ({ speaker_name, text: text.trim(), voice_id, style, rate, pitch, pause_after_ms }));
    if (!script.length || script.some(line => !line.text)) return setError('Vui lòng nhập đầy đủ nội dung trước khi tạo audio.');
    setGenerating(true); setError(''); setResult(null);
    try {
      const response = await axios.post(`${API}/generate`, { title: title.trim() || (mode === 'passage' ? 'Đoạn văn' : 'Hội thoại'), content_type: mode, script, global_rate: `${settings.rate >= 0 ? '+' : ''}${settings.rate}%`, global_pitch: `${settings.pitch >= 0 ? '+' : ''}${settings.pitch}Hz`, pause_between_ms: settings.pause });
      setResult(mediaUrl(response.data.audio_url)); await load();
    } catch (generateError) { setError(generateError.response?.data?.error || 'Không thể tổng hợp audio local.'); }
    finally { setGenerating(false); }
  };
  const deleteHistory = async id => { if (!await confirmDialog({title:'Xóa audio?',message:'Audio này sẽ bị xóa khỏi lịch sử.',confirmText:'Xóa audio'})) return; await axios.delete(`${API}/history/${id}`); await load(); };
  const viewHistory = async id => {
    setDetailLoading(true);
    try { const response = await axios.get(`${API}/history/${id}`); setHistoryDetail(response.data.data); }
    catch (detailError) { setError(detailError.response?.data?.error || 'Không thể tải cấu hình audio.'); }
    finally { setDetailLoading(false); }
  };
  const restoreHistory = item => {
    const script = Array.isArray(item.raw_script) ? item.raw_script : [];
    setTitle(`${item.title} · Bản sao`); setMode(item.content_type);
    if (item.content_type === 'passage') { setPassage(script[0]?.text || ''); setPassageVoice(script[0]?.voice_id || 'en-US-AndrewNeural'); }
    else setLines(script.map((line, index) => ({ ...makeLine(index, voices), ...line })));
    const saved = item.settings || {};
    setSettings({ rate: Number.parseFloat(saved.global_rate) || 0, pitch: Number.parseFloat(saved.global_pitch) || 0, pause: Number(saved.pause_between_ms) || 500 });
    setResult(mediaUrl(item.audio_path, item.updated_at || item.created_at)); setHistoryDetail(null); setShowHistory(false);
  };
  const chooseCloneFile = file => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return setError('File giọng mẫu không được vượt quá 15 MB.');
    const reader = new FileReader();
    reader.onload = () => setCloneForm(current => ({ ...current, audioBase64: reader.result, fileName: file.name, draftId: '', previewUrl: '' }));
    reader.readAsDataURL(file);
  };
  const previewClone = async () => {
    if (!cloneForm.audioBase64 || !cloneForm.testText.trim() || !cloneForm.consent) return setError('Chọn file, nhập nội dung và xác nhận quyền sử dụng giọng nói.');
    setCloneBusy(true); setError('');
    try { const response = await axios.post(`${API}/preview-cloned-voice`, { audio_base64: cloneForm.audioBase64, test_text: cloneForm.testText, language: cloneForm.language, consent: cloneForm.consent }); setCloneForm(current => ({ ...current, draftId: response.data.draftId, previewUrl: mediaUrl(response.data.previewUrl) })); }
    catch (cloneError) { setError(cloneError.response?.data?.error || 'Không thể tạo bản nghe thử.'); }
    finally { setCloneBusy(false); }
  };
  const saveClone = async () => {
    if (!cloneForm.name.trim() || !cloneForm.draftId) return setError('Hãy tạo bản nghe thử thành công và nhập tên giọng.');
    setCloneBusy(true);
    try { await axios.post(`${API}/clone-voice`, { voice_name: cloneForm.name, draft_id: cloneForm.draftId }); setCloneOpen(false); setCloneForm({ name: '', language: 'EN', testText: 'Hello, this is a preview of my cloned voice.', audioBase64: '', fileName: '', consent: false, draftId: '', previewUrl: '' }); await load(); }
    catch (cloneError) { setError(cloneError.response?.data?.error || 'Không thể lưu giọng mới.'); }
    finally { setCloneBusy(false); }
  };

  return <div className="tts-studio-page">
    <header className="tts-header"><div><span className="tts-eyebrow">CONTENT TOOLS · LOCAL VOICE</span><h1>Audio Studio</h1><p>Tạo đoạn đọc và hội thoại nhiều nhân vật hoàn toàn trên máy chủ nội bộ.</p></div><div className="tts-header-actions">{canManage && cloneEngine?.ready && <button className="btn-secondary" onClick={() => setCloneOpen(true)}><Mic2 />Sao chép giọng</button>}<div className={`tts-engine ${engine?.ready ? 'ready' : 'error'}`}><span><Gauge /></span><div><small>Local engine</small><strong>{engine?.name || 'Đang kiểm tra…'}</strong></div><em>{engine?.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</em></div></div></header>
    <section className="tts-summary"><article><AudioLines /><div><small>Chế độ</small><strong>{mode === 'dialogue' ? 'Hội thoại' : 'Đoạn văn'}</strong></div></article><article><Users /><div><small>Nhân vật</small><strong>{mode === 'dialogue' ? new Set(lines.map(line => line.speaker_name)).size : 1}</strong></div></article><article><Clock3 /><div><small>Ước tính</small><strong>~{estimate} giây</strong></div></article><article><History /><div><small>Audio đã tạo</small><strong>{historyTotal}</strong></div></article></section>
    <div className="tts-workspace">
      <main className="tts-editor">
        <div className="tts-editor-toolbar"><div className="tts-mode"><button className={mode === 'dialogue' ? 'active' : ''} onClick={() => setMode('dialogue')}><Users />Hội thoại</button><button className={mode === 'passage' ? 'active' : ''} onClick={() => setMode('passage')}><Mic2 />Đoạn văn</button></div><button className="btn-secondary" onClick={() => setShowHistory(value => !value)}><History />Lịch sử</button></div>
        <label className="tts-title-field"><span>Tiêu đề audio</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Ví dụ: TOEIC Part 3 · Conversation 01" /></label>
        {mode === 'dialogue' ? <>
          <section className="tts-import"><div><strong>Dán nhanh kịch bản</strong><small>Định dạng: Speaker A: Nội dung câu thoại</small></div><textarea value={rawDialogue} onChange={event => setRawDialogue(event.target.value)} placeholder={'Receptionist: Good morning. How may I help you?\nGuest: I would like to confirm my reservation.'} /><button onClick={parseDialogue} disabled={!rawDialogue.trim()}><WandSparkles />Tách hội thoại</button></section>
          <div className="tts-lines-head"><div><strong>Kịch bản hội thoại</strong><small>{lines.length} lượt thoại · {charCount} ký tự</small></div><button onClick={addLine}><Plus />Thêm lượt thoại</button></div>
          <div className="tts-lines">{lines.map((line, index) => <article className="tts-line" key={line.id}><span className="tts-line-number">{index + 1}</span><div className="tts-line-main"><div className="tts-line-config"><input aria-label={`Tên nhân vật ${index + 1}`} value={line.speaker_name} onChange={event => updateLine(line.id, 'speaker_name', event.target.value)} /><select aria-label={`Giọng đọc ${index + 1}`} value={line.voice_id} onChange={event => updateLine(line.id, 'voice_id', event.target.value)}>{voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}</select><select aria-label={`Biểu cảm ${index + 1}`} value={line.style} onChange={event => updateLine(line.id, 'style', event.target.value)}>{STYLES.map(style => <option key={style.value} value={style.value}>{style.label}</option>)}</select><button title="Xóa lượt thoại" onClick={() => removeLine(line.id)}><Trash2 /></button></div><textarea value={line.text} onChange={event => updateLine(line.id, 'text', event.target.value)} placeholder="Nhập nội dung câu thoại…" /><div className="tts-line-fine"><label>Tốc độ<select value={line.rate} onChange={event => updateLine(line.id, 'rate', event.target.value)}><option value="">Chung</option><option value="-10%">-10%</option><option value="+0%">0%</option><option value="+10%">+10%</option></select></label><label>Cao độ<select value={line.pitch} onChange={event => updateLine(line.id, 'pitch', event.target.value)}><option value="">Chung</option><option value="-20Hz">Trầm</option><option value="+0Hz">Chuẩn</option><option value="+20Hz">Cao</option></select></label><label>Nghỉ sau<input type="number" min="0" max="3000" value={line.pause_after_ms} onChange={event => updateLine(line.id, 'pause_after_ms', Number(event.target.value))} /> ms</label></div></div></article>)}</div>
        </> : <section className="tts-passage"><label><span>Giọng đọc</span><select value={passageVoice} onChange={event => setPassageVoice(event.target.value)}>{voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}</select></label><textarea value={passage} onChange={event => setPassage(event.target.value)} placeholder="Nhập đoạn văn cần chuyển thành giọng nói…" /><small>{passage.length} ký tự</small></section>}
      </main>
      <aside className="tts-sidebar">
        <section><div className="tts-panel-title"><Sparkles /><div><strong>Nhịp điệu chung</strong><small>Áp dụng cho toàn bộ audio</small></div></div><label className="tts-slider"><span>Tốc độ <em>{settings.rate > 0 ? '+' : ''}{settings.rate}%</em></span><input type="range" min="-25" max="25" step="5" value={settings.rate} onChange={event => setSettings({...settings, rate:Number(event.target.value)})} /></label><label className="tts-slider"><span>Cao độ <em>{settings.pitch > 0 ? '+' : ''}{settings.pitch}Hz</em></span><input type="range" min="-30" max="30" step="10" value={settings.pitch} onChange={event => setSettings({...settings, pitch:Number(event.target.value)})} /></label><label className="tts-slider"><span>Khoảng nghỉ <em>{settings.pause}ms</em></span><input type="range" min="100" max="1500" step="50" value={settings.pause} onChange={event => setSettings({...settings, pause:Number(event.target.value)})} /></label></section>
        <section className="tts-generation"><div className="tts-panel-title"><CheckCircle2 /><div><strong>Xuất bản audio</strong><small>{charCount} ký tự · khoảng {estimate} giây</small></div></div>{error && <p className="tts-error">{error}</p>}{result && <div className="tts-result"><audio controls src={result} /><a href={result} download><Download />Tải MP3</a></div>}<button className="tts-generate" disabled={generating || !canManage || !engine?.ready} onClick={generate}>{generating ? <><RefreshCw className="spin" />Đang tổng hợp local…</> : <><Play />Tạo audio</>}</button>{!canManage && <small className="tts-permission-note">Vai trò của bạn chỉ có quyền xem Audio Studio.</small>}</section>
        {showHistory && <section className="tts-history"><div className="tts-panel-title"><History /><div><strong>Lịch sử gần đây</strong><small>{historyTotal} audio · hiển thị {history.length}</small></div></div>{history.map(item => <article key={item.id}><button title="Phát audio" onClick={() => setResult(mediaUrl(item.audio_path, item.updated_at || item.created_at))}><Play /></button><div><strong>{item.title}</strong><small>{item.segment_count || 0} đoạn · {item.engine || 'legacy'} · {new Date(item.created_at).toLocaleString('vi-VN')}</small></div><button title="Xem cấu hình" onClick={() => viewHistory(item.id)}><Eye /></button>{canManage && <button className="danger" title="Xóa" onClick={() => deleteHistory(item.id)}><Trash2 /></button>}</article>)}{historyTotal > 0 && <div className="tts-history-pagination"><span>Trang {historyPage}/{historyPages}</span><button disabled={historyPage <= 1} onClick={() => setHistoryPage(value => value - 1)}><ArrowLeft /></button><button disabled={historyPage >= historyPages} onClick={() => setHistoryPage(value => value + 1)}><ArrowRight /></button></div>}</section>}
      </aside>
    </div>
    {(historyDetail || detailLoading) && <div className="tts-history-modal-backdrop"><section className="tts-history-modal"><header><div><span>LỊCH SỬ AUDIO</span><h2>{historyDetail?.title || 'Đang tải cấu hình…'}</h2></div><button onClick={() => setHistoryDetail(null)}><X /></button></header>{detailLoading ? <div className="tts-history-loading"><RefreshCw className="spin" /></div> : <><div className="tts-history-facts"><span><small>Loại nội dung</small><strong>{historyDetail.content_type === 'dialogue' ? 'Hội thoại' : 'Đoạn văn'}</strong></span><span><small>Engine</small><strong>{historyDetail.engine || 'legacy'}</strong></span><span><small>Thời lượng</small><strong>{historyDetail.duration_seconds ? `${Number(historyDetail.duration_seconds).toFixed(1)} giây` : 'Chưa xác định'}</strong></span><span><small>Dung lượng</small><strong>{historyDetail.file_size_bytes ? `${(historyDetail.file_size_bytes / 1024).toFixed(0)} KB` : 'Chưa xác định'}</strong></span></div><audio controls src={mediaUrl(historyDetail.audio_path, historyDetail.updated_at || historyDetail.created_at)} /><div className="tts-history-settings"><strong>Cấu hình chung</strong><span>Tốc độ: {historyDetail.settings?.global_rate || 'Mặc định'}</span><span>Cao độ: {historyDetail.settings?.global_pitch || 'Mặc định'}</span><span>Khoảng nghỉ: {historyDetail.settings?.pause_between_ms || 500}ms</span></div><div className="tts-history-script"><div><strong>Kịch bản đã thiết lập</strong><small>{historyDetail.raw_script?.length || 0} đoạn</small></div>{historyDetail.raw_script?.map((line, index) => <article key={index}><span>{index + 1}</span><div><header><strong>{line.speaker_name || 'Narrator'}</strong><em>{voices.find(voice => voice.id === line.voice_id)?.name || line.voice_id}</em></header><p>{line.text}</p><footer><span>Biểu cảm: {STYLES.find(style => style.value === line.style)?.label || 'Tự nhiên'}</span><span>Tốc độ: {line.rate || 'Chung'}</span><span>Cao độ: {line.pitch || 'Chung'}</span><span>Nghỉ: {line.pause_after_ms ?? historyDetail.settings?.pause_between_ms ?? 500}ms</span></footer></div></article>)}</div><footer className="tts-history-modal-actions"><a href={mediaUrl(historyDetail.audio_path, historyDetail.updated_at || historyDetail.created_at)} download><Download />Tải MP3</a>{canManage && <button onClick={() => restoreHistory(historyDetail)}><RotateCcw />Nạp lại cấu hình</button>}</footer></>}</section></div>}
    {cloneOpen && <div className="tts-clone-backdrop"><section className="tts-clone-modal"><header><div><span>LOCAL VOICE CLONING</span><h2>Sao chép giọng nói</h2><p>Upload giọng mẫu, nghe thử kết quả rồi mới lưu vào thư viện.</p></div><button onClick={() => setCloneOpen(false)}><X /></button></header><div className={`tts-clone-engine ${cloneEngine?.ready ? 'ready' : 'warning'}`}><ShieldCheck /><div><strong>{cloneEngine?.name || 'OpenVoice V2'}</strong><small>{cloneEngine?.ready ? 'Engine local đã sẵn sàng.' : 'Engine chưa được cài trên server. Cần Python 3.9 và checkpoints OpenVoice V2.'}</small></div></div><label className="tts-clone-upload"><input type="file" accept="audio/*" onChange={event => chooseCloneFile(event.target.files?.[0])} /><Upload /><strong>{cloneForm.fileName || 'Chọn file audio giọng mẫu'}</strong><small>3–30 giây · một người nói · ít tạp âm · tối đa 15 MB</small></label><div className="tts-clone-grid"><label>Ngôn ngữ<select value={cloneForm.language} onChange={event => setCloneForm({...cloneForm,language:event.target.value,draftId:'',previewUrl:''})}><option value="EN">English</option><option value="ES">Spanish</option><option value="FR">French</option><option value="ZH">Chinese</option><option value="JP">Japanese</option><option value="KR">Korean</option></select></label><label>Tên giọng<input value={cloneForm.name} onChange={event => setCloneForm({...cloneForm,name:event.target.value})} placeholder="Ví dụ: Giọng Anh Minh" /></label></div><label className="tts-clone-text">Nội dung nghe thử<textarea value={cloneForm.testText} onChange={event => setCloneForm({...cloneForm,testText:event.target.value,draftId:'',previewUrl:''})} /></label><label className="tts-clone-consent"><input type="checkbox" checked={cloneForm.consent} onChange={event => setCloneForm({...cloneForm,consent:event.target.checked})} /><span>Tôi xác nhận có quyền sử dụng và sao chép giọng nói trong file này.</span></label>{cloneForm.previewUrl && <div className="tts-clone-preview"><strong>Bản nghe thử</strong><audio controls src={cloneForm.previewUrl} /></div>}{error && <p className="tts-error">{error}</p>}<footer><button className="btn-secondary" disabled={cloneBusy || !cloneEngine?.ready} onClick={previewClone}>{cloneBusy ? <RefreshCw className="spin" /> : <Play />}Tạo bản nghe thử</button><button className="btn-primary" disabled={cloneBusy || !cloneForm.draftId || !cloneForm.name.trim()} onClick={saveClone}><Save />Lưu giọng mới</button></footer></section></div>}
  </div>;
}
