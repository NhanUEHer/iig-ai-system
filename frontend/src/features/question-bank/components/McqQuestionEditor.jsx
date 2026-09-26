import React from 'react';
import { Check, GripVertical, Lightbulb, NotebookPen, Plus, Save, Trash2 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { Input } from '../../../components/ui/FormField';
import RichTextEditor from '../../../components/common/RichTextEditor';
import './McqQuestionEditor.css';
import './McqQuestionEditorButtons.css';

export default function McqQuestionEditor({ item, index, saving, onPatch, onAddOption, onRemoveOption, onSave, onCancel, onRemove }) {
  const key = item.id || item.clientId;
  const options = item.options || [];
  const setCorrect = optionIndex => onPatch('options', options.map((option, i) => ({ ...option, isCorrect: i === optionIndex })));
  const patchOption = (optionIndex, value) => onPatch('options', options.map((option, i) => i === optionIndex ? { ...option, optionText: value } : option));
  return <article className="stitch-mcq-card">
    <header className="stitch-mcq-card__header">
      <div className="stitch-mcq-card__identity"><span>{String(index + 1).padStart(2, '0')}</span><strong>Câu hỏi {index + 1}</strong><em>Trắc nghiệm (MCQ)</em></div>
      <div className="stitch-mcq-card__tools"><button type="button" title="Di chuyển thứ tự"><GripVertical /></button><button type="button" title="Xóa câu hỏi này" onClick={onRemove}><Trash2 /></button></div>
    </header>
    <div className="stitch-mcq-card__body">
      <section className="stitch-mcq-field">
        <div className="stitch-mcq-label"><label>Nội dung câu hỏi <b>*</b></label><span>{String(item.promptHtml || '').replace(/<[^>]*>/g, '').length} ký tự</span></div>
        <RichTextEditor questionTools value={item.promptHtml || ''} onChange={value => onPatch('promptHtml', value)} minHeight="80px" />
      </section>
      <section className="stitch-mcq-options">
        <div className="stitch-mcq-options__heading"><div><label>Danh sách đáp án (MCQ) <b>*</b></label><p>Tích chọn nút tròn để thiết lập đáp án đúng nhất cho câu hỏi này</p></div><Button size="sm" icon={<Plus />} onClick={onAddOption}>Thêm đáp án</Button></div>
        <div className="stitch-mcq-options__list">{options.map((option, optionIndex) => <div className={`stitch-mcq-option ${option.isCorrect ? 'is-correct' : ''}`} key={option.id || optionIndex}>
          <input type="radio" name={`correct-${key}`} checked={!!option.isCorrect} onChange={() => setCorrect(optionIndex)} aria-label={`Đặt đáp án ${option.optionKey || String.fromCharCode(65 + optionIndex)} là đáp án đúng`} />
          <span>{option.optionKey || String.fromCharCode(65 + optionIndex)}</span>
          <Input type="text" className="stitch-mcq-option__input" value={option.optionText || ''} onChange={event => patchOption(optionIndex, event.target.value)} />
          {option.isCorrect && <em><Check />Đáp án đúng</em>}
          <button type="button" disabled={options.length <= 2} onClick={() => onRemoveOption(optionIndex)} title="Xóa đáp án"><Trash2 /></button>
        </div>)}</div>
      </section>
      <section className="stitch-mcq-support">
        <h4><i />Thông tin hỗ trợ sư phạm &amp; Hướng dẫn giải</h4>
        <div className="stitch-mcq-support__grid">
          <div className="stitch-mcq-field"><div className="stitch-mcq-label"><label><Lightbulb />Gợi ý (Hint)</label><span>Hiển thị cho thí sinh khi cần trợ giúp</span></div><RichTextEditor value={item.hint || ''} onChange={value => onPatch('hint', value)} minHeight="68px" /></div>
          <div className="stitch-mcq-field"><div className="stitch-mcq-label"><label><NotebookPen />Ghi chú nội bộ (Note)</label><span>Dành riêng cho ban khảo thí / giáo viên</span></div><RichTextEditor value={item.note || ''} onChange={value => onPatch('note', value)} minHeight="68px" /></div>
        </div>
        <div className="stitch-mcq-field"><div className="stitch-mcq-label"><label>Lời giải thích (Explanation)</label></div><RichTextEditor value={item.explanation || ''} onChange={value => onPatch('explanation', value)} minHeight="95px" /></div>
      </section>
      <footer className="stitch-mcq-card__actions"><Button variant="secondary" onClick={onCancel}>Hủy</Button><Button icon={<Save />} loading={saving} disabled={saving} onClick={onSave}>Lưu câu hỏi</Button></footer>
    </div>
  </article>;
}
