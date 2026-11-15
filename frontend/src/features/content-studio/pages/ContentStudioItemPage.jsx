import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button, ErrorState, PageFrame, Skeleton, StatusBadge, Tabs } from '../../../design-system-v2';
import { errorMessage, generateItem, getItem } from '../../../services/contentStudioService';
import { STATUS, isBusy } from '../item/ArtifactShell';
import { DictionaryPanel, TranslationPanel, VocabPanel } from '../item/PassagePanels';
import { QuestionEditor } from '../item/QuestionPanels';
import './ContentStudioPage.css';
import './ContentStudioItemPage.css';

const ITEM_STATUS = { draft: { tone: 'draft', label: 'Chưa tạo' }, ...STATUS };

export default function ContentStudioItemPage({ showMsg, permissions = {} }) {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(null);
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

  const hasPassage = passages.length > 0;
  const hasQuestions = questions.length > 0;
  const tab = activeTab || 'main';
  const passageShell = task => ({ ...shell, onGenerate: () => generate({ passage: [task], question: [] }) });
  const questionShell = { ...shell, onGenerate: () => generate({ passage: [], question: tasks.question?.length ? tasks.question : ['translation', 'hint', 'explanation', 'note'] }) };

  return <div className="iig3-list-screen cs-screen"><PageFrame
    className="cs-page cs-item-page"
    breadcrumb={[{ label: 'Content Studio' }, ...(item.folderPath || []).map(folder => ({ label: folder.name })), { label: item.title }]}
    header={<div className="cs-item-head">
      <Link className="cs-back" to="/content-studio"><ArrowLeft /> {back ? back.name : 'Content Studio'}</Link>
      <div className="cs-item-head__row">
        <h1>{item.title}</h1>
        <StatusBadge status={ITEM_STATUS[item.status]?.tone} label={ITEM_STATUS[item.status]?.label} />
        <span className="cs-item-head__meta">{[hasPassage && `${passages.length} đoạn văn`, hasQuestions && `${questions.length} câu hỏi${range ? ` (${range.from}–${range.to})` : ''}`].filter(Boolean).join(' · ')}</span>
        {permissions.generate && <Button icon={<Sparkles />} loading={generating} disabled={busy} onClick={() => generate(null)}>{busy ? 'Đang tạo…' : item.artifacts.length ? 'Tạo lại tất cả' : 'Tạo nội dung'}</Button>}
      </div>
    </div>}
  >
    <Tabs value={tab} onChange={setActiveTab} items={[
      { value: 'main', label: hasPassage && hasQuestions ? 'Dịch & câu hỏi' : hasPassage ? 'Dịch' : 'Câu hỏi' },
      ...(hasPassage ? [
        { value: 'vocab', label: `Từ vựng${counts.vocab ? ` · ${counts.vocab}` : ''}` },
        { value: 'dictionary', label: `Từ điển${counts.dictionary ? ` · ${counts.dictionary}` : ''}` },
      ] : []),
    ]} />

    {tab === 'main' && <div className={`cs-workspace${hasPassage && hasQuestions ? ' is-split' : ''}`}>
      {hasPassage && <div className="cs-workspace__passage">
        {passages.map(passage => <TranslationPanel key={artifactFor('passage_translation', passage.id)?.id || passage.id} artifact={artifactFor('passage_translation', passage.id)} shell={passageShell('translation')} />)}
      </div>}
      {hasQuestions && <div className="cs-workspace__questions">
        {questions.map(question => <QuestionEditor key={question.id} question={question} artifact={artifactsByQuestion[question.id]} shell={questionShell} />)}
      </div>}
    </div>}

    {tab === 'vocab' && passages.map(passage => <VocabPanel key={artifactFor('vocab', passage.id)?.id || passage.id} artifact={artifactFor('vocab', passage.id)} segment={passage} shell={passageShell('vocab')} />)}
    {tab === 'dictionary' && passages.map(passage => <DictionaryPanel key={artifactFor('dictionary', passage.id)?.id || passage.id} artifact={artifactFor('dictionary', passage.id)} shell={passageShell('dictionary')} />)}
  </PageFrame></div>;
}
