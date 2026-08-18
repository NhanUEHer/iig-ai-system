import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpenText, Clock3, Download, Eye, LibraryBig, Plus, RefreshCw, Save, Search, Sparkles, Trash2, WandSparkles, X } from 'lucide-react';
import { exportKeyVocabHistory, exportKeyVocabPreview, generateKeyVocab, getKeyVocabDetail, getKeyVocabHistory, saveKeyVocab } from '../../../services/keyVocabService';
import './KeyVocabPage.css';
import './KeyVocabPolish.css';
import './LearningMaterialPage.css';

const TYPES = ['Noun','Verb','Adjective','Adverb','Noun Phrase','Phrasal Verb','Adjective Phrase','Idiom','Verb Phrase','Preposition','Prepositional Phrase','Prefix','Suffix','Conjunction','Interjection','Phrase'];
const LEVELS = [450, 500, 650, 700, 800];
const MODES = [
  { value: 'balanced', label: 'Cân bằng', description: 'Kết hợp từ đơn và cụm từ trọng tâm' },
  { value: 'phrase_focused', label: 'Ưu tiên cụm từ', description: 'Tập trung collocation và cụm nghiệp vụ' },
  { value: 'single_word_focused', label: 'Ưu tiên từ đơn', description: 'Tập trung danh từ, động từ và tính từ' }
];
const MODE_LABELS = Object.fromEntries(MODES.map(item => [item.value, item.label]));
const blankItem = () => ({ t: '', p: 'Noun', i: '', m: '' });
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const highlightPassage = (passage, vocabularies = []) => {
  const patterns = [...new Set(vocabularies.map(item => String(item.t || '').trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(term => `${term.split(/[\s-]+/).map(escapePattern).join('[\\s-]+')}(?:s|es)?`);
  if (!patterns.length) return passage;
  const matcher = new RegExp(`\\b(${patterns.join('|')})\\b`, 'gi');
  return String(passage || '').split(matcher).map((part, index) => index % 2
    ? <mark className="key-vocab-inline-highlight" key={`${part}-${index}`}>{part}</mark>
    : part);
};

export default function KeyVocabPage({ showMsg, currentUser }) {
  const [tab, setTab] = useState('create');
  const [passage, setPassage] = useState('');
  const [targetScore, setTargetScore] = useState(500);
  const [selectionMode, setSelectionMode] = useState('balanced');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modal, setModal] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, total: 0, totalPages: 1 });
  const canGenerate = currentUser?.permissions?.some(value => ['key_vocab.generate','key_vocab.manage'].includes(value));
  const canSave = currentUser?.permissions?.includes('key_vocab.manage');

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const result = await getKeyVocabHistory({ page, limit: 10, search: search.trim() || undefined });
      setHistory(result.data || []); setMeta(result.meta);
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể tải lịch sử.', 'error'); }
    finally { setLoadingHistory(false); }
  }, [page, search, showMsg]);
  useEffect(() => { if (tab !== 'history') return undefined; const timer = setTimeout(loadHistory, 250); return () => clearTimeout(timer); }, [tab, loadHistory]);

  const generate = async () => {
    setGenerating(true);
    try { setModal({ mode: 'preview', ...(await generateKeyVocab({ passage, targetScore, selectionMode })) }); }
    catch (error) { showMsg?.(error.response?.data?.error || 'Không thể tạo Key Vocab.', 'error'); }
    finally { setGenerating(false); }
  };
  const updateItem = (index, field, value) => setModal(current => ({ ...current, vocabularies: current.vocabularies.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  const removeItem = index => setModal(current => ({ ...current, vocabularies: current.vocabularies.filter((_, itemIndex) => itemIndex !== index) }));
  const save = async () => { setSaving(true); try { await saveKeyVocab(modal); showMsg?.('Đã lưu Key Vocab vào lịch sử.', 'success'); setModal(null); setPassage(''); setTab('history'); setPage(1); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu Key Vocab.', 'error'); } finally { setSaving(false); } };
  const exportExcel = async () => { setExporting(true); try { if (modal.mode === 'history') await exportKeyVocabHistory(modal.id); else await exportKeyVocabPreview(modal.vocabularies); showMsg?.('Đã xuất file theo template hệ thống.', 'success'); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xuất dữ liệu.', 'error'); } finally { setExporting(false); } };
  const view = async id => { try { const detail = await getKeyVocabDetail(id); setModal({ mode: 'history', ...detail, targetScore: detail.target_score, selectionMode: detail.selection_mode }); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể mở lịch sử.', 'error'); } };
  const wordCount = passage.trim() ? passage.trim().split(/\s+/).length : 0;

  return <div className="key-vocab-page learning-material-page">
    <header className="key-vocab-header material-header"><div><span>CONTENT TOOLS · AI ACADEMY</span><h1>Tạo học liệu</h1><p>Biến nội dung nguồn thành học liệu TOEIC có cấu trúc bằng AI Academy.</p></div><div className="key-vocab-tabs"><button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}><Sparkles />Tạo mới</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><Clock3 />Lịch sử</button></div></header>

    {tab === 'create' ? <div className="material-create">
      <section className="material-tools"><button className="material-tool active"><span><BookOpenText /></span><div><strong>Gen Key Vocab</strong><small>Trích xuất từ và cụm từ trọng tâm theo level TOEIC.</small></div><em>Đang chọn</em></button><button className="material-tool" disabled><span><LibraryBig /></span><div><strong>Gen Dictionary</strong><small>Tạo dữ liệu từ điển mở rộng cho bài học.</small></div><em>Sắp có</em></button></section>
      <section className="material-settings"><div className="material-settings-title"><WandSparkles /><div><strong>Thiết lập Key Vocab</strong><small>AI sử dụng các thiết lập này để chọn từ phù hợp.</small></div></div><label><span>Level TOEIC</span><select value={targetScore} onChange={event => setTargetScore(Number(event.target.value))}>{LEVELS.map(level => <option key={level} value={level}>TOEIC {level}+</option>)}</select></label><label><span>Chế độ chọn từ</span><select value={selectionMode} onChange={event => setSelectionMode(event.target.value)}>{MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select><small>{MODES.find(mode => mode.value === selectionMode)?.description}</small></label></section>
      <section className="key-vocab-workspace material-workspace"><div className="key-vocab-editor material-editor"><header><div><BookOpenText /><span><strong>Nội dung nguồn</strong><small>AI chỉ chọn từ hoặc cụm từ xuất hiện trong nội dung này.</small></span></div><em>{wordCount} từ · {passage.length.toLocaleString('vi-VN')} ký tự</em></header><textarea value={passage} onChange={event => setPassage(event.target.value)} maxLength={20000} placeholder="Dán đoạn văn TOEIC, email công việc, script, thông báo hoặc nội dung bài học vào đây…" /><footer><span>Tối thiểu 80 ký tự</span><button disabled={!canGenerate || passage.trim().length < 80 || generating} onClick={generate}><WandSparkles />Gen Key Vocab với AI Academy</button></footer></div><aside><span><Sparkles /></span><h2>Quy trình tạo học liệu</h2><ol><li><b>01</b><div><strong>Thiết lập mục tiêu</strong><small>Chọn level và cách ưu tiên từ/cụm từ.</small></div></li><li><b>02</b><div><strong>AI phân tích</strong><small>Đọc nội dung và tạo bản preview chưa lưu.</small></div></li><li><b>03</b><div><strong>Rà soát & xuất bản</strong><small>Chỉnh sửa, xuất Excel hoặc lưu vào lịch sử.</small></div></li></ol></aside></section>
    </div> : <section className="key-vocab-history"><header><div><h2>Lịch sử Key Vocab</h2><p>{meta.total || 0} kết quả đã lưu</p></div><label><Search /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm theo nội dung nguồn…" /></label></header>{loadingHistory ? <div className="key-vocab-empty"><RefreshCw className="spin" />Đang tải lịch sử…</div> : !history.length ? <div className="key-vocab-empty"><Clock3 />Chưa có lịch sử phù hợp.</div> : <div className="key-vocab-table-wrap"><table><thead><tr><th>Nội dung nguồn</th><th>Thiết lập</th><th>Số từ</th><th>Người tạo</th><th>Thời gian</th><th /></tr></thead><tbody>{history.map(item => <tr key={item.id}><td><strong>{item.passage}</strong></td><td><div className="material-history-settings"><span>{item.target_score}+</span><span>{MODE_LABELS[item.selection_mode] || item.selection_mode}</span></div></td><td><span>{item.item_count} từ</span></td><td>{item.created_by_name}</td><td>{new Date(item.created_at).toLocaleString('vi-VN')}</td><td><button onClick={() => view(item.id)}><Eye />Xem</button></td></tr>)}</tbody></table></div>}<footer><span>Trang {meta.page}/{meta.totalPages}</span><div><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ArrowLeft /></button><button disabled={page >= meta.totalPages} onClick={() => setPage(value => value + 1)}><ArrowRight /></button></div></footer></section>}

    {generating && <div className="material-ai-loading" role="status"><div className="ai-orbit"><span /><WandSparkles /></div><strong>AI Academy đang tạo Key Vocab</strong><p>Đang phân tích nội dung theo level {targetScore}+ và chế độ {MODE_LABELS[selectionMode].toLowerCase()}…</p><div className="ai-progress"><i /></div></div>}

    {modal && <div className={`key-vocab-modal-backdrop ${modal.mode}`}><div className={`key-vocab-modal ${modal.mode}`}><header><div><span><Sparkles /></span><div><h2>{modal.mode === 'history' ? 'Chi tiết Key Vocab' : 'Preview Key Vocab'}</h2><p>{modal.vocabularies.length} mục · TOEIC {modal.targetScore || modal.target_score || 500}+ · {MODE_LABELS[modal.selectionMode || modal.selection_mode] || 'Cân bằng'}{modal.mode === 'history' ? ` · Lưu bởi ${modal.created_by_name || 'người dùng hệ thống'}` : ' · Chưa lưu'}</p></div></div><button onClick={() => setModal(null)}><X /></button></header><div className="key-vocab-modal-body"><section className="key-vocab-source"><div><label>Nội dung nguồn <span className="key-vocab-highlight-legend"><i />Key vocab</span></label>{modal.mode === 'history' && <time>{new Date(modal.created_at).toLocaleString('vi-VN')}</time>}</div><p>{highlightPassage(modal.passage, modal.vocabularies)}</p></section><section className="key-vocab-list"><header><div><strong>Danh sách từ vựng</strong><span>{modal.vocabularies.length} mục đã chọn</span></div>{modal.mode !== 'history' && <button onClick={() => setModal(current => ({ ...current, vocabularies: [...current.vocabularies, blankItem()] }))}><Plus />Thêm từ</button>}</header>{modal.mode === 'history' ? <><div className="key-vocab-read-columns"><span>Từ / cụm từ & loại từ</span><span>Phát âm</span><span>Nghĩa tiếng Việt</span></div><div className="key-vocab-read-grid">{modal.vocabularies.map((item, index) => <article className="key-vocab-read-card" key={`${item.t}-${index}`}><div className="key-vocab-read-index">{String(index + 1).padStart(2, '0')}</div><div className="key-vocab-read-main"><div><h3>{item.t}</h3><span>{item.p}</span></div><code>{item.i}</code><p>{item.m}</p></div></article>)}</div></> : modal.vocabularies.map((item, index) => <article className="key-vocab-edit-row" key={index}><b>{String(index + 1).padStart(2, '0')}</b><label>Từ / cụm từ<input value={item.t} onChange={event => updateItem(index, 't', event.target.value)} /></label><label>Loại từ<select value={item.p} onChange={event => updateItem(index, 'p', event.target.value)}>{TYPES.map(type => <option key={type}>{type}</option>)}</select></label><label>Phát âm<input value={item.i} onChange={event => updateItem(index, 'i', event.target.value)} /></label><label>Nghĩa tiếng Việt<input value={item.m} onChange={event => updateItem(index, 'm', event.target.value)} /></label><button className="remove" onClick={() => removeItem(index)} title="Xóa từ"><Trash2 /></button></article>)}</section></div><footer><button className="secondary" onClick={() => setModal(null)}>{modal.mode === 'history' ? 'Đóng' : 'Hủy'}</button><button className="export" disabled={exporting || !modal.vocabularies.length} onClick={exportExcel}>{exporting ? <RefreshCw className="spin" /> : <Download />}{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button>{modal.mode !== 'history' && canSave && <button className="primary" disabled={saving || !modal.vocabularies.length} onClick={save}>{saving ? <RefreshCw className="spin" /> : <Save />}{saving ? 'Đang lưu…' : 'Xác nhận & lưu'}</button>}</footer></div></div>}
  </div>;
}
