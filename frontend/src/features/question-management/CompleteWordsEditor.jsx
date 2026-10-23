import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileQuestion, Lightbulb, NotebookPen, RefreshCw, Save } from 'lucide-react';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/FormField';
import RichTextEditor from '../../components/common/RichTextEditor';
import '../question-bank/components/McqQuestionEditor.css';
import '../question-bank/components/McqQuestionEditorButtons.css';

function markerIndexes(html) {
  const documentNode = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return [...documentNode.body.textContent.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1]));
}

export default function CompleteWordsEditor({ stemHtml, gaps, support = {}, onStemChange, onGapsChange, onSupportChange, onSave, onCancel, locked, saving }) {
  const [expanded, setExpanded] = useState(true);
  const markers = useMemo(() => markerIndexes(stemHtml), [stemHtml]);
  const uniqueMarkers = useMemo(() => new Set(markers), [markers]);
  const duplicateMarkers = uniqueMarkers.size !== markers.length;
  const contiguous = markers.length > 0 && markers.every((_value, index) => uniqueMarkers.has(index + 1));
  const patchSupport = (field, value) => onSupportChange({ ...support, [field]: value });
  const sync = () => {
    const previous = new Map(gaps.map(gap => [Number(gap.gapIndex), gap]));
    onGapsChange([...uniqueMarkers].sort((a, b) => a - b).map(gapIndex => ({
      ...previous.get(gapIndex),
      gapIndex,
      correctText: previous.get(gapIndex)?.correctText || '',
      caseSensitive: previous.get(gapIndex)?.caseSensitive === true,
    })));
  };
  const patchGap = (gapIndex, patch) => onGapsChange(gaps.map(gap => gap.gapIndex === gapIndex ? { ...gap, ...patch } : gap));
  return <div className="qm-tab-panel complete-words-panel">
    <article className="stitch-mcq-card complete-words-card">
      <header className="stitch-mcq-card__header">
        <div className="stitch-mcq-card__identity"><span>01</span><strong>Câu hỏi 1</strong><em>Complete the Words</em></div>
        <div className="stitch-mcq-card__tools"><button type="button" className="stitch-mcq-card__toggle" aria-expanded={expanded} title={expanded ? 'Thu gọn nội dung câu hỏi' : 'Mở nội dung câu hỏi'} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronUp /> : <ChevronDown />}</button></div>
      </header>
      {expanded && <div className="stitch-mcq-card__body">
        <section className="stitch-mcq-field">
          <div className="stitch-mcq-label"><label>Nội dung câu hỏi <b>*</b></label><span>{String(stemHtml || '').replace(/<[^>]*>/g, '').length} ký tự</span></div>
          <RichTextEditor questionTools disabled={locked} value={stemHtml || ''} onChange={onStemChange} minHeight="110px" />
          <p className="complete-words-help">Chèn <b>[1]</b>, <b>[2]</b>… tại phần chữ bị ẩn. Ví dụ: <code>We mi[1] think th[2] prehistoric people…</code></p>
        </section>
        <section className="stitch-mcq-options complete-words-options">
          <div className="stitch-mcq-options__heading"><div><label>Danh sách khoảng trống <b>*</b></label><p>Mỗi marker tương ứng một câu hỏi con và một đáp án chính xác</p></div><Button size="sm" icon={<RefreshCw />} disabled={locked || !markers.length || duplicateMarkers} onClick={sync}>Tạo/Đồng bộ</Button></div>
          <div className="complete-words-marker-status"><span className={markers.length && contiguous && !duplicateMarkers ? 'is-valid' : ''}>{markers.length ? `${markers.length} marker được nhận diện` : 'Chưa có marker [n]'}</span>{(duplicateMarkers || (markers.length > 0 && !contiguous)) && <em>Marker phải duy nhất và liên tục từ [1].</em>}</div>
          <div className="complete-words-gap-list">{gaps.map(gap => <div className="complete-words-gap" key={gap.id || gap.gapIndex}>
            <span>{gap.gapIndex}</span>
            <div><label>Đáp án cho [{gap.gapIndex}]</label><Input disabled={locked} maxLength={120} placeholder="Nhập phần chữ bị thiếu" value={gap.correctText || ''} onChange={event => patchGap(gap.gapIndex, { correctText: event.target.value })} /></div>
            <label className="complete-words-case"><input type="checkbox" disabled={locked} checked={gap.caseSensitive === true} onChange={event => patchGap(gap.gapIndex, { caseSensitive: event.target.checked })} />Phân biệt hoa/thường</label>
          </div>)}</div>
        </section>
        <section className="stitch-mcq-support">
          <h4><i />Thông tin hỗ trợ sư phạm &amp; Hướng dẫn giải</h4>
          <div className="stitch-mcq-field"><div className="stitch-mcq-label"><label><FileQuestion />Hướng dẫn làm bài</label><span>Hiển thị cùng câu hỏi khi cần</span></div><RichTextEditor disabled={locked} value={support.instructionHtml || ''} onChange={value => patchSupport('instructionHtml', value)} minHeight="68px" /></div>
          <div className="stitch-mcq-support__grid">
            <div className="stitch-mcq-field"><div className="stitch-mcq-label"><label><Lightbulb />Gợi ý (Hint)</label><span>Thông tin hỗ trợ thí sinh</span></div><RichTextEditor disabled={locked} value={support.hintHtml || ''} onChange={value => patchSupport('hintHtml', value)} minHeight="68px" /></div>
            <div className="stitch-mcq-field"><div className="stitch-mcq-label"><label><NotebookPen />Ghi chú nội bộ (Note)</label><span>Dành cho ban khảo thí / giáo viên</span></div><RichTextEditor disabled={locked} value={support.note || ''} onChange={value => patchSupport('note', value)} minHeight="68px" /></div>
          </div>
          <div className="stitch-mcq-field"><div className="stitch-mcq-label"><label>Lời giải thích (Explanation)</label></div><RichTextEditor disabled={locked} value={support.explanationHtml || ''} onChange={value => patchSupport('explanationHtml', value)} minHeight="95px" /></div>
        </section>
        <footer className="stitch-mcq-card__actions"><Button variant="secondary" disabled={saving} onClick={onCancel}>Hủy</Button><Button icon={<Save />} disabled={locked || saving || !gaps.length || duplicateMarkers || !contiguous} loading={saving} onClick={onSave}>Lưu câu hỏi</Button></footer>
      </div>}
    </article>
  </div>;
}
