import React from 'react';
import { BookText, CircleHelp, ScanText } from 'lucide-react';
import { Alert, Badge, Spinner } from '../../../design-system-v2';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const partLabel = part => (part ? `Part ${part}` : null);

export default function DetectionPreview({ detection, detecting }) {
  if (!detection) return <div className="cs-detect is-pending">{detecting ? <Spinner label="Đang nhận diện…" /> : <span><ScanText /> Dừng gõ một chút để hệ thống nhận diện.</span>}</div>;
  const { segments = [], warnings = [], summary = {} } = detection;
  return <section className="cs-detect" aria-label="Kết quả nhận diện">
    <header>
      <ScanText />
      <strong>Hệ thống nhận diện</strong>
      <Badge tone="info">{summary.passageCount || 0} đoạn văn</Badge>
      <Badge tone="info">{summary.questionCount || 0} câu hỏi{summary.questionRange ? ` · ${summary.questionRange.from}–${summary.questionRange.to}` : ''}</Badge>
      {detecting && <Spinner label="Đang cập nhật…" />}
    </header>
    <ol className="cs-detect__list">
      {segments.map((segment, index) => segment.kind === 'passage'
        ? <li key={index} className="cs-detect__segment is-passage">
          <span className="cs-detect__kind"><BookText />Đoạn văn</span>
          <div>
            <p>{segment.text.length > 260 ? `${segment.text.slice(0, 260)}…` : segment.text}</p>
            <small>{segment.meta?.sentenceCount || 0} câu{segment.meta?.hasBlanks ? ' · có chỗ trống (Part 6)' : ''}</small>
          </div>
        </li>
        : <li key={index} className="cs-detect__segment is-questions">
          <span className="cs-detect__kind"><CircleHelp />Câu hỏi{partLabel(segment.meta?.part) ? ` · ${partLabel(segment.meta.part)}` : ''}</span>
          <ul>
            {segment.questions.map(question => <li key={question.number}>
              <strong>{question.number}.</strong>
              <span>{question.stem || <em>(chưa có nội dung câu hỏi)</em>}</span>
              <span className="cs-detect__options">{OPTION_LETTERS.map(letter => <span key={letter} className={[question.options?.[letter] ? '' : 'is-missing', question.answerKey === letter ? 'is-answer' : ''].join(' ')} title={question.options?.[letter] || 'Thiếu đáp án'}>{letter}</span>)}</span>
            </li>)}
          </ul>
        </li>)}
    </ol>
    {warnings.length > 0 && <Alert tone="warning" compact title={`${warnings.length} điểm cần kiểm tra`}>
      <ul className="cs-detect__warnings">{warnings.slice(0, 6).map((warning, index) => <li key={index}>{warning.message}</li>)}{warnings.length > 6 && <li>… và {warnings.length - 6} điểm khác</li>}</ul>
    </Alert>}
  </section>;
}
