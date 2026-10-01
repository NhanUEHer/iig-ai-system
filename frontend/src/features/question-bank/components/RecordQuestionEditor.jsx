import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, GripVertical, Hash, Save, TextCursorInput, Trash2 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { FormField, Input } from '../../../components/ui/FormField';
import RichTextEditor from '../../../components/common/RichTextEditor';
import MediaUploader from '../../../components/common/MediaUploader';
import { deleteQuestionMedia, listSubQuestionMedia } from '../../../services/questionBankService';
import './RecordQuestionEditor.css';
import './WritingQuestionEditor.css';

const formatDuration = seconds => {
  const value = Math.max(0, Number(seconds) || 0);
  return [Math.floor(value / 3600), Math.floor((value % 3600) / 60), value % 60].map(part => String(part).padStart(2, '0')).join(':');
};
const parseDuration = value => {
  const parts = String(value).trim().split(':');
  if (parts.length !== 3 || parts.some(part => !/^\d{2}$/.test(part))) return null;
  const [hours, minutes, seconds] = parts.map(Number);
  return minutes > 59 || seconds > 59 ? null : hours * 3600 + minutes * 60 + seconds;
};
const countText = html => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().length;

function DurationField({ id, label, value, onChange, disabled = false }) {
  const [display, setDisplay] = useState(formatDuration(value));
  useEffect(() => setDisplay(formatDuration(value)), [value]);
  const commit = () => { if (disabled) return; const seconds = parseDuration(display); if (seconds !== null) onChange(seconds); else setDisplay(formatDuration(value)); };
  return <FormField id={id} label={label} required className="record-duration-field"><div className="record-duration-field__control"><Input id={id} inputMode="numeric" placeholder="00:00:00" value={display} disabled={disabled} onChange={event => setDisplay(event.target.value)} onBlur={commit} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} /><Clock3 aria-hidden="true" /></div></FormField>;
}

function RecordEditor({ item, index, saving, bulkMode = false, locked = false, audioEditor = null, dragging = false, dropTarget = false, onDragStart, onDragOver, onDrop, onDragEnd, onPatch, onSave, onCancel, onRemove }) {
  const [expanded, setExpanded] = useState(true);
  const [questionMedia, setQuestionMedia] = useState([]);
  const hasExternalAudioEditor = Boolean(audioEditor);
  const refreshQuestionMedia = async () => item.id && setQuestionMedia((await listSubQuestionMedia(item.id)).data || []);
  useEffect(() => {
    // The question-management screen supplies its own staged-media uploader.
    // Only load the legacy sub-question media endpoint for the legacy editor.
    if (!hasExternalAudioEditor) refreshQuestionMedia();
  }, [item.id, hasExternalAudioEditor]);
  const removeMedia = async media => { await deleteQuestionMedia(media.id); setQuestionMedia(items => items.filter(value => value.id !== media.id)); };
  return <article className={`stitch-record-card ${dragging ? 'is-dragging' : ''} ${dropTarget ? 'is-drop-target' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
    <header className="stitch-record-card__header"><div className="stitch-record-card__identity"><span className="stitch-record-card__number">{String(index + 1).padStart(2, '0')}</span><strong>Câu hỏi {index + 1}</strong><em>Dạng Record</em></div><div className="stitch-record-card__tools"><button type="button" className="stitch-record-card__drag" draggable={!locked} disabled={locked} aria-label={`Kéo để sắp xếp câu hỏi ${index + 1}`} title="Kéo để sắp xếp thứ tự" onDragStart={onDragStart} onDragEnd={onDragEnd}><GripVertical /></button><button type="button" className="stitch-record-card__toggle" aria-expanded={expanded} aria-label={expanded ? 'Thu gọn nội dung câu hỏi' : 'Mở nội dung câu hỏi'} title={expanded ? 'Thu gọn nội dung câu hỏi' : 'Mở nội dung câu hỏi'} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronUp /> : <ChevronDown />}</button><button type="button" className="stitch-record-card__delete" disabled={locked} onClick={onRemove} aria-label={`Xóa câu hỏi ${index + 1}`} title="Xóa câu hỏi này"><Trash2 /></button></div></header>
    {expanded && <div className="stitch-record-card__body">
      <div className="stitch-record-card__prompt-audio">
        <FormField label={<><span>Nội dung câu hỏi <b>*</b></span><small>{countText(item.promptHtml)} ký tự</small></>} className="stitch-record-field stitch-record-field--prompt"><RichTextEditor disabled={locked} value={item.promptHtml || ''} onChange={value => onPatch('promptHtml', value)} placeholder="Nhập đề bài hoặc yêu cầu câu hỏi nói tại đây..." minHeight="120px" /></FormField>
        <FormField label="Audio câu hỏi" className="stitch-record-field stitch-record-field--audio">{audioEditor || (item.id ? <MediaUploader disabled={locked} variant="content" endpoint={`/api/question-bank/sub-questions/${item.id}/media`} accept={['audio/*']} multiple={false} maxFileSize={10 * 1024 * 1024} note="Kéo thả hoặc chọn tệp audio" items={questionMedia} onUploaded={(_file, uploaded) => uploaded?.id && setQuestionMedia([uploaded])} onDelete={removeMedia} /> : <p className="record-media-hint">Lưu câu hỏi trước để tải audio.</p>)}</FormField>
      </div>
      <div className="stitch-record-card__durations"><DurationField disabled={locked} id={`record-preparation-${item.id || index}`} label="Thời gian chuẩn bị câu hỏi" value={item.preparationDurationSeconds ?? 60} onChange={value => onPatch('preparationDurationSeconds', value)} /><DurationField disabled={locked} id={`record-answer-${item.id || index}`} label="Thời gian ghi âm câu hỏi" value={item.recordingDurationSeconds ?? 120} onChange={value => onPatch('recordingDurationSeconds', value)} /></div>
      <FormField label={<><span>Hướng dẫn làm bài</span><small>Hiển thị cho thí sinh</small></>} className="stitch-record-field"><RichTextEditor disabled={locked} value={item.instructionHtml || ''} onChange={value => onPatch('instructionHtml', value)} placeholder="Nhập hướng dẫn làm bài cho thí sinh..." minHeight="92px" /></FormField>
      <FormField label="Ghi chú nội bộ" className="stitch-record-field"><RichTextEditor disabled={locked} value={item.note || ''} onChange={value => onPatch('note', value)} placeholder="Nhập hướng dẫn chấm, rubric hoặc lưu ý đánh giá phản xạ..." minHeight="92px" /></FormField>
      {!bulkMode && <footer className="stitch-record-card__actions"><Button variant="secondary" onClick={onCancel}>Hủy</Button><Button icon={<Save />} loading={saving} disabled={saving} onClick={onSave}>Lưu câu hỏi</Button></footer>}
    </div>}
  </article>;
}

function WritingEditor({ item, index, saving, bulkMode = false, locked = false, dragging = false, dropTarget = false, onDragStart, onDragOver, onDrop, onDragEnd, onPatch, onSave, onCancel, onRemove }) {
  const [expanded, setExpanded] = useState(true);
  return <article className={`stitch-record-card stitch-writing-card ${dragging ? 'is-dragging' : ''} ${dropTarget ? 'is-drop-target' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
    <header className="stitch-record-card__header"><div className="stitch-record-card__identity"><span className="stitch-record-card__number">{String(index + 1).padStart(2, '0')}</span><strong>Câu hỏi {index + 1}</strong><em>Dạng Writing</em></div><div className="stitch-record-card__tools"><button type="button" className="stitch-record-card__drag" draggable={!locked} disabled={locked} aria-label={`Kéo để sắp xếp câu hỏi ${index + 1}`} title="Kéo để sắp xếp thứ tự" onDragStart={onDragStart} onDragEnd={onDragEnd}><GripVertical /></button><button type="button" className="stitch-record-card__toggle" aria-expanded={expanded} aria-label={expanded ? 'Thu gọn nội dung câu hỏi' : 'Mở nội dung câu hỏi'} title={expanded ? 'Thu gọn nội dung câu hỏi' : 'Mở nội dung câu hỏi'} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronUp /> : <ChevronDown />}</button><button type="button" className="stitch-record-card__delete" disabled={locked} onClick={onRemove} aria-label={`Xóa câu hỏi ${index + 1}`} title="Xóa câu hỏi này"><Trash2 /></button></div></header>
    {expanded && <div className="stitch-record-card__body">
      <FormField label={<><span>Nội dung câu hỏi <b>*</b></span><small>{countText(item.promptHtml)} ký tự</small></>} className="stitch-record-field stitch-record-field--prompt"><RichTextEditor disabled={locked} value={item.promptHtml || ''} onChange={value => onPatch('promptHtml', value)} placeholder="Nhập đề bài hoặc yêu cầu bài viết tại đây..." minHeight="120px" /></FormField>
      <div className="stitch-record-card__durations"><FormField label="Số ký tự tối đa" required className="writing-limit-field"><div className="writing-limit-field__control"><Input type="number" min="1" step="1" placeholder="Ví dụ: 2500" value={item.maxCharacterCount ?? 2500} disabled={locked} onChange={event => onPatch('maxCharacterCount', Number(event.target.value))} /><TextCursorInput /></div></FormField><FormField label="Số từ tối thiểu" required className="writing-limit-field"><div className="writing-limit-field__control"><Input type="number" min="0" step="1" placeholder="Ví dụ: 250" value={item.minWordCount ?? 0} disabled={locked} onChange={event => onPatch('minWordCount', Number(event.target.value))} /><Hash /></div></FormField></div>
      <FormField label={<><span>Hướng dẫn làm bài</span><small>Hiển thị cho thí sinh</small></>} className="stitch-record-field"><RichTextEditor disabled={locked} value={item.instructionHtml || ''} onChange={value => onPatch('instructionHtml', value)} placeholder="Nhập hướng dẫn làm bài cho thí sinh..." minHeight="92px" /></FormField>
      <div className="stitch-writing-support"><FormField label="Gợi ý" className="stitch-record-field"><RichTextEditor disabled={locked} value={item.hint || ''} onChange={value => onPatch('hint', value)} placeholder="Nhập gợi ý cho thí sinh..." minHeight="92px" /></FormField><FormField label="Ghi chú nội bộ" className="stitch-record-field"><RichTextEditor disabled={locked} value={item.note || ''} onChange={value => onPatch('note', value)} placeholder="Nhập hướng dẫn chấm, rubric hoặc lưu ý đánh giá bài viết..." minHeight="92px" /></FormField></div>
      <FormField label="Giải thích" className="stitch-record-field"><RichTextEditor disabled={locked} value={item.explanation || ''} onChange={value => onPatch('explanation', value)} placeholder="Nhập lời giải thích hoặc đáp án tham khảo..." minHeight="92px" /></FormField>
      {!bulkMode && <footer className="stitch-record-card__actions"><Button variant="secondary" onClick={onCancel}>Hủy</Button><Button icon={<Save />} loading={saving} disabled={saving} onClick={onSave}>Lưu câu hỏi</Button></footer>}
    </div>}
  </article>;
}

export default function RecordQuestionEditor(props) { return props.writing ? <WritingEditor {...props} /> : <RecordEditor {...props} />; }
