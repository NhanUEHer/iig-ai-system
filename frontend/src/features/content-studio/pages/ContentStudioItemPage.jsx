import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageFrame, PageHeader, SegmentedControl, Skeleton, StatusBadge, Tabs } from '../../../design-system-v2';
import { errorMessage, generateItem, getItem } from '../../../services/contentStudioService';
import { STATUS, isBusy } from '../item/ArtifactShell';
import { DictionaryPanel, SourcePanel, TranslationPanel, VocabPanel } from '../item/PassagePanels';
import { LearnerPreview, QuestionEditor } from '../item/QuestionPanels';
import './ContentStudioPage.css';
import './ContentStudioItemPage.css';

const ITEM_STATUS = { draft: { tone: 'draft', label: 'Chưa tạo' }, ...STATUS };

export default function ContentStudioItemPage({ showMsg, permissions = {} }) {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState(null);
  const [passageTab, setPassageTab] = useState('translation');
  const [mode, setMode] = useState('edit');
  const [generating, setGenerating] = useState(false);
  const showMsgRef = useRef(showMsg);
  useEffect(() => { showMsgRef.current = showMsg; }, [showMsg]);

  const load = useCallback(async () => {
    try { setItem(await getItem(id)); setError(''); }
    catch (requestError) { setError(errorMessage(requestError, 'Không thể tải học liệu.')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const busy = Boolean(item?.artifacts?.some(isBusy));
  // Poll while anything is still being generated.
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [busy, load]);

  const passages = useMemo(() => (item?.segments || []).filter(segment => segment.kind === 'passage'), [item]);
  const questions = useMemo(() => (item?.segments || []).flatMap(segment => segment.questions || []), [item]);
  const artifactFor = useCallback((type, segmentId) => item?.artifacts?.find(artifact => artifact.type === type && artifact.segmentId === segmentId && !artifact.questionId), [item]);
  const artifactsByQuestion = useMemo(() => Object.fromEntries((item?.artifacts || []).filter(artifact => artifact.questionId).map(artifact => [artifact.questionId, artifact])), [item]);
  const activeView = view || (passages.length ? 'passage' : 'questions');

  const generate = async tasks => {
    setGenerating(true);
    try {
      const result = await generateItem(id, tasks);
      showMsg?.(`Đã đưa ${result.queued} nội dung vào hàng chờ tạo.`, 'success');
      await load();
    } catch (requestError) { showMsg?.(errorMessage(requestError, 'Không thể tạo nội dung.'), 'error'); }
    finally { setGenerating(false); }
  };

  if (error) return <div className="iig3-list-screen"><ErrorState description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /></div>;
  if (!item) return <div className="iig3-list-screen"><Skeleton lines={6} /></div>;

  const shell = { canEdit: permissions.edit, canGenerate: permissions.generate, onChanged: load, showMsg };
  const tasks = item.tasks || {};
  const counts = {
    vocab: passages.reduce((sum, passage) => sum + (artifactFor('vocab', passage.id)?.content?.items?.length || 0), 0),
    dictionary: passages.reduce((sum, passage) => sum + (artifactFor('dictionary', passage.id)?.content?.sentences || []).reduce((total, sentence) => total + (sentence.entries?.length || 0), 0), 0),
  };
  const range = item.detection?.summary?.questionRange;
  const back = item.folderPath?.at(-1);

  return <div className="iig3-list-screen cs-screen"><PageFrame
    className="cs-page"
    breadcrumb={[{ label: 'Content Studio', href: '/content-studio' }, ...(item.folderPath || []).map(folder => ({ label: folder.name })), { label: item.title }]}
    header={<PageHeader
      eyebrow={<Link className="cs-back" to="/content-studio"><ArrowLeft /> {back ? back.name : 'Content Studio'}</Link>}
      title={item.title}
      metadata={<StatusBadge status={ITEM_STATUS[item.status]?.tone} label={ITEM_STATUS[item.status]?.label} />}
      actions={permissions.generate && <Button icon={<Sparkles />} loading={generating} disabled={busy} onClick={() => generate(null)}>{busy ? 'Đang tạo…' : item.artifacts.length ? 'Tạo lại tất cả' : 'Tạo nội dung'}</Button>}
    />}
  >
    <div className="cs-item-toolbar">
      <SegmentedControl value={activeView} onChange={setView} options={[
        ...(passages.length ? [{ value: 'passage', label: 'Đoạn văn' }] : []),
        ...(questions.length ? [{ value: 'questions', label: `Câu hỏi ${range ? (range.from === range.to ? range.from : `${range.from}–${range.to}`) : ''}` }] : []),
      ]} />
      {activeView === 'questions' && <SegmentedControl value={mode} onChange={setMode} options={[{ value: 'edit', label: 'Sửa' }, { value: 'learner', label: 'Xem như học viên' }]} />}
    </div>

    {activeView === 'passage' && passages.map(passage => {
      const tabArtifact = { translation: artifactFor('passage_translation', passage.id), vocab: artifactFor('vocab', passage.id), dictionary: artifactFor('dictionary', passage.id) };
      const onGenerate = task => generate({ passage: [task], question: [] });
      return <div key={passage.id} className="cs-item-section">
        <Tabs value={passageTab} onChange={setPassageTab} items={[
          { value: 'source', label: 'Gốc' },
          { value: 'translation', label: 'Dịch' },
          { value: 'vocab', label: `Từ vựng${counts.vocab ? ` · ${counts.vocab}` : ''}` },
          { value: 'dictionary', label: `Từ điển${counts.dictionary ? ` · ${counts.dictionary}` : ''}` },
        ]} />
        {passageTab === 'source' && <SourcePanel segment={passage} />}
        {passageTab === 'translation' && <TranslationPanel key={tabArtifact.translation?.id || 'none'} artifact={tabArtifact.translation} shell={{ ...shell, onGenerate: () => onGenerate('translation') }} />}
        {passageTab === 'vocab' && <VocabPanel key={tabArtifact.vocab?.id || 'none'} artifact={tabArtifact.vocab} segment={passage} shell={{ ...shell, onGenerate: () => onGenerate('vocab') }} />}
        {passageTab === 'dictionary' && <DictionaryPanel key={tabArtifact.dictionary?.id || 'none'} artifact={tabArtifact.dictionary} shell={{ ...shell, onGenerate: () => onGenerate('dictionary') }} />}
      </div>;
    })}

    {activeView === 'questions' && (mode === 'learner'
      ? <LearnerPreview questions={questions} artifactsByQuestion={artifactsByQuestion} />
      : <div className="cs-item-section">
        {!Object.keys(artifactsByQuestion).length && !permissions.generate && <EmptyState title="Chưa có nội dung câu hỏi" />}
        {questions.map(question => <QuestionEditor key={question.id} question={question} artifact={artifactsByQuestion[question.id]}
          shell={{ ...shell, onGenerate: () => generate({ passage: [], question: tasks.question?.length ? tasks.question : ['translation', 'hint', 'explanation', 'note'] }) }} />)}
      </div>)}
  </PageFrame></div>;
}
