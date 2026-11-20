import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, FileText, Folder, ImagePlus, List, Loader2, Pencil,
  RotateCcw, Sparkles, Upload, X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../../design-system-v2';
import {
  createItem, detectDocx, detectText, errorMessage, generateItem, listFolders, uploadImage,
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

const PASSAGE_TASK_KEYS = ['vocab', 'dictionary', 'translation'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
let imageSeq = 0;

// Word cannot embed WEBP: convert it to PNG in the browser before upload (PNG/JPG go as they are).
async function toUploadable(file) {
  if (file.type !== 'image/webp') return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(result => (result ? resolve(result) : reject(new Error('Không chuyển được ảnh WEBP.'))), 'image/png'));
  return new File([blob], file.name.replace(/\.webp$/i, '') + '.png', { type: 'image/png' });
}

const isImageFile = file => IMAGE_TYPES.includes(file?.type);
const isDocxFile = file => Boolean(file?.name?.toLocaleLowerCase().endsWith('.docx'));
// Part 2 has three options (A–C); everything else has four.
const expectedOptions = segment => (segment?.meta?.part === 2 ? 3 : 4);

// Every place an image can be attached once the text has been split.
function imageTargets(detection) {
  const targets = [];
  (detection?.segments || []).forEach((segment, segmentIndex) => {
    const questions = segment.questions || [];
    if (segment.kind !== 'question_set' || !questions.length) return;
    const first = questions[0].number;
    const last = questions[questions.length - 1].number;
    targets.push({ value: `${segmentIndex}`, label: first === last ? `Nhóm câu ${first}` : `Nhóm câu ${first}–${last} (cả nhóm)` });
    for (const question of questions) targets.push({ value: `${segmentIndex}:${question.number}`, label: `Câu ${question.number}` });
  });
  return targets;
}

// Part 1: one photo per question, in order. Otherwise a single question set takes the graphic.
function suggestTargets(detection, images) {
  const sets = (detection?.segments || []).map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.kind === 'question_set' && segment.questions?.length);
  const part1 = sets.filter(({ segment }) => segment.meta?.part === 1)
    .flatMap(({ segment, index }) => segment.questions.map(question => `${index}:${question.number}`));
  const valid = new Set(imageTargets(detection).map(target => target.value));
  return images.map((image, position) => {
    if (image.target && valid.has(image.target)) return image;
    if (part1.length) return { ...image, target: part1[position] || '' };
    return { ...image, target: sets.length === 1 ? `${sets[0].index}` : '' };
  });
}

const parseTarget = target => {
  if (!target) return { segmentIndex: null, questionNumber: null };
  const [segmentIndex, questionNumber] = target.split(':');
  return { segmentIndex: Number(segmentIndex), questionNumber: questionNumber == null ? null : Number(questionNumber) };
};

function ImageStrip({ images, onRemove, onRetry, targets, onTarget }) {
  if (!images.length) return null;
  return <div className="cs-create-images" aria-label="Ảnh đính kèm">{images.map((image, index) => <figure key={image.id} className={`is-${image.status}`}>
    <img src={image.preview} alt={`Ảnh ${index + 1}`} />
    {image.status === 'uploading' && <span className="cs-create-images__state"><Loader2 className="is-spinning" /></span>}
    {image.status === 'error' && <button type="button" className="cs-create-images__state" title={image.error || 'Tải ảnh thất bại'} onClick={() => onRetry(image.id)}><RotateCcw /></button>}
    <button type="button" className="cs-create-images__remove" aria-label={`Xoá ảnh ${index + 1}`} onClick={() => onRemove(image.id)}><X /></button>
    {targets && <select aria-label={`Gắn ảnh ${index + 1} vào`} value={image.target || ''} onChange={event => onTarget(image.id, event.target.value)}>
      <option value="">Cả học liệu</option>
      {targets.map(target => <option key={target.value} value={target.value}>{target.label}</option>)}
    </select>}
  </figure>)}</div>;
}

const wordCount = text => text.trim() ? text.trim().split(/\s+/).length : 0;
const selectedCount = selection => Object.values(selection).filter(Boolean).length;

function TaskCards({ selection, setSelection, vocab, setVocab, hasPassage = true }) {
  const cards = [
    { key: 'vocab', title: 'Từ vựng' },
    { key: 'dictionary', title: 'Từ điển' },
    { key: 'translation', title: 'Dịch đoạn văn' },
    { key: 'questions', title: 'Câu hỏi' },
  ];
  return <section className="cs-create-tasks" aria-label="Nội dung cần tạo">
    <strong className="cs-create-tasks__title">Nội dung cần tạo</strong>
    {!hasPassage && <p className="cs-create-tasks__hint">Không có đoạn văn — chỉ tạo nội dung cho câu hỏi.</p>}
    <div className="cs-create-tasks__options">{cards.map(card => { const disabled = !hasPassage && PASSAGE_TASK_KEYS.includes(card.key); const checked = selection[card.key] && !disabled; return <div key={card.key} className={`cs-create-tasks__item${card.key === 'vocab' ? ' is-vocab' : ''}`}>
      <label className={`cs-create-tasks__pill${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => setSelection(current => ({ ...current, [card.key]: !current[card.key] }))} />
        <span>{card.title}</span>
      </label>
      {card.key === 'vocab' && checked && <span className="cs-create-tasks__vocab">
        <select aria-label="Level" value={vocab.level} onChange={event => setVocab(current => ({ ...current, level: Number(event.target.value) }))}>{LEVELS.map(level => <option key={level} value={level}>TOEIC {level}</option>)}</select>
        <select aria-label="Mode" value={vocab.mode} onChange={event => setVocab(current => ({ ...current, mode: event.target.value }))}>{MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select>
      </span>}
    </div>; })}</div>
  </section>;
}

function ReviewResults({ detection, onAnswer, images = [] }) {
  const passageSegments = detection.segments.filter(segment => segment.kind === 'passage');
  const questions = detection.segments.flatMap(segment => segment.questions || []);
  const answered = questions.filter(question => question.answerKey).length;
  const questionSegment = detection.segments.find(segment => segment.kind === 'question_set');
  const part = questionSegment?.meta?.part;
  const kind = String(detection.title || '').split(' · ')[0];
  const detectionLabel = [part && `Part ${part}`, kind].filter(Boolean).join(' · ');
  const imagesFor = target => images.filter(image => image.target === target);
  const thumbs = list => list.length > 0 && <div className="cs-create-review-images">{list.map(image => <img key={image.id} src={image.preview} alt="Ảnh đính kèm" />)}</div>;
  return <section className="cs-create-review-results" aria-label="Kết quả nhận diện">
    <header><strong>Hệ thống nhận diện</strong>{detectionLabel && <span>{detectionLabel}</span>}{questions.length > 0 && <span className={answered === questions.length ? 'is-success' : 'is-warning'}>{answered}/{questions.length} câu có đáp án</span>}</header>
    {!passageSegments.length && questions.length > 0 && <p className="cs-create-review-results__note">Không có đoạn văn — chỉ nhận diện câu hỏi.</p>}
    {detection.segments.map((segment, segmentIndex) => segment.kind === 'question_set' && thumbs(imagesFor(`${segmentIndex}`)) && <div key={`set-images-${segmentIndex}`} className="cs-create-review-set-images"><strong>Hình cho nhóm câu</strong>{thumbs(imagesFor(`${segmentIndex}`))}</div>)}
    {passageSegments.map((segment, index) => <article className="cs-create-passage" key={`passage-${index}`}>
      <div><strong>Đoạn văn</strong><span>{segment.meta?.sentenceCount || 0} câu văn · {wordCount(segment.text)} từ</span></div><p>{segment.text}</p>
    </article>)}
    <ol>{detection.segments.flatMap((segment, segmentIndex) => (segment.questions || []).map(question => ({ question, segmentIndex }))).map(({ question, segmentIndex }) => <li key={`${segmentIndex}-${question.number}`} className={!question.answerKey ? 'is-missing' : ''}>
      <div><span>{question.number}</span><strong>{question.stem || (detection.segments[segmentIndex]?.meta?.part === 1 ? '(Mô tả tranh — chỉ có phương án)' : '(chưa có nội dung câu hỏi)')}</strong></div>
      {thumbs(imagesFor(`${segmentIndex}:${question.number}`))}
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
  const imageInput = useRef(null);
  const [images, setImages] = useState([]);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => imagesRef.current.forEach(image => URL.revokeObjectURL(image.preview)), []);

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
  const hasPassage = Boolean(passage);
  const effectiveSelection = hasPassage ? selection : { ...selection, vocab: false, dictionary: false, translation: false };
  const questionSets = detection?.segments?.filter(segment => segment.kind === 'question_set') || [];
  const completeOptions = questionSets.reduce((sum, segment) => sum + (segment.questions || [])
    .filter(question => OPTION_LETTERS.slice(0, expectedOptions(segment)).every(letter => question.options?.[letter])).length, 0);
  const optionLabel = questionSets.length && questionSets.every(segment => expectedOptions(segment) === 3) ? '3' : questionSets.some(segment => expectedOptions(segment) === 3) ? 'đủ' : '4';
  const imagesUploading = images.some(image => image.status === 'uploading');
  const imagesFailed = images.filter(image => image.status === 'error').length;
  const targets = useMemo(() => imageTargets(detection), [detection]);

  const startUpload = id => {
    const entry = imagesRef.current.find(image => image.id === id);
    if (!entry) return;
    setImages(current => current.map(image => image.id === id ? { ...image, status: 'uploading', error: null } : image));
    toUploadable(entry.file).then(uploadImage)
      .then(uploaded => setImages(current => current.map(image => image.id === id ? { ...image, status: 'done', uploaded } : image)))
      .catch(error => setImages(current => current.map(image => image.id === id ? { ...image, status: 'error', error: errorMessage(error, 'Không thể tải ảnh.') } : image)));
  };
  const addImages = files => {
    const list = [...(files || [])].filter(isImageFile);
    if (!list.length) return;
    const room = MAX_IMAGES - imagesRef.current.length;
    if (room <= 0) { showMsg?.(`Tối đa ${MAX_IMAGES} ảnh cho một học liệu.`, 'error'); return; }
    const tooLarge = list.filter(file => file.size > MAX_IMAGE_BYTES);
    if (tooLarge.length) showMsg?.('Ảnh tối đa 5 MB — đã bỏ qua ảnh quá lớn.', 'error');
    const accepted = list.filter(file => file.size <= MAX_IMAGE_BYTES).slice(0, room);
    const entries = accepted.map(file => ({ id: `img-${imageSeq += 1}`, file, preview: URL.createObjectURL(file), status: 'uploading', error: null, uploaded: null, target: '' }));
    const next = [...imagesRef.current, ...entries];
    imagesRef.current = next;
    setImages(detection ? suggestTargets(detection, next) : next);
    entries.forEach(entry => startUpload(entry.id));
  };
  const removeImage = id => setImages(current => {
    const found = current.find(image => image.id === id);
    if (found) URL.revokeObjectURL(found.preview);
    return current.filter(image => image.id !== id);
  });
  const setImageTarget = (id, target) => setImages(current => current.map(image => image.id === id ? { ...image, target } : image));
  const onPaste = event => {
    const files = [...(event.clipboardData?.files || [])].filter(isImageFile);
    if (!files.length) return;
    // Screenshots arrive as files with no text; keep normal text paste when both are present.
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    addImages(files);
  };
  const onDropFiles = fileList => {
    const files = [...(fileList || [])];
    const docx = files.find(isDocxFile);
    const imageFiles = files.filter(isImageFile);
    if (docx) processDocx(docx);
    if (imageFiles.length) addImages(imageFiles);
    if (!docx && !imageFiles.length && files.length) showMsg?.('Chỉ hỗ trợ file DOCX hoặc ảnh PNG, JPG, WEBP.', 'error');
  };

  const applyDetection = result => {
    setDetection(result);
    // A new detection can renumber sets: re-suggest every target instead of keeping old index-based ones.
    setImages(current => suggestTargets(result, current.map(image => ({ ...image, target: '' }))));
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
    if (!isDocxFile(file)) { showMsg?.('Vui lòng chọn file DOCX.', 'error'); return; }
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
    passage: [effectiveSelection.translation && 'translation', effectiveSelection.vocab && 'vocab', effectiveSelection.dictionary && 'dictionary'].filter(Boolean),
    question: effectiveSelection.questions ? QUESTION_TASKS : [],
    vocab,
  }), [effectiveSelection.translation, effectiveSelection.vocab, effectiveSelection.dictionary, effectiveSelection.questions, vocab]);
  const save = async andGenerate => {
    if (!detection || saving || !title.trim() || imagesUploading) return;
    setSaving(true);
    try {
      const saved = await createItem({
        title: title.trim(), folderId, sourceText: text, sourceKind: source.kind, sourceFileName: source.fileName,
        segments: detection.segments, tasks,
        images: images.filter(image => image.status === 'done').map(image => ({ ...image.uploaded, ...parseTarget(image.target) })),
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
        <div className="cs-create__head">
          <nav className="cs-create__crumb"><button type="button" onClick={() => navigate('/content-studio')}>Content Studio</button><span>/</span><span>Tạo học liệu mới</span></nav>
          <div className="cs-create__head-row"><h1>Tạo học liệu mới</h1><i /><button type="button" className="cs-create__folder" onClick={() => setPickerOpen(true)}><Folder />Lưu vào: <strong>{folderLabel}</strong><ChevronDown /></button><button type="button" className="cs-create__library-link" onClick={() => navigate(`/content-studio/folders/${folderId || 'unfiled'}`)}><List />Học liệu trong {folderLabel}</button></div>
        </div>
        <section className={`cs-create-source${dragging ? ' is-dragging' : ''}`} aria-label="Nội dung" onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onPaste={onPaste} onDrop={event => { event.preventDefault(); setDragging(false); onDropFiles(event.dataTransfer.files); }}>
          <header><label className="cs-create__title-field"><span>Tên học liệu <em>*</em></span><input aria-label="Tên học liệu" placeholder="Tự đặt theo nội dung khi bạn dán" maxLength={240} value={title} onChange={event => { setTitle(event.target.value); setTitleTouched(true); }} /></label><input ref={fileInput} hidden type="file" accept=".docx" onChange={onFileInput} /><Button variant="outline" icon={<Upload />} loading={detecting && source.kind === 'docx'} onClick={() => fileInput.current?.click()}>Tải DOCX</Button><input ref={imageInput} hidden type="file" multiple accept={IMAGE_TYPES.join(',')} onChange={event => { const files = event.target.files; addImages(files); event.target.value = ''; }} /><Button variant="outline" icon={<ImagePlus />} onClick={() => imageInput.current?.click()}>Tải ảnh</Button></header>
          <textarea aria-label="Đoạn văn và câu hỏi" value={text} onChange={changeText} placeholder="Dán đoạn văn (nếu có), câu hỏi và đáp án vào đây… Dán ảnh (Ctrl+V) hoặc kéo thả file .docx / ảnh vào khung này" />
          <ImageStrip images={images} onRemove={removeImage} onRetry={startUpload} />
          <footer><span>{chars.toLocaleString('vi-VN')} ký tự · {words.toLocaleString('vi-VN')} từ{images.length > 0 && ` · ${images.length} ảnh`}</span></footer>
        </section>
      </> : <>
        <div className="cs-create__head">
          <nav className="cs-create__crumb"><button type="button" onClick={() => navigate('/content-studio')}>Content Studio</button><span>/</span><button type="button" onClick={() => setStep(1)}>Tạo học liệu mới</button><span>/</span><span>Kiểm tra nhận diện</span></nav>
          <div className="cs-create__head-row"><h1>Kiểm tra nhận diện</h1><i /><button type="button" className="cs-create__folder" onClick={() => setPickerOpen(true)}><Folder />Lưu vào: <strong>{folderLabel}</strong><ChevronDown /></button></div>
        </div>
        <section className="cs-create-source cs-create-source--title"><header><label className="cs-create__title-field"><span>Tên học liệu <em>*</em></span><input aria-label="Tên học liệu" placeholder="Đặt tên cho học liệu" value={title} maxLength={240} onChange={event => { setTitle(event.target.value); setTitleTouched(true); }} /></label></header>
        <details className="cs-create-collapsed-source"><summary><span><FileText /></span><strong>Văn bản đã {source.kind === 'docx' ? 'tải' : 'dán'} <small>· {chars.toLocaleString('vi-VN')} ký tự · {words.toLocaleString('vi-VN')} từ</small></strong><button type="button" onClick={event => { event.preventDefault(); setStep(1); }}><Pencil />Sửa văn bản</button></summary><pre>{text}</pre></details></section>
        <div className="cs-create-review-grid"><ReviewResults detection={detection} onAnswer={setAnswer} images={images} /><aside><TaskCards selection={selection} setSelection={setSelection} vocab={vocab} setVocab={setVocab} hasPassage={hasPassage} />{images.length > 0 && <section className="cs-create-attach"><strong>Ảnh đính kèm</strong><small>Gắn mỗi ảnh vào một câu hoặc cả nhóm câu dùng chung hình.</small><ImageStrip images={images} onRemove={removeImage} onRetry={startUpload} targets={targets} onTarget={setImageTarget} /></section>}<section className="cs-create-checks"><strong>Kiểm tra trước khi tạo</strong>{passage && <span className="is-good"><Check />Đoạn văn tách đúng {passage.meta?.sentenceCount || 0} câu</span>}{allQuestions.length > 0 && <span className={completeOptions === allQuestions.length ? 'is-good' : 'is-warn'}>{completeOptions === allQuestions.length ? <Check /> : <AlertTriangle />}{completeOptions}/{allQuestions.length} câu hỏi {optionLabel === 'đủ' ? 'đủ' : `đủ ${optionLabel}`} phương án</span>}{imagesUploading && <span className="is-warn"><Loader2 className="is-spinning" />Đang tải ảnh lên…</span>}{imagesFailed > 0 && <span className="is-warn"><AlertTriangle />{imagesFailed} ảnh tải lỗi — sẽ không được lưu</span>}{missingAnswers.length ? missingAnswers.map(question => <span className="is-warn" key={question.number}><AlertTriangle />Câu {question.number} chưa có đáp án đúng</span>) : allQuestions.length > 0 && <span className="is-good"><Check />Tất cả câu hỏi đã có đáp án</span>}</section></aside></div>
      </>}
    </main>
    <footer className="cs-create-sticky">{step === 1 ? <><span>{text.trim() ? 'Sẵn sàng phân tách để kiểm tra cấu trúc' : 'Dán nội dung để hệ thống nhận diện trước khi lưu'}</span><button type="button" onClick={() => navigate('/content-studio')}>Huỷ</button><Button icon={<Sparkles />} loading={detecting} disabled={!canDetect} onClick={detect}>Phân tách nội dung</Button></> : <><button type="button" onClick={() => setStep(1)}><ArrowLeft />Quay lại sửa văn bản</button><span /><Button variant="outline" loading={saving} disabled={!title.trim() || imagesUploading} onClick={() => save(false)}>Chỉ lưu</Button><Button icon={<Sparkles />} loading={saving} disabled={!title.trim() || imagesUploading || selectedCount(effectiveSelection) === 0 || missingAnswers.length > 0 || permissions.generate === false} onClick={() => save(true)}>Xác nhận &amp; tạo nội dung</Button></>}
    </footer>
    <PickFolderDialog open={pickerOpen} currentFolderId={folderId} confirmLabel="Chọn" onConfirm={setFolderId} onClose={() => setPickerOpen(false)} />
  </div>;
}
