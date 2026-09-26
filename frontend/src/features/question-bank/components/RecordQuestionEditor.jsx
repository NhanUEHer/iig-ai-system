import React, { useEffect, useState } from 'react';
import { Clock3, GripVertical, Hash, LockKeyhole, Save, TextCursorInput, Trash2 } from 'lucide-react';
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

function DurationField({ id, label, value, hint, onChange }) {
  const [display, setDisplay] = useState(formatDuration(value));
  useEffect(() => setDisplay(formatDuration(value)), [value]);
  const commit = () => { const seconds = parseDuration(display); if (seconds !== null) onChange(seconds); else setDisplay(formatDuration(value)); };
  return <FormField id={id} label={label} required hint={hint} className="record-duration-field"><div className="record-duration-field__control"><Input id={id} inputMode="numeric" placeholder="00:00:00" value={display} onChange={event => setDisplay(event.target.value)} onBlur={commit} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} /><Clock3 aria-hidden="true" /></div></FormField>;
}

function RecordEditor({ item, index, saving, onPatch, onSave, onCancel, onRemove }) {
  const [questionMedia, setQuestionMedia] = useState([]);
  const refreshQuestionMedia = async () => item.id && setQuestionMedia((await listSubQuestionMedia(item.id)).data || []);
  useEffect(() => { refreshQuestionMedia(); }, [item.id]);
  const removeMedia = async media => { await deleteQuestionMedia(media.id); setQuestionMedia(items => items.filter(value => value.id !== media.id)); };
  return <article className="stitch-record-card">
    <header className="stitch-record-card__header"><div className="stitch-record-card__identity"><GripVertical aria-label="Kéo để sắp xếp thứ tự" /><span className="stitch-record-card__number">{String(index + 1).padStart(2, '0')}</span><strong>Câu hỏi {index + 1}</strong><em>Dạng Record</em></div><button type="button" className="stitch-record-card__delete" onClick={onRemove} aria-label={`Xóa câu hỏi ${index + 1}`}><Trash2 /></button></header>
    <div className="stitch-record-card__body">
      <FormField label={<><span>Nội dung câu hỏi <b>*</b></span><small>{countText(item.promptHtml)} ký tự</small></>} className="stitch-record-field stitch-record-field--prompt"><RichTextEditor value={item.promptHtml || ''} onChange={value => onPatch('promptHtml', value)} placeholder="Nhập đề bài hoặc yêu cầu câu hỏi nói tại đây..." minHeight="120px" /></FormField>
      <FormField label="Audio câu hỏi" className="stitch-record-field stitch-record-field--audio">{item.id ? <MediaUploader variant="content" endpoint={`/api/question-bank/sub-questions/${item.id}/media`} accept={['audio/*']} multiple={false} maxFileSize={10 * 1024 * 1024} note="Kéo thả hoặc chọn tệp audio" items={questionMedia} onUploaded={(_file, uploaded) => uploaded?.id && setQuestionMedia([uploaded])} onDelete={removeMedia} /> : <p className="record-media-hint">Lưu câu hỏi trước để tải audio.</p>}</FormField>
      <div className="stitch-record-card__durations"><DurationField id={`record-preparation-${item.id || index}`} label="Thời gian chuẩn bị câu hỏi" value={item.preparationDurationSeconds || 60} hint="Định dạng giờ:phút:giây (Thời gian suy nghĩ trước khi hệ thống bắt đầu thu âm)." onChange={value => onPatch('preparationDurationSeconds', value)} /><DurationField id={`record-answer-${item.id || index}`} label="Thời gian ghi âm câu hỏi" value={item.recordingDurationSeconds || 120} hint="Định dạng giờ:phút:giây (Thời gian tối đa thí sinh được phép ghi âm)." onChange={value => onPatch('recordingDurationSeconds', value)} /></div>
      <FormField label={<><span>Hướng dẫn làm bài</span><small>Hiển thị cho thí sinh</small></>} className="stitch-record-field"><RichTextEditor value={item.instructionHtml || ''} onChange={value => onPatch('instructionHtml', value)} placeholder="Nhập hướng dẫn làm bài cho thí sinh..." minHeight="92px" /></FormField>
      <FormField label={<><span>Ghi chú nội bộ</span><small className="stitch-record-field__private"><LockKeyhole />Dành riêng cho ban khảo thí / giáo viên</small></>} className="stitch-record-field"><RichTextEditor value={item.note || ''} onChange={value => onPatch('note', value)} placeholder="Nhập hướng dẫn chấm, rubric hoặc lưu ý đánh giá phản xạ..." minHeight="92px" /></FormField>
    </div>
    <footer className="stitch-record-card__actions"><Button variant="secondary" onClick={onCancel}>Hủy</Button><Button icon={<Save />} loading={saving} disabled={saving} onClick={onSave}>Lưu câu hỏi</Button></footer>
  </article>;
}

function WritingEditor({ item, index, saving, onPatch, onSave, onCancel, onRemove }) {
  const [questionMedia, setQuestionMedia] = useState([]);
  useEffect(() => { if (item.id) listSubQuestionMedia(item.id).then(response => setQuestionMedia(response.data || [])); }, [item.id]);
  const removeMedia = async media => { await deleteQuestionMedia(media.id); setQuestionMedia(items => items.filter(value => value.id !== media.id)); };
  return <article className="stitch-record-card stitch-writing-card">
    <header className="stitch-record-card__header"><div className="stitch-record-card__identity"><GripVertical aria-label="Kéo để sắp xếp thứ tự" /><span className="stitch-record-card__number">{String(index + 1).padStart(2, '0')}</span><strong>Câu hỏi {index + 1}</strong><em>Dạng Writing</em></div><button type="button" className="stitch-record-card__delete" onClick={onRemove} aria-label={`Xóa câu hỏi ${index + 1}`}><Trash2 /></button></header>
    <div className="stitch-record-card__body">
      <FormField label={<><span>Nội dung câu hỏi <b>*</b></span><small>{countText(item.promptHtml)} ký tự</small></>} className="stitch-record-field stitch-record-field--prompt"><RichTextEditor value={item.promptHtml || ''} onChange={value => onPatch('promptHtml', value)} placeholder="Nhập đề bài hoặc yêu cầu bài viết tại đây..." minHeight="120px" /></FormField>
      <FormField label="Audio câu hỏi" className="stitch-record-field stitch-record-field--audio">{item.id ? <MediaUploader variant="content" endpoint={`/api/question-bank/sub-questions/${item.id}/media`} accept={['audio/*']} multiple={false} maxFileSize={10 * 1024 * 1024} note="Kéo thả hoặc chọn tệp audio" items={questionMedia} onUploaded={(_file, uploaded) => uploaded?.id && setQuestionMedia([uploaded])} onDelete={removeMedia} /> : <p className="record-media-hint">Lưu câu hỏi trước để tải audio.</p>}</FormField>
      <div className="stitch-record-card__durations"><FormField label="Số ký tự tối đa" required hint="Giới hạn ký tự tối đa thí sinh được phép nhập cho bài viết luận." className="writing-limit-field"><div className="writing-limit-field__control"><Input type="number" min="1" step="1" placeholder="Ví dụ: 2500" value={item.maxCharacterCount || ''} onChange={event => onPatch('maxCharacterCount', Number(event.target.value))} /><TextCursorInput /></div></FormField><FormField label="Số từ tối thiểu (Gợi ý)" required hint="Số từ tối thiểu yêu cầu (ví dụ: IELTS Writing Task 2 yêu cầu tối thiểu 250 từ)." className="writing-limit-field"><div className="writing-limit-field__control"><Input type="number" min="1" step="1" placeholder="Ví dụ: 250" value={item.minWordCount || ''} onChange={event => onPatch('minWordCount', Number(event.target.value))} /><Hash /></div></FormField></div>
      <FormField label={<><span>Hướng dẫn làm bài</span><small>Hiển thị cho thí sinh</small></>} className="stitch-record-field"><RichTextEditor value={item.instructionHtml || ''} onChange={value => onPatch('instructionHtml', value)} placeholder="Nhập hướng dẫn làm bài cho thí sinh..." minHeight="92px" /></FormField>
      <FormField label={<><span>Ghi chú nội bộ</span><small className="stitch-record-field__private"><LockKeyhole />Dành riêng cho ban khảo thí / giáo viên</small></>} className="stitch-record-field"><RichTextEditor value={item.note || ''} onChange={value => onPatch('note', value)} placeholder="Nhập hướng dẫn chấm, rubric hoặc lưu ý đánh giá bài viết..." minHeight="92px" /></FormField>
    </div>
    <footer className="stitch-record-card__actions"><Button variant="secondary" onClick={onCancel}>Hủy</Button><Button icon={<Save />} loading={saving} disabled={saving} onClick={onSave}>Lưu câu hỏi</Button></footer>
  </article>;
}

export default function RecordQuestionEditor(props) { return props.writing ? <WritingEditor {...props} /> : <RecordEditor {...props} />; }
