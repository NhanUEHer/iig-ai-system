import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button, ErrorState, PageFrame, SegmentedControl, Skeleton, StatusBadge } from '../../../design-system-v2';
import { errorMessage, generateItem, getItem } from '../../../services/contentStudioService';
import { STATUS, isBusy } from '../item/ArtifactShell';
import { DictionaryView, SourceView, TranslationView, VocabView } from '../item/PassagePanels';
import { QuestionEditor } from '../item/QuestionPanels';
import './ContentStudioPage.css';
import './ContentStudioItemPage.css';

const ITEM_STATUS = { draft: { tone: 'draft', label: 'Chưa tạo' }, ...STATUS };

export default function ContentStudioItemPage({ showMsg, permissions = {} }) {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('source');
  const [openQuestionId, setOpenQuestion] = useState(undefined);
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
  const openQuestion = openQuestionId === undefined ? questions[0]?.id : openQuestionId;
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
    <div className={`cs-hub${hasPassage && hasQuestions ? ' is-split' : ''}`}>
      {hasPassage && <section className="cs-hub__col cs-hub__passage" aria-label="Đoạn văn">
        <header className="cs-hub__head">
          <strong>Đoạn văn</strong>
          <SegmentedControl value={mode} onChange={setMode} options={[
            { value: 'source', label: 'Gốc' },
            { value: 'translation', label: 'Dịch' },
            { value: 'vocab', label: 'Từ vựng', count: counts.vocab || undefined },
            { value: 'dictionary', label: 'Từ điển', count: counts.dictionary || undefined },
          ]} />
        </header>
        <div className="cs-hub__body">
          {passages.map(passage => <div key={passage.id} className="cs-hub__block">
            {mode === 'source' && <SourceView segment={passage} />}
            {mode === 'translation' && <TranslationView key={artifactFor('passage_translation', passage.id)?.id || 'none'} artifact={artifactFor('passage_translation', passage.id)} shell={passageShell('translation')} />}
            {mode === 'vocab' && <VocabView key={artifactFor('vocab', passage.id)?.id || 'none'} artifact={artifactFor('vocab', passage.id)} segment={passage} shell={passageShell('vocab')} />}
            {mode === 'dictionary' && <DictionaryView key={artifactFor('dictionary', passage.id)?.id || 'none'} artifact={artifactFor('dictionary', passage.id)} shell={passageShell('dictionary')} />}
          </div>)}
        </div>
      </section>}
      {hasQuestions && <section className="cs-hub__col cs-hub__questions" aria-label="Câu hỏi">
        <header className="cs-hub__head">
          <strong>Câu hỏi{range ? ` ${range.from}–${range.to}` : ''}</strong>
          <span className="cs-muted">{questions.filter(question => artifactsByQuestion[question.id]?.status === 'ready').length}/{questions.length} hoàn tất</span>
        </header>
        <div className="cs-hub__body">
          {questions.map(question => <QuestionEditor key={question.id} question={question} artifact={artifactsByQuestion[question.id]} shell={questionShell}
            open={openQuestion === question.id} onToggle={() => setOpenQuestion(current => (current === question.id ? null : question.id))} />)}
        </div>
      </section>}
    </div>
  </PageFrame></div>;
}
