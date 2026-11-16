import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, Pencil, Save, Sparkles } from 'lucide-react';
import { Button, ErrorState, PageFrame, Skeleton, StatusBadge, Tabs } from '../../../design-system-v2';
import { errorMessage, generateItem, getItem, regenerateArtifact, saveArtifact, updateItemContent } from '../../../services/contentStudioService';
import { STATUS, isBusy } from '../item/ArtifactShell';
import { DictionaryView, SourceEditor, TranslationView, VocabView, highlight } from '../item/PassagePanels';
import { QuestionEditor } from '../item/QuestionPanels';
import './ContentStudioPage.css';
import './ContentStudioItemPage.css';

const ITEM_STATUS = { draft: { tone: 'draft', label: 'Chưa tạo' }, ...STATUS };
const LETTERS = ['A', 'B', 'C', 'D'];
const EMPTY_SOURCE = { segments: {}, questions: {} };

export default function ContentStudioItemPage({ showMsg, permissions = {} }) {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('translation');
  const [openQuestionId, setOpenQuestion] = useState(undefined);
  const [drafts, setDrafts] = useState({});           // artifactId -> edited content
  const [sourceDraft, setSourceDraft] = useState(EMPTY_SOURCE);
  const [saving, setSaving] = useState(false);
  const [editingSource, setEditingSource] = useState(false);
  const [activeWord, setActiveWord] = useState(null); // [passageId, index]
  const [activeEntry, setActiveEntry] = useState(null);
  const [activeSentence, setActiveSentence] = useState(null); // [passageId, sentenceIndex, entryIndex]
  const [generating, setGenerating] = useState(false);
  const showMsgRef = useRef(showMsg);
  useEffect(() => { showMsgRef.current = showMsg; }, [showMsg]);

  const load = useCallback(async () => {
    try { setItem(await getItem(id)); setError(''); }
    catch (requestError) { setError(errorMessage(requestError, 'Không thể tải học liệu.')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

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
  const dirtyCount = Object.keys(drafts).length + (sourceDirty ? 1 : 0);
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
    setDrafts(current => { const next = { ...current }; saved.forEach(key => delete next[key]); return next; });
    await load();
    setSaving(false);
    if (failed.length) showMsg?.(failed[0], 'error');
    else showMsg?.(reviewCount ? `Đã lưu — ${reviewCount} phần còn điểm cần xem lại.` : 'Đã lưu tất cả thay đổi.', reviewCount ? 'warning' : 'success');
  };

  if (error) return <div className="iig3-list-screen"><ErrorState description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /></div>;
  if (!item) return <div className="iig3-list-screen"><Skeleton lines={6} /></div>;

  const tasks = item.tasks || {};
  const shellFor = onGenerate => ({ canEdit: permissions.edit, canGenerate: permissions.generate, onGenerate, onRegenerate: regenerate });
  const passageShell = task => shellFor(() => generate({ passage: [task], question: [] }));
  const questionShell = shellFor(() => generate({ passage: [], question: tasks.question?.length ? tasks.question : ['translation', 'hint', 'explanation', 'note'] }));
  const counts = {
    vocab: passages.reduce((sum, passage) => sum + (artifactFor('vocab', passage.id)?.content?.items?.length || 0), 0),
    dictionary: passages.reduce((sum, passage) => sum + (artifactFor('dictionary', passage.id)?.content?.sentences || []).reduce((total, sentence) => total + (sentence.entries?.length || 0), 0), 0),
  };
  const range = item.detection?.summary?.questionRange;
  const back = item.folderPath?.at(-1);
  const readyQuestions = questions.filter(question => artifactsByQuestion[question.id]?.status === 'ready').length;
  const openQuestion = openQuestionId === undefined ? questions[0]?.id : openQuestionId;
  const tabs = [
    ...(passages.length ? [
      { value: 'translation', label: 'Dịch' },
      { value: 'vocab', label: `Từ vựng${counts.vocab ? ` · ${counts.vocab}` : ''}` },
      { value: 'dictionary', label: `Từ điển${counts.dictionary ? ` · ${counts.dictionary}` : ''}` },
    ] : []),
    ...(questions.length ? [{ value: 'questions', label: `Câu hỏi · ${readyQuestions}/${questions.length}` }] : []),
  ];
  const activeTab = tabs.some(entry => entry.value === tab) ? tab : tabs[0]?.value;
  // Vocab / dictionary terms are highlighted in the fixed source on the left.
  const termsFor = passage => {
    if (activeTab === 'translation') return activeSentence ? [activeSentence] : [];
    if (activeTab === 'vocab') { const artifact = artifactFor('vocab', passage.id); return ((artifact && (drafts[artifact.id] ?? artifact.content))?.items || []).map(word => word.inText); }
    if (activeTab === 'dictionary') { const artifact = artifactFor('dictionary', passage.id); return ((artifact && (drafts[artifact.id] ?? artifact.content))?.sentences || []).flatMap(sentence => (sentence.entries || []).map(entry => entry.inText)); }
    return [];
  };
  const activeTerm = passage => {
    if (activeTab === 'translation') return activeSentence;
    if (activeTab === 'dictionary' && activeEntry?.[0] === passage.id) {
      const artifact = artifactFor('dictionary', passage.id);
      return (artifact && (drafts[artifact.id] ?? artifact.content))?.sentences?.[activeEntry[1]]?.entries?.[activeEntry[2]]?.inText;
    }
    if (activeTab !== 'vocab' || activeWord?.[0] !== passage.id) return null;
    const artifact = artifactFor('vocab', passage.id);
    return (artifact && (drafts[artifact.id] ?? artifact.content))?.items?.[activeWord[1]]?.inText;
  };

  return <div className="iig3-list-screen cs-screen"><PageFrame
    className="cs-page cs-item-page"
    breadcrumb={[{ label: 'Content Studio' }, ...(item.folderPath || []).map(folder => ({ label: folder.name })), { label: item.title }]}
    header={<div className="cs-item-head">
      <Link className="cs-back" to="/content-studio"><ArrowLeft /> {back ? back.name : 'Content Studio'}</Link>
      <div className="cs-item-head__row">
        <h1>{item.title}</h1>
        <StatusBadge status={ITEM_STATUS[item.status]?.tone} label={ITEM_STATUS[item.status]?.label} />
        <span className="cs-item-head__meta">{[passages.length && `${passages.length} đoạn văn`, questions.length && `${questions.length} câu hỏi${range ? ` (${range.from}–${range.to})` : ''}`].filter(Boolean).join(' · ')}</span>
        {permissions.generate && <Button variant="outline" icon={<Sparkles />} loading={generating} disabled={busy} onClick={() => generate(null)}>{busy ? 'Đang tạo…' : item.artifacts.length ? 'Tạo lại tất cả' : 'Tạo nội dung'}</Button>}
        {permissions.edit && <Button icon={<Save />} loading={saving} disabled={!dirtyCount} onClick={saveAll}>{dirtyCount ? `Lưu thay đổi (${dirtyCount})` : 'Đã lưu'}</Button>}
      </div>
    </div>}
  >
    <div className="cs-hub is-split">
      <section className="cs-hub__col cs-hub__source" aria-label="Nội dung gốc">
        <header className="cs-hub__head">
          <strong>Nội dung gốc</strong>
          {sourceDirty > 0 && <em className="cs-dirty">Chưa lưu</em>}
          {permissions.edit && <Button variant={editingSource ? 'outline' : 'ghost'} size="sm" icon={editingSource ? <Check /> : <Pencil />} onClick={() => setEditingSource(value => !value)}>{editingSource ? 'Xong' : 'Sửa'}</Button>}
        </header>
        {editingSource ? <div className="cs-hub__body">
          <SourceEditor passages={passages} questions={questions} draft={sourceDraft} onChange={setSourceDraft} />
        </div> : <div className="cs-hub__body">
          {passages.map(passage => <p key={passage.id} className="cs-source">{highlight(sourceDraft.segments[passage.id] ?? passage.text, termsFor(passage), activeTerm(passage))}</p>)}
          {questions.length > 0 && <ol className="cs-source-q">
            {questions.map(raw => { const question = { ...raw, ...sourceDraft.questions[raw.id] }; return <li key={question.id}>
              <strong>{question.number}. {question.stem}</strong>
              <ul>{LETTERS.filter(letter => question.options?.[letter]).map(letter => <li key={letter} className={question.answerKey === letter ? 'is-answer' : ''}>({letter}) {question.options[letter]}{question.answerKey === letter && <CheckCircle2 />}</li>)}</ul>
            </li>; })}
          </ol>}
        </div>}
      </section>

      <section className="cs-hub__col cs-hub__work" aria-label="Biên tập">
        <div className="cs-hub__tabs"><Tabs value={activeTab} onChange={setTab} items={tabs} /></div>
        <div className="cs-hub__body">
          {activeTab === 'translation' && passages.map(passage => <div key={passage.id} className="cs-hub__block">
            <TranslationView {...editorProps(artifactFor('passage_translation', passage.id))} shell={passageShell('translation')} onFocusSentence={setActiveSentence} />
          </div>)}
          {activeTab === 'vocab' && passages.map(passage => <div key={passage.id} className="cs-hub__block">
            <VocabView {...editorProps(artifactFor('vocab', passage.id))} shell={passageShell('vocab')}
              activeIndex={activeWord?.[0] === passage.id ? activeWord[1] : null} onActivate={index => setActiveWord(index == null ? null : [passage.id, index])} />
          </div>)}
          {activeTab === 'dictionary' && passages.map(passage => <div key={passage.id} className="cs-hub__block">
            <DictionaryView {...editorProps(artifactFor('dictionary', passage.id))} shell={passageShell('dictionary')}
              active={activeEntry?.[0] === passage.id ? activeEntry.slice(1) : null} onActivate={value => setActiveEntry(value ? [passage.id, ...value] : null)} />
          </div>)}
          {activeTab === 'questions' && questions.map(question => <QuestionEditor key={question.id} question={question} {...editorProps(artifactsByQuestion[question.id])} shell={questionShell}
            open={openQuestion === question.id} onToggle={() => setOpenQuestion(current => ((current === undefined ? questions[0]?.id : current) === question.id ? null : question.id))} />)}
        </div>
      </section>
    </div>
  </PageFrame></div>;
}
