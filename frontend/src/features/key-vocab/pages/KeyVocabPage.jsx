import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpenText, CheckCircle2, ChevronDown, Clock3, Download, Eye, LibraryBig, Plus, RefreshCw, Save, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { exportKeyVocabDocumentHistory, exportKeyVocabDocumentPreview, exportKeyVocabHistory, exportKeyVocabPreview, generateKeyVocab, getKeyVocabDetail, saveKeyVocab } from '../../../services/keyVocabService';
import { exportDictionary, exportDictionaryDocument, extractDictionaryItems, generateDictionaryCandidates, getDictionaryDetail, saveDictionaryCandidates } from '../../../services/dictionaryService';
import { Button, Checkbox, Drawer, FormField, IconButton, Input, PageFrame, PageHeader, Select, Surface, Tabs, Textarea } from '../../../design-system-v2';
import './KeyVocabPage.css';
import './KeyVocabPolish.css';
import './LearningMaterialPage.css';
import './KeyVocabDesignSystem.css';
import LearningMaterialHistory from './LearningMaterialHistory';
import { useDialog } from '../../../components/feedback/dialogContext';

const TYPES = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Noun Phrase', 'Phrasal Verb', 'Adjective Phrase', 'Idiom', 'Verb Phrase', 'Preposition', 'Prepositional Phrase', 'Prefix', 'Suffix', 'Conjunction', 'Interjection', 'Phrase'];
const LEVELS = [450, 500, 650, 700, 800];
const MODES = [{ value: 'balanced', label: 'Cân bằng' }, { value: 'phrase_focused', label: 'Ưu tiên cụm từ' }, { value: 'single_word_focused', label: 'Ưu tiên từ đơn' }];
const MODE_LABELS = Object.fromEntries(MODES.map(item => [item.value, item.label]));
const blankVocab = () => ({ o: '', t: '', p: 'Noun', i: '', m: '' });
const dictionaryText = item => String(typeof item === 'string' ? item : item?.text || item?.originalChunk || '').trim();
const dictionarySentence = item => String(typeof item === 'string' ? '' : item?.sentenceText || '').trim();
const sentenceKey = value => String(value || '__legacy__').trim().toLowerCase();
const normalizeTerm = value => String(value || '').trim().toLocaleLowerCase('en-US');
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keyVocabAsDictionaryCandidate = (item, passage = '') => ({
  status: 'completed',
  detailSource: 'key-vocab',
  originalChunk: item?.o || item?.t || '',
  canonical: item?.t || item?.o || '',
  partOfSpeech: item?.p || '',
  ipa: item?.i || '',
  meaningVi: item?.m || '',
  originalSentence: passage,
});
const groupDictionaryItems = items => {
  const groups = new Map();
  items.forEach((item, index) => {
    const sentence = dictionarySentence(item);
    const key = sentenceKey(sentence);
    if (!groups.has(key)) groups.set(key, { key, sentence, items: [] });
    groups.get(key).items.push({ item, index });
  });
  return [...groups.values()];
};

export default function KeyVocabPage({ showMsg, currentUser }) {
  const { confirm: confirmDialog } = useDialog();
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = currentUser?.permissions || [];
  const canGenerateKeyVocab = permissions.some(value => ['key_vocab.generate', 'key_vocab.manage'].includes(value));
  const canSaveKeyVocab = permissions.includes('key_vocab.manage');
  const canGenerateDictionary = permissions.some(value => ['dictionary.generate', 'dictionary.manage'].includes(value));
  const canSaveDictionary = permissions.includes('dictionary.manage');
  const [pageMode, setPageMode] = useState('create');
  const [passage, setPassage] = useState(() => String(location.state?.passage || ''));
  const [selectedOutputs, setSelectedOutputs] = useState(() => canGenerateKeyVocab ? ['key-vocab'] : canGenerateDictionary ? ['dictionary'] : []);
  const [targetScore, setTargetScore] = useState(500);
  const [selectionMode, setSelectionMode] = useState('balanced');
  const [generating, setGenerating] = useState(false);
  const [resultTab, setResultTab] = useState('key-vocab');
  const [keyVocabResult, setKeyVocabResult] = useState(null);
  const [dictionaryDraft, setDictionaryDraft] = useState(null);
  const [dictionaryWorkspace, setDictionaryWorkspace] = useState(null);
  const [errors, setErrors] = useState({});
  const [savingKeyVocab, setSavingKeyVocab] = useState(false);
  const [savingDictionary, setSavingDictionary] = useState(false);
  const [saved, setSaved] = useState({});
  const [exporting, setExporting] = useState('');
  const [viewingHistory, setViewingHistory] = useState(false);
  const [sourceSelection, setSourceSelection] = useState(null);
  const hasResults = Boolean(keyVocabResult || dictionaryDraft);
  const trimmedLength = passage.trim().length;
  const wordCount = trimmedLength ? passage.trim().split(/\s+/).length : 0;
  const outputTabs = useMemo(() => [
    keyVocabResult && { value: 'key-vocab', label: 'Key Vocab', count: keyVocabResult.vocabularies?.length || 0 },
    dictionaryDraft && { value: 'dictionary', label: 'Dictionary', count: dictionaryDraft.items?.length || 0 },
  ].filter(Boolean), [dictionaryDraft, keyVocabResult]);
  const dictionaryRunning = dictionaryWorkspace?.candidates?.some(candidate => ['queued', 'generating'].includes(candidate.status));

  useEffect(() => {
    if (!dictionaryWorkspace?.id || !dictionaryRunning) return undefined;
    const timer = setInterval(async () => {
      try { setDictionaryWorkspace(await getDictionaryDetail(dictionaryWorkspace.id)); } catch { /* Keep the last visible state during polling errors. */ }
    }, 1200);
    return () => clearInterval(timer);
  }, [dictionaryRunning, dictionaryWorkspace?.id]);

  const toggleOutput = value => setSelectedOutputs(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  const generateMaterials = async () => {
    if (!selectedOutputs.length) return;
    setGenerating(true); setErrors({}); setSaved({});
    const requests = selectedOutputs.map(type => type === 'key-vocab' ? generateKeyVocab({ passage, targetScore, selectionMode }) : extractDictionaryItems(passage));
    const results = await Promise.allSettled(requests);
    const nextErrors = {};
    selectedOutputs.forEach((type, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') {
        if (type === 'key-vocab') setKeyVocabResult({ mode: 'preview', ...result.value }); else setDictionaryDraft(result.value);
      } else {
        nextErrors[type] = result.reason?.response?.data?.error || `Không thể tạo ${type === 'key-vocab' ? 'Key Vocab' : 'Dictionary'}.`;
        if (type === 'key-vocab') setKeyVocabResult(null); else setDictionaryDraft(null);
      }
    });
    setErrors(nextErrors);
    const firstSuccess = selectedOutputs.find((type, index) => results[index].status === 'fulfilled');
    if (firstSuccess) setResultTab(firstSuccess);
    if (Object.keys(nextErrors).length) showMsg?.('Một số học liệu chưa tạo được. Bạn có thể thử lại riêng từng loại.', 'error');
    setGenerating(false);
  };
  const retryOutput = async type => {
    setGenerating(true);
    try {
      if (type === 'key-vocab') setKeyVocabResult({ mode: 'preview', ...await generateKeyVocab({ passage, targetScore, selectionMode }) });
      else setDictionaryDraft(await extractDictionaryItems(passage));
      setErrors(current => ({ ...current, [type]: undefined })); setResultTab(type);
    } catch (error) { setErrors(current => ({ ...current, [type]: error.response?.data?.error || 'Không thể tạo học liệu.' })); }
    finally { setGenerating(false); }
  };
  const updateVocab = (index, field, value) => setKeyVocabResult(current => ({ ...current, vocabularies: current.vocabularies.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  const removeVocab = index => setKeyVocabResult(current => ({ ...current, vocabularies: current.vocabularies.filter((_, itemIndex) => itemIndex !== index) }));
  const updateDictionary = (index, value) => setDictionaryDraft(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { text: value, sentenceText: dictionarySentence(item) } : item) }));
  const removeDictionary = index => setDictionaryDraft(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  const addDictionaryItem = sentenceText => setDictionaryDraft(current => ({ ...current, items: [...current.items, { text: '', sentenceText }] }));
  const openKeyVocabDetail = (item, index) => {
    const itemTerms = [item?.o, item?.t].filter(Boolean).map(normalizeTerm);
    const dictionaryCandidate = dictionaryWorkspace?.candidates?.find(candidate => candidate.status === 'completed' && [candidate.originalChunk, candidate.canonical].filter(Boolean).some(value => itemTerms.includes(normalizeTerm(value))));
    setSourceSelection({ key: `key-vocab-${index}`, term: item?.t || item?.o || '', candidate: dictionaryCandidate || keyVocabAsDictionaryCandidate(item, passage) });
  };

  const saveKeyVocabResult = async () => {
    setSavingKeyVocab(true);
    try { await saveKeyVocab({ ...keyVocabResult, passage, targetScore, selectionMode }); setSaved(current => ({ ...current, 'key-vocab': true })); showMsg?.('Đã lưu Key Vocab vào lịch sử.', 'success'); if (dictionaryDraft) setResultTab('dictionary'); }
    catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu Key Vocab.', 'error'); }
    finally { setSavingKeyVocab(false); }
  };
  const saveDictionaryResult = async selectedItems => {
    setSavingDictionary(true);
    try {
      const workspace = await saveDictionaryCandidates({ ...dictionaryDraft, items: selectedItems });
      setDictionaryWorkspace(workspace);
      setSaved(current => ({ ...current, dictionary: workspace }));
      const candidateIds = workspace.candidates.map(candidate => candidate.id);
      if (candidateIds.length) {
        await generateDictionaryCandidates(workspace.id, candidateIds);
        setDictionaryWorkspace(await getDictionaryDetail(workspace.id));
      }
      showMsg?.('Đã lưu và bắt đầu gen Dictionary theo từng batch câu.', 'success');
    }
    catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu Dictionary.', 'error'); }
    finally { setSavingDictionary(false); }
  };
  const retryDictionary = async candidateIds => {
    if (!dictionaryWorkspace?.id || !candidateIds.length) return;
    try {
      await generateDictionaryCandidates(dictionaryWorkspace.id, candidateIds);
      setDictionaryWorkspace(await getDictionaryDetail(dictionaryWorkspace.id));
      showMsg?.(`Đã đưa ${candidateIds.length} từ vào hàng đợi gen lại.`, 'success');
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể gen lại Dictionary.', 'error'); }
  };
  const exportDictionaryFile = async format => {
    if (!dictionaryWorkspace?.id) return;
    setExporting(`dictionary-${format}`);
    try {
      if (format === 'xlsx') await exportDictionary(dictionaryWorkspace.id); else await exportDictionaryDocument(dictionaryWorkspace.id, format);
      showMsg?.(`Đã xuất Dictionary dạng ${format.toUpperCase()}.`, 'success');
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xuất Dictionary.', 'error'); }
    finally { setExporting(''); }
  };
  const exportKeyVocabFile = async format => {
    const source = keyVocabResult;
    if (!source) return;
    setExporting(format);
    try {
      if (format === 'xlsx') { if (source.mode === 'history') await exportKeyVocabHistory(source.id); else await exportKeyVocabPreview(source.vocabularies); }
      else if (source.mode === 'history') await exportKeyVocabDocumentHistory(source.id, format);
      else await exportKeyVocabDocumentPreview(format, { ...source, passage });
      showMsg?.(`Đã xuất ${format.toUpperCase()}.`, 'success');
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xuất dữ liệu.', 'error'); }
    finally { setExporting(''); }
  };
  const viewLearningMaterialHistory = async (item, preferredTab = 'key-vocab') => {
    try {
      const requests = [
        item.keyVocabId ? getKeyVocabDetail(item.keyVocabId) : Promise.resolve(null),
        item.dictionaryId ? getDictionaryDetail(item.dictionaryId) : Promise.resolve(null),
      ];
      const results = await Promise.allSettled(requests);
      const keyDetail = results[0].status === 'fulfilled' ? results[0].value : null;
      const dictionaryDetail = results[1].status === 'fulfilled' ? results[1].value : null;
      if (!keyDetail && !dictionaryDetail) throw new Error('Không có học liệu để mở.');

      const sourcePassage = keyDetail?.passage || dictionaryDetail?.passage || item.passage || '';
      const normalizedKeyDetail = keyDetail ? {
        mode: 'history',
        ...keyDetail,
        targetScore: keyDetail.target_score,
        selectionMode: keyDetail.selection_mode,
      } : null;
      setPassage(sourcePassage);
      setKeyVocabResult(normalizedKeyDetail);
      setDictionaryDraft(dictionaryDetail ? { passage: sourcePassage, items: dictionaryDetail.candidates || [] } : null);
      setDictionaryWorkspace(dictionaryDetail);
      setSelectedOutputs([keyDetail && 'key-vocab', dictionaryDetail && 'dictionary'].filter(Boolean));
      if (keyDetail) {
        setTargetScore(Number(keyDetail.target_score || 500));
        setSelectionMode(keyDetail.selection_mode || 'balanced');
      }
      const availableTabs = [keyDetail && 'key-vocab', dictionaryDetail && 'dictionary'].filter(Boolean);
      setResultTab(availableTabs.includes(preferredTab) ? preferredTab : availableTabs[0]);
      setSaved({ ...(keyDetail && { 'key-vocab': true }), ...(dictionaryDetail && { dictionary: dictionaryDetail }) });
      setErrors({});
      setSourceSelection(null);
      setViewingHistory(true);
      setPageMode('create');
    } catch (error) { showMsg?.(error.response?.data?.error || error.message || 'Không thể mở học liệu.', 'error'); }
  };
  const viewKeyVocabHistory = id => viewLearningMaterialHistory({ keyVocabId: id }, 'key-vocab');
  useEffect(() => {
    const historyId = location.state?.historyId; if (!historyId) return;
    viewKeyVocabHistory(historyId); navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.historyId]);
  const startNew = async () => {
    if (hasResults && !await confirmDialog({ title: 'Tạo học liệu mới?', message: 'Kết quả chưa lưu sẽ bị mất.', confirmText: 'Tạo mới', tone: 'primary' })) return;
    setPassage(''); setKeyVocabResult(null); setDictionaryDraft(null); setDictionaryWorkspace(null); setErrors({}); setSaved({}); setSourceSelection(null); setViewingHistory(false); setPageMode('create');
  };
  const actions = pageMode === 'history' ? <Button size="sm" icon={<Plus />} onClick={startNew}>Tạo học liệu</Button> : <Button size="sm" variant="outline" icon={<Clock3 />} onClick={() => setPageMode('history')}>Lịch sử</Button>;

  if (pageMode === 'history') return <PageFrame className="key-vocab-v2" breadcrumb={[{ label: 'Tạo & phát triển' }, { label: 'Tạo học liệu' }]} header={<PageHeader title="Tạo học liệu" actions={actions} />}>
    <LearningMaterialHistory showMsg={showMsg} onOpenMaterial={viewLearningMaterialHistory} />
  </PageFrame>;

  return <PageFrame className="key-vocab-v2" breadcrumb={[{ label: 'Tạo & phát triển' }, { label: 'Tạo học liệu' }]} header={<PageHeader title="Tạo học liệu" actions={actions} />}>
    <div className="key-vocab-v2__create"><Surface padding="none" className="key-vocab-v2__workbench">
      <header className="key-vocab-v2__workbench-head"><div><span className="key-vocab-v2__icon"><BookOpenText /></span><div><strong>Nội dung nguồn</strong><small>Chọn một hoặc cả hai loại học liệu để tạo từ cùng nội dung.</small></div></div></header>
      <div className={`key-vocab-v2__controls is-unified${selectedOutputs.includes('key-vocab') ? ' has-key-config' : ''}`}><fieldset className="key-vocab-v2__outputs"><legend>Học liệu cần tạo</legend>
        <Checkbox checked={selectedOutputs.includes('key-vocab')} disabled={hasResults || !canGenerateKeyVocab} onChange={() => toggleOutput('key-vocab')} label="Key Vocab" description="Danh sách từ trọng tâm theo level TOEIC" />
        <Checkbox checked={selectedOutputs.includes('dictionary')} disabled={hasResults || !canGenerateDictionary} onChange={() => toggleOutput('dictionary')} label="Dictionary" description="Danh sách từ điển chi tiết theo ngữ cảnh" />
      </fieldset>{selectedOutputs.includes('key-vocab') && <div className="key-vocab-v2__key-config"><FormField label="Level TOEIC"><Select disabled={hasResults} value={targetScore} onChange={event => setTargetScore(Number(event.target.value))}>{LEVELS.map(level => <option key={level} value={level}>TOEIC {level}+</option>)}</Select></FormField><FormField label="Chế độ chọn từ"><Select disabled={hasResults} value={selectionMode} onChange={event => setSelectionMode(event.target.value)}>{MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</Select></FormField></div>}</div>
      <div className="key-vocab-v2__canvas">{hasResults ? <InteractiveSourcePassage passage={passage} keyVocabItems={resultTab === 'key-vocab' ? keyVocabResult?.vocabularies || [] : []} dictionaryItems={resultTab === 'dictionary' ? dictionaryDraft?.items || [] : []} candidates={resultTab === 'dictionary' ? dictionaryWorkspace?.candidates || [] : []} selection={sourceSelection} onSelect={setSourceSelection} /> : <Textarea rows="9" value={passage} onChange={event => setPassage(event.target.value)} maxLength={20000} placeholder="Dán đoạn văn TOEIC, email công việc, script, thông báo hoặc nội dung bài học…" />}</div>
      <footer className="key-vocab-v2__workbench-footer">{hasResults ? <><span>Đã tạo {outputTabs.length} loại học liệu từ nội dung này.</span><Button size="sm" variant="outline" icon={<Plus />} onClick={startNew}>Tạo bộ mới</Button></> : <><div><strong>{trimmedLength < 80 ? `Cần thêm ${80 - trimmedLength} ký tự để tạo` : `${wordCount} từ · sẵn sàng tạo`}</strong><span>{passage.length.toLocaleString('vi-VN')}/20.000 ký tự</span></div><Button loading={generating} disabled={!selectedOutputs.length || trimmedLength < 80} icon={<WandSparkles />} onClick={generateMaterials}>Tạo học liệu</Button></>}</footer>
    </Surface>
    {Object.entries(errors).filter(([, message]) => message).map(([type, message]) => <section className="key-vocab-v2__error" key={type}><div><strong>{type === 'key-vocab' ? 'Key Vocab' : 'Dictionary'} chưa tạo được</strong><span>{message}</span></div><Button size="sm" variant="outline" icon={<RefreshCw />} onClick={() => retryOutput(type)}>Thử lại</Button></section>)}
    {outputTabs.length > 0 && <section className="key-vocab-v2__results"><Tabs items={outputTabs} value={resultTab} onChange={value => { setResultTab(value); setSourceSelection(null); }} />{resultTab === 'key-vocab' && keyVocabResult && <KeyVocabResult result={keyVocabResult} readOnly={viewingHistory} saved={saved['key-vocab']} saving={savingKeyVocab} exporting={exporting} canSave={canSaveKeyVocab} onChange={updateVocab} onRemove={removeVocab} onView={openKeyVocabDetail} onAdd={() => setKeyVocabResult(current => ({ ...current, vocabularies: [...current.vocabularies, blankVocab()] }))} onSave={saveKeyVocabResult} onExport={exportKeyVocabFile} />}{resultTab === 'dictionary' && dictionaryDraft && <DictionaryResult draft={dictionaryDraft} workspace={dictionaryWorkspace} saving={savingDictionary} exporting={exporting} canSave={canSaveDictionary} onChange={updateDictionary} onRemove={removeDictionary} onAdd={addDictionaryItem} onSave={saveDictionaryResult} onRetry={retryDictionary} onExport={exportDictionaryFile} />}</section>}
    </div>{generating && <div className="material-ai-loading" role="status"><div className="ai-orbit"><span /><WandSparkles /></div><strong>AI Academy đang tạo học liệu</strong><p>Các loại học liệu được xử lý độc lập; kết quả hoàn tất sẽ hiển thị theo từng tab.</p><div className="ai-progress"><i /></div></div>}
    <DictionaryDetailDrawer candidate={sourceSelection?.candidate || null} term={sourceSelection?.term || ''} onClose={() => setSourceSelection(null)} onRetry={retryDictionary} />
  </PageFrame>;
}

function InteractiveSourcePassage({ passage, keyVocabItems, dictionaryItems, candidates, selection, onSelect }) {
  const completedCandidates = candidates.filter(candidate => candidate.status === 'completed');
  const candidateByTerm = new Map();
  completedCandidates.forEach(candidate => {
    [candidate.originalChunk, candidate.canonical].filter(Boolean).forEach(value => candidateByTerm.set(normalizeTerm(value), candidate));
  });
  keyVocabItems.forEach(item => {
    const fallbackCandidate = keyVocabAsDictionaryCandidate(item, passage);
    [item.o, item.t].filter(Boolean).forEach(value => {
      const term = normalizeTerm(value);
      if (!candidateByTerm.has(term)) candidateByTerm.set(term, fallbackCandidate);
    });
  });
  const generatedTerms = new Set(candidateByTerm.keys());
  keyVocabItems.forEach(item => [item.o, item.t].filter(Boolean).forEach(value => generatedTerms.add(normalizeTerm(value))));
  dictionaryItems.forEach(item => {
    const value = dictionaryText(item);
    if (value) generatedTerms.add(normalizeTerm(value));
  });
  const terms = [...generatedTerms].sort((left, right) => right.length - left.length);
  const alternatives = terms.length ? `${terms.map(escapeRegExp).join('|')}|` : '';
  const tokenPattern = new RegExp(`(${alternatives}[A-Za-zÀ-ỹ]+(?:[’'-][A-Za-zÀ-ỹ]+)*|\\s+|[^A-Za-zÀ-ỹ\\s]+)`, 'giu');
  const tokens = passage.match(tokenPattern) || [];
  let offset = 0;
  return <div className="key-vocab-generated-source key-vocab-v2__interactive-source" aria-label="Nội dung nguồn tương tác">{tokens.map(token => {
    const key = `${offset}-${token}`;
    offset += token.length;
    if (/^\s+$/u.test(token) || !/[A-Za-zÀ-ỹ]/u.test(token)) return <span key={key}>{token}</span>;
    const normalized = normalizeTerm(token);
    const candidate = candidateByTerm.get(normalized) || null;
    const generated = generatedTerms.has(normalized);
    const selected = selection?.key === key;
    return <button type="button" key={key} className={`${generated ? 'is-generated' : 'is-empty'}${selected ? ' is-selected' : ''}`} aria-pressed={selected} title={candidate ? `Xem Dictionary của “${token}”` : generated ? `“${token}” đã được chọn, chưa gen chi tiết Dictionary` : `“${token}” chưa có dữ liệu`} onClick={() => onSelect({ key, term: token, candidate })}>{token}</button>;
  })}</div>;
}

function KeyVocabResult({ result, readOnly = false, saved, saving, exporting, canSave, onChange, onRemove, onView, onAdd, onSave, onExport }) {
  return <Surface padding="none" className={`key-vocab-v2__kv-result${readOnly ? ' is-read-only' : ''}`} role="tabpanel" id="panel-key-vocab" aria-labelledby="tab-key-vocab">
    <header><div><span className="key-vocab-v2__icon"><Sparkles /></span><div><h2>Key Vocab</h2><p>{result.vocabularies.length} mục · TOEIC {result.targetScore || 500}+ · {MODE_LABELS[result.selectionMode] || 'Cân bằng'}</p></div></div>{!readOnly && <Button size="sm" variant="outline" icon={<Plus />} onClick={onAdd}>Thêm từ</Button>}</header>
    <div className="key-vocab-v2__kv-table"><div className="key-vocab-v2__kv-columns"><span>#</span><span>Dạng trong bài</span><span>Dạng từ điển</span><span>Loại từ</span><span>Phát âm</span><span>Nghĩa tiếng Việt</span><span /></div><div className="key-vocab-v2__kv-rows">{result.vocabularies.map((item, index) => <article key={index} onClick={readOnly ? () => onView(item, index) : undefined}><b>{String(index + 1).padStart(2, '0')}</b><Input readOnly={readOnly} aria-label={`Dạng trong bài ${index + 1}`} value={item.o || ''} onChange={event => onChange(index, 'o', event.target.value)} /><Input readOnly={readOnly} aria-label={`Dạng từ điển ${index + 1}`} value={item.t || ''} onChange={event => onChange(index, 't', event.target.value)} /><Select disabled={readOnly} aria-label={`Loại từ ${index + 1}`} value={item.p || 'Noun'} onChange={event => onChange(index, 'p', event.target.value)}>{TYPES.map(type => <option key={type}>{type}</option>)}</Select><Input readOnly={readOnly} aria-label={`Phát âm ${index + 1}`} value={item.i || ''} onChange={event => onChange(index, 'i', event.target.value)} /><Input readOnly={readOnly} aria-label={`Nghĩa tiếng Việt ${index + 1}`} value={item.m || ''} onChange={event => onChange(index, 'm', event.target.value)} /><div className="key-vocab-v2__kv-actions"><IconButton size="sm" label={`Xem thông tin ${item.t || item.o || `mục ${index + 1}`}`} onClick={event => { event.stopPropagation(); onView(item, index); }}><Eye /></IconButton>{!readOnly && <IconButton size="sm" label={`Xóa ${item.t || `mục ${index + 1}`}`} onClick={() => onRemove(index)}><Trash2 /></IconButton>}</div></article>)}</div></div>
    <footer><span>{readOnly ? 'Đang xem dữ liệu đã lưu trong lịch sử.' : saved ? 'Đã lưu vào lịch sử.' : 'Kiểm tra và chỉnh sửa trước khi lưu.'}</span><div>{['xlsx', 'docx', 'pdf'].map(format => <Button key={format} size="sm" variant="outline" loading={exporting === format} disabled={!!exporting || !result.vocabularies.length} icon={<Download />} onClick={() => onExport(format)}>{format.toUpperCase()}</Button>)}{!readOnly && canSave && <Button size="sm" loading={saving} disabled={saved || !result.vocabularies.length} icon={<Save />} onClick={onSave}>{saved ? 'Đã lưu' : 'Lưu Key Vocab'}</Button>}</div></footer>
  </Surface>;
}

function DictionaryResult({ draft, workspace, saving, exporting, canSave, onChange, onRemove, onAdd, onSave, onRetry, onExport }) {
  const displayItems = workspace?.candidates || draft.items;
  const groups = groupDictionaryItems(displayItems);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(groups[0] ? [groups[0].key] : []));
  const [selectedIndexes, setSelectedIndexes] = useState(() => new Set());
  const [detailCandidateId, setDetailCandidateId] = useState(null);
  const completed = workspace?.candidates?.filter(candidate => candidate.status === 'completed').length || 0;
  const failed = workspace?.candidates?.filter(candidate => candidate.status === 'failed') || [];
  const running = workspace?.candidates?.filter(candidate => ['queued', 'generating'].includes(candidate.status)).length || 0;
  const toggleIndex = index => setSelectedIndexes(current => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });
  const toggleGroup = indexes => setSelectedIndexes(current => {
    const next = new Set(current);
    const selectAll = indexes.some(index => !next.has(index));
    indexes.forEach(index => selectAll ? next.add(index) : next.delete(index));
    return next;
  });
  const removeDraftItem = index => {
    setSelectedIndexes(current => new Set([...current].filter(value => value !== index).map(value => value > index ? value - 1 : value)));
    onRemove(index);
  };
  const selectedItems = [...selectedIndexes].sort((left, right) => left - right).map(index => draft.items[index]).filter(Boolean);
  const hasInvalidSelection = selectedItems.some(item => !dictionaryText(item));
  const detailCandidate = workspace?.candidates?.find(candidate => candidate.id === detailCandidateId) || null;
  return <Surface padding="none" className="key-vocab-v2__dictionary-result" role="tabpanel" id="panel-dictionary" aria-labelledby="tab-dictionary">
    <header><div><span className="key-vocab-v2__icon"><LibraryBig /></span><div><h2>Dictionary</h2><p>{displayItems.length} từ/cụm từ trong {groups.length} câu · Không có cấu hình bổ sung</p></div></div>{workspace && <div className="key-vocab-v2__dictionary-progress"><strong>{completed}/{workspace.candidates.length} hoàn tất</strong>{running > 0 && <span><RefreshCw className="spin" />{running} đang xử lý</span>}{failed.length > 0 && <span className="is-failed">{failed.length} lỗi</span>}</div>}</header>
    <div className="key-vocab-v2__dictionary-groups">{groups.map((group, groupIndex) => <details key={group.key} open={expandedGroups.has(group.key)} onToggle={event => {
      const isOpen = event.currentTarget.open;
      setExpandedGroups(current => {
        if (current.has(group.key) === isOpen) return current;
        const next = new Set(current);
        if (isOpen) next.add(group.key); else next.delete(group.key);
        return next;
      });
    }}><summary><div>{!workspace && (() => { const indexes = group.items.map(entry => entry.index); const checkedCount = indexes.filter(index => selectedIndexes.has(index)).length; return <input type="checkbox" checked={checkedCount === indexes.length && indexes.length > 0} ref={node => { if (node) node.indeterminate = checkedCount > 0 && checkedCount < indexes.length; }} onClick={event => event.stopPropagation()} onChange={() => toggleGroup(indexes)} aria-label={`Chọn toàn bộ từ trong câu ${groupIndex + 1}`} />; })()}<b>Câu {String(groupIndex + 1).padStart(2, '0')}</b><strong>{group.sentence || 'Dữ liệu cũ · chưa xác định câu nguồn'}</strong></div><span>{!workspace && <button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); setExpandedGroups(current => new Set(current).add(group.key)); setSelectedIndexes(current => new Set(current).add(draft.items.length)); onAdd(group.sentence); }}><Plus />Thêm từ</button>}<em>{group.items.length} từ/cụm từ</em><ChevronDown /></span></summary><div className={`key-vocab-v2__dictionary-list${workspace ? '' : ' is-review'}`}>{group.items.map(({ item, index }, itemIndex) => {
      const status = item.status || 'review';
      if (!workspace) return <article className={`is-review${selectedIndexes.has(index) ? ' is-selected' : ''}`} key={`${group.key}-${index}`}><input type="checkbox" checked={selectedIndexes.has(index)} onChange={() => toggleIndex(index)} aria-label={`Chọn ${dictionaryText(item) || `từ ${itemIndex + 1}`}`} /><label><span>Từ/cụm từ</span><input value={dictionaryText(item)} onChange={event => onChange(index, event.target.value)} /></label><button type="button" aria-label={`Xóa ${dictionaryText(item)}`} onClick={() => removeDraftItem(index)}><Trash2 /></button></article>;
      return <article className={`is-${status}`} key={item.id || `${dictionaryText(item)}-${index}`}><b>{String(itemIndex + 1).padStart(2, '0')}</b><label><span>Từ/cụm từ</span><input disabled value={dictionaryText(item)} /></label><div className="key-vocab-v2__dictionary-content">{status === 'completed' ? <><strong><CheckCircle2 />{item.canonical || item.originalChunk}</strong><p>{item.meaningVi || 'Chưa có nghĩa tiếng Việt'}</p><small>{[item.partOfSpeech, item.ipa].filter(Boolean).join(' · ')}</small></> : status === 'failed' ? <><strong className="is-error">Gen Dictionary lỗi</strong><p>{item.errorMessage || 'Không có thông tin lỗi.'}</p></> : <><strong><RefreshCw className="spin" />Đang gen theo batch câu</strong><p>Hệ thống đang tạo nội dung chi tiết.</p></>}</div><div className="key-vocab-v2__dictionary-actions">{status === 'completed' && <IconButton size="sm" label={`Xem chi tiết ${dictionaryText(item)}`} onClick={() => setDetailCandidateId(item.id)}><Eye /></IconButton>}<IconButton size="sm" disabled={!['failed', 'completed'].includes(status)} label={`Gen lại ${dictionaryText(item)}`} onClick={() => onRetry([item.id])}><RefreshCw /></IconButton></div></article>;
    })}</div></details>)}</div>
    <footer><span>{workspace ? running ? 'Đang gen Dictionary; kết quả cập nhật tự động.' : failed.length ? 'Có từ bị lỗi; có thể retry riêng từng từ hoặc toàn bộ lỗi.' : 'Dictionary đã được tạo hoàn tất trong workspace này.' : selectedItems.length ? `Đã chọn ${selectedItems.length}/${draft.items.length} từ/cụm từ để gen.` : 'Chọn câu hoặc từng từ/cụm từ cần gen Dictionary.'}</span><div>{workspace && completed > 0 && ['xlsx', 'docx', 'pdf'].map(format => <Button key={format} size="sm" variant="outline" loading={exporting === `dictionary-${format}`} icon={<Download />} onClick={() => onExport(format)}>{format.toUpperCase()}</Button>)}{failed.length > 0 && <Button variant="outline" icon={<RefreshCw />} onClick={() => onRetry(failed.map(item => item.id))}>Retry {failed.length} từ lỗi</Button>}{!workspace && canSave && <Button loading={saving} disabled={!selectedItems.length || hasInvalidSelection} icon={<WandSparkles />} onClick={() => onSave(selectedItems)}>Lưu & gen {selectedItems.length || ''} Dictionary</Button>}</div></footer>
    <DictionaryDetailDrawer candidate={detailCandidate} onClose={() => setDetailCandidateId(null)} onRetry={onRetry} />
  </Surface>;
}

function DictionaryDetailDrawer({ candidate, term = '', onClose, onRetry }) {
  if (!candidate && !term) return null;
  const hasData = candidate?.status === 'completed';
  const displayTerm = candidate?.canonical || candidate?.originalChunk || term;
  const list = value => Array.isArray(value) && value.length ? value.join(', ') : '—';
  const detailRows = [
    ['Dạng trong bài', candidate?.originalChunk],
    ['Loại từ', candidate?.partOfSpeech],
    ['Định nghĩa tiếng Anh', candidate?.meaningEn],
  ];
  const isKeyVocabFallback = candidate?.detailSource === 'key-vocab';
  return <Drawer open title={displayTerm} description={hasData ? isKeyVocabFallback ? 'Thông tin từ Key Vocab' : 'Nội dung Dictionary theo ngữ cảnh' : 'Từ này chưa có dữ liệu Dictionary'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Đóng</Button>{hasData && candidate?.id && <Button variant="outline" icon={<RefreshCw />} onClick={() => onRetry([candidate.id])}>Gen lại</Button>}</>}>
    <div className="key-vocab-v2__dictionary-detail">
      {!hasData && <section className="key-vocab-v2__dictionary-detail-empty"><LibraryBig /><strong>Chưa có dữ liệu cho “{displayTerm}”</strong><p>Hãy chọn từ này trong bước tạo Dictionary để hệ thống sinh nội dung chi tiết.</p></section>}
      {hasData && <>
      <section className="key-vocab-v2__dictionary-detail-hero"><span><CheckCircle2 /></span><div><strong>{candidate.canonical || candidate.originalChunk}</strong><p>{candidate.meaningVi || 'Chưa có nghĩa tiếng Việt'}</p><code>{candidate.ipa || 'Chưa có phát âm'}</code></div></section>
      <section><h3>Thông tin</h3><dl>{detailRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></section>
      <section><h3>Ngữ cảnh sử dụng</h3><div className="key-vocab-v2__dictionary-detail-copy"><span>Câu nguồn</span><p>{candidate.originalSentence || candidate.sentenceText || '—'}</p>{candidate.contextExplanation && <><span>Giải thích</span><p>{candidate.contextExplanation}</p></>}</div></section>
      <section><h3>Ví dụ</h3><div className="key-vocab-v2__dictionary-detail-copy is-example"><p>{candidate.exampleEn || '—'}</p>{candidate.exampleVi && <small>{candidate.exampleVi}</small>}</div></section>
      <section><h3>Mở rộng</h3><dl><div><dt>Collocations</dt><dd>{list(candidate.collocations)}</dd></div><div><dt>Synonyms</dt><dd>{list(candidate.synonyms)}</dd></div><div><dt>Word family</dt><dd>{candidate.wordFamily || '—'}</dd></div></dl></section>
      </>}
    </div>
  </Drawer>;
}
