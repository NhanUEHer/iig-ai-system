import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ChevronUp, CircleHelp, FileText, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Breadcrumb, Button, FormField, Input, Tabs, Textarea } from '../../components/ui';
import MultiSelectFilter from '../../components/ui/MultiSelectFilter';
import RichTextEditor from '../../components/common/RichTextEditor';
import MediaUploader from '../../components/common/MediaUploader';
import McqQuestionEditor from '../question-bank/components/McqQuestionEditor';
import RecordQuestionEditor from '../question-bank/components/RecordQuestionEditor';
import { useDialog } from '../../components/feedback/dialogContext';
import {
  getQuestion, getQuestionMediaUrl, listQuestionContents, listQuestionGroups, listSubQuestions,
  removeSubQuestionAudio, saveQuestionContents, saveSubQuestions,
  updateQuestion, uploadSubQuestionAudio,
} from '../../services/questionBankService';
import { apiError, clientId, QUESTION_STATUSES, QUESTION_TYPES, statusLabel } from './constants';
import MediaField from './MediaField';
import './question-management.css';
import '../question-bank/pages/QuestionBankEditPage.css';

const blankContent = () => ({ clientId: clientId('content'), title: '', scriptHtml: '', contentHtml: '', translationHtml: '' });
const blankOption = (correct = false) => ({ clientId: clientId('option'), optionText: '', isCorrect: correct });
const blankSubQuestion = type => ({
  clientId: clientId('sub'), questionText: '', instructionHtml: '', hintHtml: '', explanationHtml: '', note: '',
  preparationDurationSeconds: type === 'RECORD' ? 0 : null,
  recordingDurationSeconds: type === 'RECORD' ? 60 : null,
  maxCharacterCount: type === 'WRITING' ? 2500 : null,
  minWordCount: type === 'WRITING' ? 0 : null,
  options: type === 'MCQ_SINGLE' ? [blankOption(true), blankOption(false)] : [],
});
const move = (items, index, direction) => { const target = index + direction; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; };

export default function QuestionEditPage({ navigate, showMsg }) {
  const { id } = useParams();
  const { confirm } = useDialog();
  const [tab, setTab] = useState('content');
  const [question, setQuestion] = useState(null);
  const [persistedStatus, setPersistedStatus] = useState('DRAFT');
  const [groups, setGroups] = useState([]);
  const [contents, setContents] = useState([]);
  const [subQuestions, setSubQuestions] = useState([]);
  const [mediaUrls, setMediaUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const showMsgRef = useRef(showMsg);
  const locked = persistedStatus === 'ACTIVE';
  useEffect(() => { showMsgRef.current = showMsg; }, [showMsg]);

  const resolveUrls = useCallback(async (contentItems, subItems) => {
    const ids = new Set();
    contentItems.forEach(item => [item.audioMediaId, item.imageMediaId, item.videoMediaId].filter(Boolean).forEach(value => ids.add(value)));
    subItems.forEach(item => item.audioMediaId && ids.add(item.audioMediaId));
    const entries = await Promise.all([...ids].map(async mediaId => {
      try { const response = await getQuestionMediaUrl(mediaId); return [mediaId, response.data?.url || '']; } catch { return [mediaId, '']; }
    }));
    setMediaUrls(Object.fromEntries(entries));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [questionResponse, groupsResponse, contentResponse, subResponse] = await Promise.all([getQuestion(id), listQuestionGroups(), listQuestionContents(id), listSubQuestions(id)]);
      const nextQuestion = questionResponse.data;
      const contentItems = contentResponse.data || [];
      const subItems = subResponse.data || [];
      setQuestion(nextQuestion); setPersistedStatus(nextQuestion.status); setGroups(groupsResponse.data || []); setContents(contentItems); setSubQuestions(subItems);
      await resolveUrls(contentItems, subItems);
    } catch (error) { showMsgRef.current?.(apiError(error, 'Không thể tải câu hỏi.'), 'error'); }
    finally { setLoading(false); }
  }, [id, resolveUrls]);
  useEffect(() => { load(); }, [load]);

  const patchQuestion = (key, value) => setQuestion(current => ({ ...current, [key]: value }));
  const saveGeneral = async event => {
    event.preventDefault();
    try { setSaving('general'); const response = await updateQuestion(id, { questionName: question.questionName, groupId: question.groupId, note: question.note, status: question.status }); setQuestion(response.data); setPersistedStatus(response.data.status); showMsg?.('Đã cập nhật thông tin câu hỏi.', 'success'); }
    catch (error) { showMsg?.(apiError(error, 'Không thể cập nhật câu hỏi.'), 'error'); }
    finally { setSaving(''); }
  };
  const patchContent = (key, field, value) => setContents(items => items.map(item => (item.id || item.clientId) === key ? { ...item, [field]: value } : item));
  const saveContents = async () => {
    if (contents.some(item => !String(item.title || '').trim())) { showMsg?.('Tiêu đề Content là bắt buộc.', 'error'); return; }
    try { setSaving('content'); const response = await saveQuestionContents(id, contents.map(({ clientId: _clientId, ...item }) => item)); const items = response.data || []; setContents(items); await resolveUrls(items, subQuestions); showMsg?.('Đã lưu toàn bộ nội dung.', 'success'); }
    catch (error) { showMsg?.(apiError(error, 'Không thể lưu nội dung.'), 'error'); }
    finally { setSaving(''); }
  };
  const removeContent = async index => {
    if (!await confirm({ title: 'Xóa nội dung?', message: 'Nội dung sẽ được xóa khi bạn bấm Lưu nội dung.', confirmText: 'Xóa' })) return;
    setContents(items => items.filter((_item, itemIndex) => itemIndex !== index));
  };
  const patchSub = (key, field, value) => setSubQuestions(items => items.map(item => (item.id || item.clientId) === key ? { ...item, [field]: value } : item));
  const patchOption = (subKey, optionIndex, patch) => setSubQuestions(items => items.map(item => {
    if ((item.id || item.clientId) !== subKey) return item;
    return { ...item, options: item.options.map((option, index) => index === optionIndex ? { ...option, ...patch } : (patch.isCorrect ? { ...option, isCorrect: false } : option)) };
  }));
  const saveQuestions = async () => {
    try { setSaving('questions'); const payload = subQuestions.map(({ clientId: _clientId, options = [], ...item }) => ({ ...item, options: options.map(({ clientId: _optionClientId, ...option }) => option) })); const response = await saveSubQuestions(id, payload); const items = response.data || []; setSubQuestions(items); await resolveUrls(contents, items); showMsg?.('Đã lưu toàn bộ câu hỏi con.', 'success'); }
    catch (error) { showMsg?.(apiError(error, 'Không thể lưu câu hỏi con.'), 'error'); }
    finally { setSaving(''); }
  };
  if (loading || !question) return <div className="qm-loading">Đang tải dữ liệu…</div>;
  return <section className="qm-editor-page">
    <header className="qm-editor-topbar"><Breadcrumb separator={<ChevronRight />} items={[{ label: 'Ngân hàng câu hỏi' }, { label: 'Cập nhật câu hỏi', current: true }]} /></header>
    <main className="qm-editor-main qm-create-main">
      <form className="qm-form-card qm-create-card qm-edit-card" onSubmit={saveGeneral}>
        <header className="qm-card-header"><div><h1>Thông tin câu hỏi</h1><span className={`qm-status is-${String(question.status).toLowerCase()}`}><i />{statusLabel(question.status)}</span></div><code>{question.code}</code></header>
        <div className="qm-card-body"><div className="qm-create-grid qm-create-grid--primary">
          <FormField id="qm-edit-name" label="Tên câu hỏi" required><Input id="qm-edit-name" size="sm" value={question.questionName || ''} maxLength={240} onChange={event => patchQuestion('questionName', event.target.value)} /></FormField>
          <FormField id="qm-edit-status" label="Trạng thái" required><MultiSelectFilter single className="qm-single-select qm-status-select" value={question.status} onApply={value => patchQuestion('status', value)} options={QUESTION_STATUSES} placeholder="Chọn trạng thái" searchPlaceholder="Tìm trạng thái..." /></FormField>
        </div><div className="qm-create-grid">
          <FormField id="qm-edit-group" label="Nhóm câu hỏi" required><MultiSelectFilter single className="qm-single-select qm-group-select" value={question.groupId || ''} onApply={value => patchQuestion('groupId', value)} options={groups.map(group => ({ value: group.id, label: group.name }))} placeholder="Chọn nhóm câu hỏi" searchPlaceholder="Tìm nhóm câu hỏi..." /></FormField>
          <FormField id="qm-edit-type" label="Dạng câu hỏi"><MultiSelectFilter single disabled className="qm-single-select qm-type-select" value={question.questionType} options={QUESTION_TYPES} placeholder="Chọn dạng câu hỏi" /></FormField>
        </div><FormField label="Ghi chú nội bộ" hint={`${(question.note || '').length}/500 ký tự`}><Textarea rows={3} maxLength={500} value={question.note || ''} onChange={event => patchQuestion('note', event.target.value)} /></FormField></div>
        <footer className="qm-form-footer"><Button type="button" size="sm" variant="secondary" onClick={load}>Hủy</Button><Button type="submit" size="sm" icon={<Check />} loading={saving === 'general'}>Lưu</Button></footer>
      </form>

      <section className="qm-builder-card">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'content', label: <><FileText />Nội dung</> }, { value: 'questions', label: <><CircleHelp />Câu hỏi</> }]} />
        {locked && <div className="qm-lock-note">Câu hỏi đang hoạt động. Chuyển sang “Dừng hoạt động” và lưu thông tin trước khi chỉnh sửa.</div>}
        {tab === 'content' ? <ContentTab questionId={id} items={contents} setItems={setContents} patch={patchContent} remove={removeContent} locked={locked} saving={saving === 'content'} save={saveContents} mediaUrls={mediaUrls} setMediaUrls={setMediaUrls} showMsg={showMsg} />
          : <QuestionsTab questionId={id} type={question.questionType} items={subQuestions} setItems={setSubQuestions} patch={patchSub} patchOption={patchOption} locked={locked} saving={saving === 'questions'} save={saveQuestions} mediaUrls={mediaUrls} setMediaUrls={setMediaUrls} showMsg={showMsg} confirm={confirm} />}
      </section>
    </main>
  </section>;
}

function OrderButtons({ index, total, onMove, disabled }) { return <div className="qm-order-buttons"><button type="button" disabled={disabled || index === 0} onClick={() => onMove(-1)} aria-label="Di chuyển lên"><ChevronUp /></button><button type="button" disabled={disabled || index === total - 1} onClick={() => onMove(1)} aria-label="Di chuyển xuống"><ChevronDown /></button></div>; }

function ContentTab({ questionId, items, setItems, patch, remove, locked, saving, save, mediaUrls, setMediaUrls, showMsg }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const finishDrag = () => { setDraggedIndex(null); setDropIndex(null); };
  const dropContent = targetIndex => {
    if (draggedIndex === null || draggedIndex === targetIndex) { finishDrag(); return; }
    setItems(current => { const next = [...current]; const [dragged] = next.splice(draggedIndex, 1); next.splice(targetIndex, 0, dragged); return next; });
    finishDrag();
  };
  const toggle = key => setCollapsed(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return <div className="qm-tab-panel"><header className="qm-tab-heading question-bank-edit-section-title"><div><h2>Nội dung câu hỏi</h2></div><Button className="question-content-add" size="sm" icon={<Plus />} disabled={locked} onClick={() => setItems(current => [...current, blankContent()])}>Thêm nội dung</Button></header>
    {!items.length && <div className="qm-empty question-content-empty"><FileText /><strong>Chưa có nội dung</strong><span>Thêm nội dung đầu tiên để bắt đầu biên soạn.</span></div>}
    <div className="qm-editor-stack">{items.map((item, index) => { const key = item.id || item.clientId; const expanded = !collapsed.has(key); return <article className={`question-content-editor ${draggedIndex === index ? 'is-dragging' : ''} ${dropIndex === index && draggedIndex !== index ? 'is-drop-target' : ''}`} key={key} onDragOver={event => { if (locked || draggedIndex === null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropIndex(index); }} onDrop={event => { event.preventDefault(); dropContent(index); }}><header><strong>Phần {index + 1}</strong><div className="question-content-editor__tools"><button type="button" className="question-content-editor__drag" draggable={!locked} disabled={locked} aria-label={`Kéo để sắp xếp nội dung ${index + 1}`} title="Kéo để sắp xếp thứ tự" onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); setDraggedIndex(index); }} onDragEnd={finishDrag}><GripVertical /></button><button type="button" className="question-content-editor__toggle" aria-expanded={expanded} aria-label={expanded ? 'Thu gọn nội dung' : 'Mở rộng nội dung'} title={expanded ? 'Thu gọn nội dung' : 'Mở rộng nội dung'} onClick={() => toggle(key)}>{expanded ? <ChevronUp /> : <ChevronDown />}</button><button type="button" className="question-content-editor__delete" disabled={locked} onClick={() => remove(index)} aria-label={`Xóa nội dung ${index + 1}`} title="Xóa nội dung"><Trash2 /></button></div></header>{expanded && <div className="question-content-editor__body">
      <FormField label="Tiêu đề" required><Input disabled={locked} value={item.title || ''} onChange={event => patch(key, 'title', event.target.value)} placeholder="Nhập tiêu đề phần nội dung..." /></FormField>
      <div className="question-content-editor__uploads">{[
        { type: 'audio', label: 'Audio (MP3, WAV, Max 10MB)', accept: ['audio/*'], max: 10 * 1024 * 1024, note: 'Kéo thả hoặc chọn tệp audio' },
        { type: 'video', label: 'Video (MP4, MOV, Max 20MB)', accept: ['video/*'], max: 20 * 1024 * 1024, note: 'Kéo thả hoặc chọn tệp video' },
        { type: 'image', label: 'Hình ảnh (JPG, PNG, Max 2MB)', accept: ['image/*'], max: 2 * 1024 * 1024, note: 'Kéo thả hoặc chọn hình ảnh' },
      ].map(config => { const field = `${config.type}MediaId`; const mediaId = item[field]; const mediaItems = mediaId ? [{ id: mediaId, mediaType: config.type.toUpperCase(), url: mediaUrls[mediaId], originalName: config.label.split(' (')[0] }] : []; return <FormField className="question-content-media" key={config.type} label={config.label}><MediaUploader endpoint={`/api/question-bank/questions/${questionId}/media/${config.type}`} variant="content" items={mediaItems} accept={config.accept} maxFileSize={config.max} multiple={false} height={96} note={config.note} disabled={locked} onUploaded={async (_file, media) => { if (!media?.id) return; patch(key, field, media.id); let url = media.url || ''; if (!url) { try { url = (await getQuestionMediaUrl(media.id)).data?.url || ''; } catch { /* preview is optional */ } } setMediaUrls(current => ({ ...current, [media.id]: url })); showMsg?.('Đã tải media. Bấm Lưu để gắn file vào nội dung.', 'success'); }} onDelete={() => { patch(key, field, null); showMsg?.('Đã bỏ media khỏi nội dung. Bấm Lưu để xác nhận.', 'success'); }} /></FormField>; })}</div>
      <FormField label="Script"><RichTextEditor disabled={locked} value={item.scriptHtml || ''} onChange={value => patch(key, 'scriptHtml', value)} placeholder="Nhập script hoặc đoạn hội thoại..." minHeight="96px" /></FormField>
      <FormField label="Nội dung chính"><RichTextEditor disabled={locked} value={item.contentHtml || ''} onChange={value => patch(key, 'contentHtml', value)} placeholder="Nhập nội dung chính..." minHeight="96px" /></FormField>
      <FormField label="Bản dịch tiếng Việt"><RichTextEditor disabled={locked} value={item.translationHtml || ''} onChange={value => patch(key, 'translationHtml', value)} placeholder="Nhập bản dịch tiếng Việt..." minHeight="96px" /></FormField>
    </div>}</article>; })}</div>
    <footer className="qm-tab-footer"><Button size="sm" variant="secondary" disabled={locked || saving} onClick={() => window.location.reload()}>Hủy</Button><Button size="sm" icon={<Save />} disabled={locked || !items.length} loading={saving} onClick={save}>Lưu</Button></footer>
  </div>;
}

function QuestionsTab({ questionId, type, items, setItems, patch, patchOption, locked, saving, save, mediaUrls, setMediaUrls, showMsg, confirm }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const remove = async index => { if (await confirm({ title: 'Xóa câu hỏi con?', message: 'Câu hỏi con sẽ được xóa khi bạn bấm Lưu câu hỏi.', confirmText: 'Xóa' })) setItems(current => current.filter((_item, itemIndex) => itemIndex !== index)); };
  const finishDrag = () => { setDraggedIndex(null); setDropIndex(null); };
  const dropQuestion = targetIndex => {
    if (draggedIndex === null || draggedIndex === targetIndex) { finishDrag(); return; }
    setItems(current => { const next = [...current]; const [dragged] = next.splice(draggedIndex, 1); next.splice(targetIndex, 0, dragged); return next; });
    finishDrag();
  };
  return <div className="qm-tab-panel"><header className="qm-tab-heading question-bank-edit-section-title"><div><h2>Câu hỏi con</h2></div><Button className="question-content-add" size="sm" icon={<Plus />} disabled={locked} onClick={() => setItems(current => [...current, blankSubQuestion(type)])}>Thêm câu hỏi</Button></header>
    {!items.length && <div className="qm-empty question-content-empty"><CircleHelp /><strong>Chưa có câu hỏi con</strong><span>Thêm câu hỏi đầu tiên để bắt đầu biên soạn.</span></div>}
    <div className="qm-editor-stack">{items.map((item, index) => { const key = item.id || item.clientId;
      if (type === 'MCQ_SINGLE') return <McqQuestionEditor key={key} bulkMode locked={locked} saving={saving} index={index} dragging={draggedIndex === index} dropTarget={dropIndex === index && draggedIndex !== index} item={{ ...item, promptHtml: item.questionText || '', hint: item.hintHtml || '', explanation: item.explanationHtml || '' }} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); setDraggedIndex(index); }} onDragOver={event => { if (locked || draggedIndex === null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropIndex(index); }} onDrop={event => { event.preventDefault(); dropQuestion(index); }} onDragEnd={finishDrag} onPatch={(field, value) => patch(key, ({ promptHtml: 'questionText', hint: 'hintHtml', explanation: 'explanationHtml' }[field] || field), value)} onAddOption={() => patch(key, 'options', [...(item.options || []), blankOption(false)])} onRemoveOption={optionIndex => patch(key, 'options', (item.options || []).filter((_option, currentIndex) => currentIndex !== optionIndex))} onRemove={() => remove(index)} />;
      if (type === 'RECORD') { const mediaId = item.audioMediaId; const mediaItems = mediaId ? [{ id: mediaId, mediaType: 'AUDIO', url: mediaUrls[mediaId], originalName: 'Audio câu hỏi' }] : []; return <RecordQuestionEditor key={key} bulkMode locked={locked} saving={saving} index={index} dragging={draggedIndex === index} dropTarget={dropIndex === index && draggedIndex !== index} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); setDraggedIndex(index); }} onDragOver={event => { if (locked || draggedIndex === null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropIndex(index); }} onDrop={event => { event.preventDefault(); dropQuestion(index); }} onDragEnd={finishDrag} item={{ ...item, promptHtml: item.questionText || '' }} onPatch={(field, value) => patch(key, field === 'promptHtml' ? 'questionText' : field, value)} onRemove={() => remove(index)} audioEditor={<MediaUploader endpoint={`/api/question-bank/questions/${questionId}/media/audio`} variant="content" items={mediaItems} accept={['audio/*']} maxFileSize={10 * 1024 * 1024} multiple={false} height={96} note="Kéo thả hoặc chọn tệp audio" disabled={locked} onUploaded={async (_file, media) => { if (!media?.id) return; patch(key, 'audioMediaId', media.id); let url = media.url || ''; if (!url) { try { url = (await getQuestionMediaUrl(media.id)).data?.url || ''; } catch { /* preview is optional */ } } setMediaUrls(current => ({ ...current, [media.id]: url })); showMsg?.('Đã tải audio. Bấm Lưu để gắn file vào câu hỏi.', 'success'); }} onDelete={() => { patch(key, 'audioMediaId', null); showMsg?.('Đã bỏ audio khỏi câu hỏi. Bấm Lưu để xác nhận.', 'success'); }} />} />; }
      if (type === 'WRITING') return <RecordQuestionEditor writing key={key} bulkMode locked={locked} saving={saving} index={index} dragging={draggedIndex === index} dropTarget={dropIndex === index && draggedIndex !== index} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); setDraggedIndex(index); }} onDragOver={event => { if (locked || draggedIndex === null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropIndex(index); }} onDrop={event => { event.preventDefault(); dropQuestion(index); }} onDragEnd={finishDrag} item={{ ...item, promptHtml: item.questionText || '', hint: item.hintHtml || '', explanation: item.explanationHtml || '' }} onPatch={(field, value) => patch(key, ({ promptHtml: 'questionText', hint: 'hintHtml', explanation: 'explanationHtml' }[field] || field), value)} onRemove={() => remove(index)} />;
      return <article className="qm-item-card" key={key}><header><div><strong>Câu hỏi {index + 1}</strong>{item.id ? <code>{item.id.slice(0, 8)}</code> : <em>Chưa lưu</em>}</div><div><OrderButtons index={index} total={items.length} disabled={locked} onMove={direction => setItems(current => move(current, index, direction))} /><Button variant="danger" size="sm" iconOnly disabled={locked} onClick={() => remove(index)} aria-label="Xóa câu hỏi"><Trash2 /></Button></div></header><div className="qm-item-body">
      <FormField label="Nội dung câu hỏi" required><RichTextEditor disabled={locked} value={item.questionText || ''} onChange={value => patch(key, 'questionText', value)} minHeight="96px" /></FormField>
      {type === 'WRITING' && <div className="qm-form-grid"><FormField label="Số ký tự tối đa" required><Input type="number" min="1" step="1" disabled={locked} value={item.maxCharacterCount ?? 2500} onChange={event => patch(key, 'maxCharacterCount', Number(event.target.value))} /></FormField><FormField label="Số từ tối thiểu" required><Input type="number" min="0" step="1" disabled={locked} value={item.minWordCount ?? 0} onChange={event => patch(key, 'minWordCount', Number(event.target.value))} /></FormField></div>}
      <FormField label="Hướng dẫn"><RichTextEditor disabled={locked} value={item.instructionHtml || ''} onChange={value => patch(key, 'instructionHtml', value)} minHeight="76px" /></FormField>
      <div className="qm-form-grid"><FormField label="Gợi ý"><Textarea disabled={locked} rows={3} value={item.hintHtml || ''} onChange={event => patch(key, 'hintHtml', event.target.value)} /></FormField><FormField label="Giải thích"><Textarea disabled={locked} rows={3} value={item.explanationHtml || ''} onChange={event => patch(key, 'explanationHtml', event.target.value)} /></FormField></div>
    </div></article>; })}</div>
    <footer className="qm-tab-footer"><Button size="sm" variant="secondary" disabled={locked || saving} onClick={() => window.location.reload()}>Hủy</Button><Button size="sm" icon={<Save />} disabled={locked || !items.length} loading={saving} onClick={save}>Lưu</Button></footer>
  </div>;
}

function McqOptions({ item, itemKey, patch, patchOption, disabled }) {
  const options = item.options || [];
  return <section className="qm-options"><header><strong>Đáp án</strong><Button size="sm" variant="secondary" icon={<Plus />} disabled={disabled} onClick={() => patch(itemKey, 'options', [...options, blankOption(false)])}>Thêm đáp án</Button></header>{options.map((option, index) => <div className="qm-option" key={option.id || option.clientId || index}><input type="radio" name={`correct-${itemKey}`} checked={Boolean(option.isCorrect)} disabled={disabled} onChange={() => patchOption(itemKey, index, { isCorrect: true })} aria-label={`Đáp án ${index + 1} đúng`} /><Input disabled={disabled} value={option.optionText || ''} onChange={event => patchOption(itemKey, index, { optionText: event.target.value })} placeholder="Nhập nội dung đáp án, bao gồm nhãn A/B/C/D nếu cần..." /><Button variant="danger" size="sm" iconOnly disabled={disabled || options.length <= 2} onClick={() => patch(itemKey, 'options', options.filter((_value, optionIndex) => optionIndex !== index))} aria-label="Xóa đáp án"><Trash2 /></Button></div>)}</section>;
}

function SubAudio({ item, itemKey, patch, disabled, mediaUrls, setMediaUrls, showMsg }) {
  if (!item.id) return <p className="qm-save-first">Lưu câu hỏi con trước khi tải audio.</p>;
  return <MediaField type="audio" mediaId={item.audioMediaId} url={mediaUrls[item.audioMediaId]} disabled={disabled} showMsg={showMsg} onUpload={async file => { const response = await uploadSubQuestionAudio(item.id, file); const media = response.data; patch(itemKey, 'audioMediaId', media.id); setMediaUrls(current => ({ ...current, [media.id]: media.url || '' })); return media; }} onRemove={async () => { await removeSubQuestionAudio(item.id); patch(itemKey, 'audioMediaId', null); }} />;
}
