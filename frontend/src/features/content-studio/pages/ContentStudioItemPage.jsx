import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, Check, CheckCircle2, Pencil, RefreshCw, Save } from 'lucide-react';
import { Button, ErrorState, PageFrame, Skeleton, StatusBadge } from '../../../design-system-v2';
import { errorMessage, generateItem, getItem, regenerateArtifact, saveArtifact, saveDictionaryEntry, updateItemContent } from '../../../services/contentStudioService';
import { STATUS, isBusy } from '../item/ArtifactShell';
import DictionaryPanel from '../item/DictionaryPanel';
import { SourceEditor, VocabView, highlight } from '../item/PassagePanels';
import TranslationPanel from '../item/TranslationPanel';
import { QuestionWorkspace, explanationQuote } from '../item/QuestionPanels';
import './ContentStudioItemPage.css';

const ITEM_STATUS = {
  draft: { tone: 'draft', label: 'Chưa tạo' }, waiting_review: { tone: 'warning', label: 'Từ điển chờ duyệt' }, ...STATUS,
};
const LETTERS = ['A', 'B', 'C', 'D'];
const EMPTY_SOURCE = { segments: {}, questions: {} };

export default function ContentStudioItemPage({ showMsg, permissions = {} }) {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'vocab');
  const [openQuestionId, setOpenQuestion] = useState(undefined);
  const [drafts, setDrafts] = useState({});           // artifactId -> edited content
  const [sourceDraft, setSourceDraft] = useState(EMPTY_SOURCE);
  const [saving, setSaving] = useState(false);
  const [editingSource, setEditingSource] = useState(false);
  const [activeWord, setActiveWord] = useState(null); // [passageId, index]
  const [activeEntry, setActiveEntry] = useState(null);
  const [dictionaryDrafts, setDictionaryDrafts] = useState({});
  const [dictionaryState, setDictionaryState] = useState(null);
  const [dictionaryReloadKey, setDictionaryReloadKey] = useState(0);
  const [selectedText, setSelectedText] = useState(null);
  const [showHighlights, setShowHighlights] = useState(true);
  const [vocabSettings, setVocabSettings] = useState({ level: 650, mode: 'balanced' });
  const [activeSentence, setActiveSentence] = useState(null); // [passageId, sentenceIndex, entryIndex]
  const [generating, setGenerating] = useState(false);
  const showMsgRef = useRef(showMsg);
  useEffect(() => { showMsgRef.current = showMsg; }, [showMsg]);

  const load = useCallback(async () => {
    try { setItem(await getItem(id)); setError(''); }
    catch (requestError) { setError(errorMessage(requestError, 'Không thể tải học liệu.')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested && ['vocab', 'dictionary', 'translation', 'questions'].includes(requested)) setTab(requested);
  }, [searchParams]);
  useEffect(() => { if (item?.tasks?.vocab) setVocabSettings(item.tasks.vocab); }, [item?.tasks?.vocab]);

  const busy = Boolean(item?.artifacts?.some(isBusy));
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [busy, load]);

  const passages = useMemo(() => (item?.segments || []).filter(segment => segment.kind === 'passage'), [item]);
  const questions = useMemo(() => (item?.segments || []).flatMap(segment => segment.questions || []), [item]);
  const artifactFor = useCallback((type, segmentId) => item?.artifacts?.find(artifact => artifact.type === type && artifact.segmentId === segmentId && !artifact.questionId), [item]);
  const artifactsByQuestion = useMemo(() => Object.fromEntries((item?.artifacts || []).filter(artifact => artifact.questionId).map(artifact => [artifact.questionId, artifact])), [item]);

  const sourceDirty = Object.keys(sourceDraft.segments).length + Object.keys(sourceDraft.questions).length;
  const dirtyCount = Object.keys(drafts).length + Object.keys(dictionaryDrafts).length + (sourceDirty ? 1 : 0);
  const editorProps = artifact => ({
    artifact,
    draft: artifact ? drafts[artifact.id] ?? artifact.content : null,
    dirty: Boolean(artifact && drafts[artifact.id]),
    onChange: content => setDrafts(current => ({ ...current, [artifact.id]: content })),
  });

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirtyCount) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const generate = async tasks => {
    setGenerating(true);
    try {
      const result = await generateItem(id, tasks);
      showMsg?.(`Đã đưa ${result.queued} nội dung vào hàng chờ tạo.`, 'success');
      await load();
    } catch (requestError) { showMsg?.(errorMessage(requestError, 'Không thể tạo nội dung.'), 'error'); }
    finally { setGenerating(false); }
  };
  const regenerate = async artifact => {
    try {
      await regenerateArtifact(artifact.id);
      setDrafts(current => { const next = { ...current }; delete next[artifact.id]; return next; });
      await load();
    } catch (requestError) { showMsg?.(errorMessage(requestError, 'Không thể tạo lại.'), 'error'); }
  };

  const saveAll = async () => {
    if (!dirtyCount || saving) return;
    setSaving(true);
    const failed = [];
    let reviewCount = 0;
    if (sourceDirty) {
      try {
        await updateItemContent(id, {
          segments: Object.entries(sourceDraft.segments).map(([segmentId, text]) => ({ id: segmentId, text })),
          questions: Object.entries(sourceDraft.questions).map(([questionId, value]) => ({ id: questionId, ...value })),
        });
        setSourceDraft(EMPTY_SOURCE);
        setEditingSource(false);
      } catch (requestError) { failed.push(errorMessage(requestError, 'Không thể lưu nội dung gốc.')); }
    }
    const saved = [];
    for (const [artifactId, content] of Object.entries(drafts)) {
      try {
        const result = await saveArtifact(artifactId, content);
        if (result.status !== 'ready') reviewCount += 1;
        saved.push(artifactId);
      } catch (requestError) { failed.push(errorMessage(requestError, 'Không thể lưu.')); }
    }
    const savedDictionary = [];
    for (const [candidateId, content] of Object.entries(dictionaryDrafts)) {
      try {
        const result = await saveDictionaryEntry(candidateId, content);
        if (result.status !== 'ready') reviewCount += 1;
        savedDictionary.push(candidateId);
      } catch (requestError) { failed.push(errorMessage(requestError, 'Không thể lưu mục từ điển.')); }
    }
    setDrafts(current => { const next = { ...current }; saved.forEach(key => delete next[key]); return next; });
    setDictionaryDrafts(current => { const next = { ...current }; savedDictionary.forEach(key => delete next[key]); return next; });
    if (savedDictionary.length) setDictionaryReloadKey(value => value + 1);
    await load();
    setSaving(false);
    if (failed.length) showMsg?.(failed[0], 'error');
    else showMsg?.(reviewCount ? `Đã lưu — ${reviewCount} phần còn điểm cần xem lại.` : 'Đã lưu tất cả thay đổi.', reviewCount ? 'warning' : 'success');
  };

  if (error) return <div className="iig3-list-screen"><ErrorState description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /></div>;
  if (!item) return <div className="iig3-list-screen"><Skeleton lines={6} /></div>;

  const tasks = item.tasks || {};
  const shellFor = onGenerate => ({ canEdit: permissions.edit, canGenerate: permissions.generate, onGenerate, onRegenerate: regenerate });
  const passageShell = task => ({
    ...shellFor(() => generate({ passage: [task], question: [], ...(task === 'vocab' ? { vocab: vocabSettings } : {}) })),
    ...(task === 'vocab' ? { onRegenerate: () => generate({ passage: ['vocab'], question: [], vocab: vocabSettings }) } : {}),
  });
  const questionShell = shellFor(() => generate({ passage: [], question: tasks.question?.length ? tasks.question : ['translation', 'hint', 'explanation', 'note'] }));
  const counts = {
    vocab: passages.reduce((sum, passage) => sum + (artifactFor('vocab', passage.id)?.content?.items?.length || 0), 0),
    dictionary: dictionaryState?.counts?.total || 0,
  };
  const range = item.detection?.summary?.questionRange;
  const readyQuestions = questions.filter(question => artifactsByQuestion[question.id]?.status === 'ready').length;
  const openQuestion = questions.some(question => question.id === openQuestionId) ? openQuestionId : questions[0]?.id;
  const taskStatus = item.taskStatus || {};
  const translationCounts = passages.reduce((totals, passage) => {
    const artifact = artifactFor('passage_translation', passage.id);
    const total = artifact?.content?.sentences?.length || 0;
    const review = new Set((artifact?.validation?.issues || []).map(issue => issue.path).filter(path => /^sentences\.\d+$/.test(path))).size;
    return { total: totals.total + total, ready: totals.ready + Math.max(0, total - review) };
  }, { total: 0, ready: 0 });
  const tabs = [
    ...(passages.length ? [
      { value: 'vocab', label: 'Từ vựng', detail: counts.vocab || '', status: taskStatus.vocab },
      { value: 'dictionary', label: 'Từ điển', detail: dictionaryState?.status === 'waiting_review' ? 'chờ duyệt' : (counts.dictionary || ''), status: dictionaryState?.status || taskStatus.dictionary },
      { value: 'translation', label: 'Dịch', detail: translationCounts.total ? `${translationCounts.ready}/${translationCounts.total}` : '', status: taskStatus.translation },
    ] : []),
    ...(questions.length ? [{ value: 'questions', label: 'Câu hỏi', detail: `${readyQuestions}/${questions.length}`, status: taskStatus.questions }] : []),
  ];
  const activeTab = tabs.some(entry => entry.value === tab) ? tab : tabs[0]?.value;
  // Vocab / dictionary terms are highlighted in the fixed source on the left.
  const termsFor = passage => {
    if (activeTab === 'translation') return activeSentence ? [activeSentence] : [];
    if (!showHighlights) return [];
    if (activeTab === 'vocab') { const artifact = artifactFor('vocab', passage.id); return ((artifact && (drafts[artifact.id] ?? artifact.content))?.items || []).map(word => word.inText); }
    if (activeTab === 'dictionary') return (dictionaryState?.sentences || []).filter(sentence => sentence.segmentId === passage.id).flatMap(sentence => sentence.candidates.map(candidate => dictionaryDrafts[candidate.id]?.inText || candidate.entry?.content?.inText || candidate.chunk));
    return [];
  };
  const activeTerm = passage => {
    if (activeTab === 'translation') return activeSentence;
    if (activeTab === 'dictionary') { const candidate = (dictionaryState?.sentences || []).flatMap(sentence => sentence.candidates).find(entry => entry.id === activeEntry); return dictionaryDrafts[activeEntry]?.inText || candidate?.entry?.content?.inText || candidate?.chunk; }
    if (activeTab !== 'vocab' || activeWord?.[0] !== passage.id) return null;
    const artifact = artifactFor('vocab', passage.id);
    return (artifact && (drafts[artifact.id] ?? artifact.content))?.items?.[activeWord[1]]?.inText;
  };
  const selectedQuestionArtifact = artifactsByQuestion[openQuestion];
  const selectedQuestionDraft = selectedQuestionArtifact && (drafts[selectedQuestionArtifact.id] ?? selectedQuestionArtifact.content);
  const quotedSource = activeTab === 'questions'
    ? explanationQuote(selectedQuestionDraft?.explanation, passages.map(passage => sourceDraft.segments[passage.id] ?? passage.text).join(' '))
    : null;

  const changeTab = value => { setTab(value); setSearchParams(current => { const next = new URLSearchParams(current); next.set('tab', value); return next; }, { replace: true }); };
  const captureSelection = passage => {
    if (!permissions.edit || editingSource || !['vocab', 'dictionary'].includes(activeTab)) return;
    const text = window.getSelection()?.toString().trim();
    if (!text || !passage.text.toLocaleLowerCase().includes(text.toLocaleLowerCase())) return;
    if (activeTab === 'dictionary') setSelectedText({ text, segmentId: passage.id });
    else {
      const artifact = artifactFor('vocab', passage.id);
      if (!artifact) return;
      const content = drafts[artifact.id] ?? artifact.content;
      const items = content?.items || [];
      if (items.some(item => item.inText?.toLocaleLowerCase() === text.toLocaleLowerCase())) return;
      setDrafts(current => ({ ...current, [artifact.id]: { ...content, items: [...items, { inText: text, lemma: text.toLocaleLowerCase(), pos: 'Phrase', ipa: '', meaningVi: '' }] } }));
      setActiveWord([passage.id, items.length]);
    }
    window.getSelection()?.removeAllRanges();
  };

  return <div className="iig3-list-screen cs-screen"><PageFrame
    className="cs-page cs-item-page"
    breadcrumb={[{ label: 'Content Studio' }, ...(item.folderPath || []).map(folder => ({ label: folder.name })), { label: item.title }]}
    header={<div className="cs-item-head">
      <div className="cs-item-path"><BookOpen />Content Studio / {(item.folderPath || []).map(folder => folder.name).join(' / ') || 'Chưa phân loại'}</div>
      <div className="cs-item-head__row">
        <h1>{item.title}</h1>
        <StatusBadge status={ITEM_STATUS[item.status]?.tone} label={ITEM_STATUS[item.status]?.label} />
        <span className="cs-item-head__meta">{[passages[0]?.meta?.part && `Part ${passages[0].meta.part}`, passages.length && `${passages.length} đoạn văn`, questions.length && `${questions.length} câu hỏi${range ? ` (${range.from}–${range.to})` : ''}`].filter(Boolean).join(' · ')}</span>
        {permissions.generate && <Button variant="outline" icon={<RefreshCw />} loading={generating} disabled={busy} onClick={() => generate(null)}>{busy ? 'Đang tạo…' : item.artifacts.length ? 'Tạo lại tất cả' : 'Tạo nội dung'}</Button>}
        {permissions.edit && <Button icon={<Save />} loading={saving} disabled={!dirtyCount} onClick={saveAll}>{dirtyCount ? `Lưu thay đổi (${dirtyCount})` : 'Đã lưu'}</Button>}
      </div>
    </div>}
  >
    <div className="cs-hub is-split">
      <section className="cs-hub__col cs-hub__source" aria-label="Nội dung gốc">
        <header className="cs-hub__head">
          <BookOpen /><strong>Nội dung gốc{activeTab === 'translation' && translationCounts.total > 0 && <small> · {translationCounts.total} câu · {passages.reduce((sum, passage) => sum + String(passage.text || '').trim().split(/\s+/).filter(Boolean).length, 0)} từ</small>}</strong>
          {sourceDirty > 0 && <em className="cs-dirty">Chưa lưu</em>}
          {!editingSource && ['vocab', 'dictionary'].includes(activeTab) && <div className="cs-source-toggle"><button className={showHighlights ? 'is-active' : ''} onClick={() => setShowHighlights(true)}>{activeTab === 'vocab' ? 'Tô từ vựng' : 'Tô mục từ'}</button><button className={!showHighlights ? 'is-active' : ''} onClick={() => setShowHighlights(false)}>Văn bản sạch</button></div>}
          {permissions.edit && <Button variant={editingSource ? 'outline' : 'ghost'} size="sm" icon={editingSource ? <Check /> : <Pencil />} onClick={() => setEditingSource(value => !value)}>{editingSource ? 'Xong' : 'Sửa'}</Button>}
        </header>
        {editingSource ? <div className="cs-hub__body">
          <SourceEditor passages={passages} questions={questions} draft={sourceDraft} onChange={setSourceDraft} />
        </div> : <div className="cs-hub__body">
          {activeTab === 'translation' ? passages.map(passage => {
            const translation = artifactFor('passage_translation', passage.id);
            const rows = (translation && (drafts[translation.id] ?? translation.content)?.sentences) || [];
            return <ol key={passage.id} className="cs-source-sentences">{rows.map((row, index) => <li key={index} tabIndex={0} className={activeSentence === row.en ? 'is-active' : ''}
              onMouseEnter={() => setActiveSentence(row.en)} onMouseLeave={() => setActiveSentence(null)} onFocus={() => setActiveSentence(row.en)} onBlur={() => setActiveSentence(null)}><strong>S{index + 1}</strong><span>{row.en}</span></li>)}</ol>;
          }) : passages.map(passage => <p key={passage.id} className="cs-source" onMouseUp={() => captureSelection(passage)}>
            {highlight(sourceDraft.segments[passage.id] ?? passage.text, activeTab === 'questions' && quotedSource ? [quotedSource] : termsFor(passage), activeTab === 'questions' ? quotedSource : activeTerm(passage), activeTab === 'questions' ? 'is-quote' : '')}
          </p>)}
          {activeTab === 'questions' && quotedSource && <div className="cs-source-quote-note"><i />Câu được trích dẫn trong Explanation của câu {questions.find(question => question.id === openQuestion)?.number}</div>}
          {activeTab !== 'questions' && activeTab !== 'translation' && questions.length > 0 && <ol className="cs-source-q">
            {questions.map(raw => { const question = { ...raw, ...sourceDraft.questions[raw.id] }; return <li key={question.id}>
              <strong>{question.number}. {question.stem}</strong>
              <ul>{LETTERS.filter(letter => question.options?.[letter]).map(letter => <li key={letter} className={question.answerKey === letter ? 'is-answer' : ''}>({letter}) {question.options[letter]}{question.answerKey === letter && <CheckCircle2 />}</li>)}</ul>
            </li>; })}
          </ol>}
        </div>}
      </section>

      <section className="cs-hub__col cs-hub__work" aria-label="Biên tập">
        <nav className="cs-hub__tabs">{tabs.map(entry => <button type="button" key={entry.value} className={activeTab === entry.value ? 'is-active' : ''} onClick={() => changeTab(entry.value)}><i className={`is-${entry.status || 'empty'}`} />{entry.label}{entry.detail !== '' && <span>{entry.detail}</span>}</button>)}</nav>
        <div className="cs-hub__body">
          {activeTab === 'translation' && passages.map(passage => <div key={passage.id} className="cs-hub__block cs-hub__block--translation">
            <TranslationPanel {...editorProps(artifactFor('passage_translation', passage.id))} shell={passageShell('translation')} activeSentence={activeSentence} onFocusSentence={setActiveSentence} />
          </div>)}
          {activeTab === 'vocab' && passages.map(passage => <div key={passage.id} className="cs-hub__block">
            <VocabView {...editorProps(artifactFor('vocab', passage.id))} shell={passageShell('vocab')}
              settings={vocabSettings} onSettingsChange={setVocabSettings} sourceText={passage.text}
              activeIndex={activeWord?.[0] === passage.id ? activeWord[1] : null} onActivate={index => setActiveWord(index == null ? null : [passage.id, index])} />
          </div>)}
          {activeTab === 'dictionary' && <DictionaryPanel itemId={id} canEdit={permissions.edit} canGenerate={permissions.generate}
            drafts={dictionaryDrafts} setDraft={(candidateId, content) => setDictionaryDrafts(current => ({ ...current, [candidateId]: content }))}
            clearDraft={candidateId => setDictionaryDrafts(current => { const next = { ...current }; delete next[candidateId]; return next; })} reloadKey={dictionaryReloadKey}
            selectedText={selectedText} onConsumed={() => setSelectedText(null)} activeId={activeEntry} onActive={setActiveEntry}
            notify={(message, tone) => showMsgRef.current?.(message, tone)} onState={setDictionaryState} />}
          {activeTab === 'questions' && <QuestionWorkspace questions={questions} artifacts={artifactsByQuestion} drafts={drafts} selectedId={openQuestion}
            onSelect={setOpenQuestion} onChange={(artifact, content) => setDrafts(current => ({ ...current, [artifact.id]: content }))} shell={questionShell} />}
        </div>
      </section>
    </div>
  </PageFrame></div>;
}
