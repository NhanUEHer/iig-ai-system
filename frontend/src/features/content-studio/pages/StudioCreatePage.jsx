import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, FileText, Folder, List, Pencil,
  Sparkles, Upload,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../../design-system-v2';
import {
  createItem, detectDocx, detectText, errorMessage, generateItem, listFolders,
} from '../../../services/contentStudioService';
import { folderPathLabel } from '../folderTree';
import PickFolderDialog from '../components/PickFolderDialog';
import './StudioCreatePage.css';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const QUESTION_TASKS = ['translation', 'hint', 'explanation', 'note'];
const LEVELS = [450, 500, 650, 700, 800];
const MODES = [
  { value: 'balanced', label: 'Cân bằng' },
  { value: 'phrase_focused', label: 'Ưu tiên cụm từ' },
  { value: 'single_word_focused', label: 'Ưu tiên từ đơn' },
];
const DEFAULT_SELECTION = { vocab: true, dictionary: true, translation: true, questions: true };

const wordCount = text => text.trim() ? text.trim().split(/\s+/).length : 0;
const selectedCount = selection => Object.values(selection).filter(Boolean).length;

function TaskCards({ selection, setSelection, vocab, setVocab, compact = false, detection }) {
  const passage = detection?.segments?.find(segment => segment.kind === 'passage');
  const questions = detection?.segments?.flatMap(segment => segment.questions || []) || [];
  const sentenceCount = passage?.meta?.sentenceCount || 0;
  const toggleAll = event => {
    const checked = event.target.checked;
    setSelection({ vocab: checked, dictionary: checked, translation: checked, questions: checked });
  };
  const cards = [
    { key: 'vocab', title: 'Từ vựng', description: compact ? 'Cân bằng · đổi trong trang bài' : 'Từ trọng tâm theo level', count: `TOEIC ${vocab.level}` },
    { key: 'dictionary', title: 'Từ điển', description: 'Bóc từ → bạn duyệt → tạo', count: compact && sentenceCount ? `${sentenceCount} câu` : null },
    { key: 'translation', title: 'Dịch đoạn văn', description: compact ? '' : 'Câu tiếng Anh (câu tiếng Việt)', count: compact && sentenceCount ? `${sentenceCount} câu` : null },
    { key: 'questions', title: 'Câu hỏi', description: compact ? 'Dịch · Hint · Explanation · Note' : 'Dịch · Hint · Explanation · Note', count: compact && questions.length ? `${questions.length} câu` : null },
  ];
  return <section className={`cs-create-tasks${compact ? ' is-compact' : ''}`} aria-label="Nội dung cần tạo">
    <header><div><strong>Nội dung cần tạo</strong>{!compact && <span>Các phần chạy song song, độc lập</span>}</div>{compact && <label><input type="checkbox" checked={selectedCount(selection) === 4} onChange={toggleAll} />Chọn tất cả</label>}</header>
    <div>{cards.map(card => <label key={card.key} className={selection[card.key] ? 'is-selected' : ''}>
      <input type="checkbox" checked={selection[card.key]} onChange={() => setSelection(current => ({ ...current, [card.key]: !current[card.key] }))} />
      <span><strong>{card.title}</strong>{card.description && <small>{card.description}</small>}
        {!compact && card.key === 'vocab' && <span className="cs-create-tasks__vocab" onClick={event => event.stopPropagation()}>
          <select aria-label="Level" value={vocab.level} onChange={event => setVocab(current => ({ ...current, level: Number(event.target.value) }))}>{LEVELS.map(level => <option key={level} value={level}>TOEIC {level}</option>)}</select>
          <select aria-label="Mode" value={vocab.mode} onChange={event => setVocab(current => ({ ...current, mode: event.target.value }))}>{MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select>
        </span>}
      </span>{card.count && <b>{card.count}</b>}
    </label>)}</div>
  </section>;
}

function ReviewResults({ detection, onAnswer }) {
  const passageSegments = detection.segments.filter(segment => segment.kind === 'passage');
  const questions = detection.segments.flatMap(segment => segment.questions || []);
  const answered = questions.filter(question => question.answerKey).length;
  const questionSegment = detection.segments.find(segment => segment.kind === 'question_set');
  const part = questionSegment?.meta?.part;
  const kind = String(detection.title || '').split(' · ')[0];
  const detectionLabel = [part && `Part ${part}`, kind].filter(Boolean).join(' · ');
  return <section className="cs-create-review-results" aria-label="Kết quả nhận diện">
    <header><strong>Hệ thống nhận diện</strong>{detectionLabel && <span>{detectionLabel}</span>}{questions.length > 0 && <span className={answered === questions.length ? 'is-success' : 'is-warning'}>{answered}/{questions.length} câu có đáp án</span>}</header>
    {passageSegments.map((segment, index) => <article className="cs-create-passage" key={`passage-${index}`}>
      <div><strong>Đoạn văn</strong><span>{segment.meta?.sentenceCount || 0} câu văn · {wordCount(segment.text)} từ</span></div><p>{segment.text}</p>
    </article>)}
    <ol>{detection.segments.flatMap((segment, segmentIndex) => (segment.questions || []).map(question => ({ question, segmentIndex }))).map(({ question, segmentIndex }) => <li key={`${segmentIndex}-${question.number}`} className={!question.answerKey ? 'is-missing' : ''}>
      <div><span>{question.number}</span><strong>{question.stem || '(chưa có nội dung câu hỏi)'}</strong></div>
      <ul>{OPTION_LETTERS.map(letter => question.options?.[letter] && <li key={letter}><button type="button" className={question.answerKey === letter ? 'is-answer' : ''} onClick={() => onAnswer(segmentIndex, question.number, letter)}><b>{letter}</b><span>{question.options[letter]}</span>{question.answerKey === letter && <Check />}</button></li>)}</ul>
      {!question.answerKey && <p><AlertTriangle />Chưa có đáp án đúng — bấm vào một phương án để chọn</p>}
    </li>)}</ol>
  </section>;
}

export default function StudioCreatePage({ showMsg, permissions = {} }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState(searchParams.get('folderId') || null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [text, setText] = useState('');
  const [source, setSource] = useState({ kind: 'paste', fileName: null });
  const [detection, setDetection] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState(DEFAULT_SELECTION);
  const [vocab, setVocab] = useState({ level: 650, mode: 'balanced' });
  const fileInput = useRef(null);

  useEffect(() => {
    let active = true;
    listFolders().then(result => {
      if (!active) return;
      const next = result.folders || [];
      setFolders(next);
      if (folderId && !next.some(folder => folder.id === folderId)) setFolderId(null);
    }).catch(error => showMsg?.(errorMessage(error, 'Không thể tải danh sách thư mục.'), 'error'));
    return () => { active = false; };
    // The query-string default is intentionally read once for this draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const folderLabel = folderId ? folderPathLabel(folders, folderId) : 'Chưa phân loại';
  const chars = text.length;
  const words = wordCount(text);
  const canDetect = Boolean(text.trim()) && !detecting && permissions.edit !== false;
  const allQuestions = detection?.segments?.flatMap(segment => segment.questions || []) || [];
  const missingAnswers = allQuestions.filter(question => !question.answerKey);
  const passage = detection?.segments?.find(segment => segment.kind === 'passage');
  const completeOptions = allQuestions.filter(question => OPTION_LETTERS.every(letter => question.options?.[letter])).length;

  const applyDetection = result => {
    setDetection(result);
    if (!titleTouched) setTitle(result?.title || '');
    setStep(2);
  };
  const detect = async () => {
    if (!canDetect) return;
    setDetecting(true);
    try { applyDetection(await detectText(text.trim())); }
    catch (error) { showMsg?.(errorMessage(error, 'Không thể phân tách nội dung.'), 'error'); }
    finally { setDetecting(false); }
  };
  const processDocx = async file => {
    if (!file || !file.name.toLocaleLowerCase().endsWith('.docx')) { showMsg?.('Vui lòng chọn file DOCX.', 'error'); return; }
    setDetecting(true);
    try {
      const result = await detectDocx(file);
      setText(result.text); setSource({ kind: 'docx', fileName: result.fileName || file.name }); applyDetection(result.detection);
    } catch (error) { showMsg?.(errorMessage(error, 'Không thể đọc file DOCX.'), 'error'); }
    finally { setDetecting(false); }
  };
  const onFileInput = event => { const file = event.target.files?.[0]; event.target.value = ''; processDocx(file); };
  const changeText = event => { setText(event.target.value); setSource({ kind: 'paste', fileName: null }); setDetection(null); };
  const setAnswer = (segmentIndex, number, answerKey) => setDetection(current => ({ ...current, segments: current.segments.map((segment, index) => index === segmentIndex ? { ...segment, questions: segment.questions.map(question => question.number === number ? { ...question, answerKey } : question) } : segment) }));
  const tasks = useMemo(() => ({
    passage: [selection.translation && 'translation', selection.vocab && 'vocab', selection.dictionary && 'dictionary'].filter(Boolean),
    question: selection.questions ? QUESTION_TASKS : [],
    vocab,
  }), [selection, vocab]);
  const save = async andGenerate => {
    if (!detection || saving || !title.trim()) return;
    setSaving(true);
    try {
      const saved = await createItem({
        title: title.trim(), folderId, sourceText: text, sourceKind: source.kind, sourceFileName: source.fileName,
        segments: detection.segments, tasks,
      });
      if (andGenerate) {
        await generateItem(saved.id);
        showMsg?.('Đã lưu, đang tạo nội dung.', 'success');
        navigate(`/content-studio/items/${saved.id}?tab=vocab`);
      } else {
        showMsg?.('Đã lưu học liệu.', 'success');
        navigate(`/content-studio/folders/${folderId || 'unfiled'}`);
      }
    } catch (error) { showMsg?.(errorMessage(error, 'Không thể lưu học liệu.'), 'error'); }
    finally { setSaving(false); }
  };

  return <div className={`cs-create${step === 2 ? ' is-review' : ''}`}>
    <main>
      {step === 1 ? <>
        <div className="cs-create__topbar"><button type="button" onClick={() => navigate('/content-studio')}><ArrowLeft />Content Studio</button><span>/</span><span>Lưu vào</span><button type="button" className="cs-create__folder" onClick={() => setPickerOpen(true)}><Folder />{folderLabel}<ChevronDown /></button><i /><button type="button" className="cs-create__library-link" onClick={() => navigate(`/content-studio/folders/${folderId || 'unfiled'}`)}><List />Học liệu trong {folderId ? folders.find(folder => folder.id === folderId)?.name : 'Chưa phân loại'}</button></div>
        <div className="cs-create__intro"><h1>Tạo học liệu mới</h1><p>Dán đoạn văn và câu hỏi (kèm đáp án) hoặc tải file DOCX. Hệ thống tự nhận diện cấu trúc để bạn kiểm tra trước khi lưu.</p></div>
        <section className={`cs-create-source${dragging ? ' is-dragging' : ''}`} aria-label="Nội dung" onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); processDocx(event.dataTransfer.files?.[0]); }}>
          <header><label><span>Tên</span><input aria-label="Tên học liệu" placeholder="Tự đặt theo nội dung khi bạn dán" maxLength={240} value={title} onChange={event => { setTitle(event.target.value); setTitleTouched(true); }} /></label><input ref={fileInput} hidden type="file" accept=".docx" onChange={onFileInput} /><Button variant="outline" icon={<Upload />} loading={detecting && source.kind === 'docx'} onClick={() => fileInput.current?.click()}>Tải DOCX</Button></header>
          <textarea aria-label="Đoạn văn và câu hỏi" value={text} onChange={changeText} placeholder="Dán đoạn văn, câu hỏi và đáp án vào đây… hoặc kéo thả file .docx vào khung này" />
          <footer><span>{chars.toLocaleString('vi-VN')} ký tự · {words.toLocaleString('vi-VN')} từ</span>{source.fileName && <span><FileText />{source.fileName}</span>}<i /><span>Hỗ trợ:</span><b>Part 5</b><b>Part 6</b><b>Part 7 (đơn / kép)</b></footer>
        </section>
        <section className="cs-create-guides" aria-label="Cách dán nội dung"><div><strong>1 · Đoạn văn</strong>Dán nguyên văn. Có thể kèm dòng “Questions 1-4 refer to the following letter.” để hệ thống tự đặt tên.</div><div><strong>2 · Câu hỏi</strong>Mỗi câu bắt đầu bằng số (1. hoặc 147.), phương án (A)–(D) trên từng dòng hoặc cùng một dòng.</div><div><strong>3 · Đáp án</strong>“Answer key: 1B 2D 3B 4C” ở cuối, hoặc “Answer: B” dưới mỗi câu. Thiếu đáp án vẫn lưu được, sẽ có cảnh báo.</div></section>
        <TaskCards selection={selection} setSelection={setSelection} vocab={vocab} setVocab={setVocab} />
      </> : <>
        <div className="cs-create__review-crumb"><button type="button" onClick={() => navigate('/content-studio')}><ArrowLeft />Content Studio</button><span>/</span><span>Tạo học liệu mới</span><b>Bước 2/2 · Kiểm tra nhận diện</b></div>
        <div className="cs-create__review-title"><input aria-label="Tên học liệu" value={title} maxLength={240} onChange={event => { setTitle(event.target.value); setTitleTouched(true); }} /><button type="button" className="cs-create__folder" onClick={() => setPickerOpen(true)}><Folder />{folderLabel}<ChevronDown /></button></div>
        <details className="cs-create-collapsed-source"><summary><span><FileText /></span><strong>Văn bản đã {source.kind === 'docx' ? 'tải' : 'dán'} <small>· {chars.toLocaleString('vi-VN')} ký tự · {words.toLocaleString('vi-VN')} từ</small></strong><button type="button" onClick={event => { event.preventDefault(); setStep(1); }}><Pencil />Sửa văn bản</button></summary><pre>{text}</pre></details>
        <div className="cs-create-review-grid"><ReviewResults detection={detection} onAnswer={setAnswer} /><aside><TaskCards compact detection={detection} selection={selection} setSelection={setSelection} vocab={vocab} setVocab={setVocab} /><section className="cs-create-checks"><strong>Kiểm tra trước khi tạo</strong>{passage && <span className="is-good"><Check />Đoạn văn tách đúng {passage.meta?.sentenceCount || 0} câu</span>}{allQuestions.length > 0 && <span className={completeOptions === allQuestions.length ? 'is-good' : 'is-warn'}>{completeOptions === allQuestions.length ? <Check /> : <AlertTriangle />}{completeOptions}/{allQuestions.length} câu hỏi đủ 4 phương án</span>}{missingAnswers.length ? missingAnswers.map(question => <span className="is-warn" key={question.number}><AlertTriangle />Câu {question.number} chưa có đáp án đúng</span>) : allQuestions.length > 0 && <span className="is-good"><Check />Tất cả câu hỏi đã có đáp án</span>}</section></aside></div>
      </>}
    </main>
    <footer className="cs-create-sticky">{step === 1 ? <><span>{text.trim() ? 'Sẵn sàng phân tách để kiểm tra cấu trúc' : 'Dán nội dung để hệ thống nhận diện trước khi lưu'}</span><button type="button" onClick={() => navigate('/content-studio')}>Huỷ</button><Button icon={<Sparkles />} loading={detecting} disabled={!canDetect} onClick={detect}>Phân tách nội dung</Button></> : <><button type="button" onClick={() => setStep(1)}><ArrowLeft />Quay lại sửa văn bản</button><span>Lưu vào <strong>{folderLabel}</strong> · tạo <strong>{selectedCount(selection)} nội dung</strong>{selection.dictionary && ' · Từ điển dừng ở bước duyệt danh sách từ'}</span><Button variant="outline" loading={saving} disabled={!title.trim()} onClick={() => save(false)}>Chỉ lưu</Button><Button icon={<Sparkles />} loading={saving} disabled={!title.trim() || selectedCount(selection) === 0 || missingAnswers.length > 0 || permissions.generate === false} onClick={() => save(true)}>Xác nhận &amp; tạo nội dung</Button></>}
    </footer>
    <PickFolderDialog open={pickerOpen} currentFolderId={folderId} confirmLabel="Chọn" onConfirm={setFolderId} onClose={() => setPickerOpen(false)} />
  </div>;
}
