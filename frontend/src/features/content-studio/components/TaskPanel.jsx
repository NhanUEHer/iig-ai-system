import React from 'react';
import { BookText, CircleHelp } from 'lucide-react';
import { Checkbox, Surface } from '../../../design-system-v2';

export const TASK_OPTIONS = {
  passage: [
    { value: 'translation', label: 'Dịch', description: 'Câu tiếng Anh (câu tiếng Việt)' },
    { value: 'vocab', label: 'Từ vựng', description: 'Từ vựng trọng tâm theo level' },
    { value: 'dictionary', label: 'Từ điển', description: 'Mục từ theo từng câu' },
  ],
  question: [
    { value: 'translation', label: 'Dịch câu hỏi & đáp án' },
    { value: 'hint', label: 'Hint', description: 'Gợi ý chiến lược, không lộ đáp án' },
    { value: 'explanation', label: 'Explanation', description: 'Giải thích đáp án đúng và sai' },
    { value: 'note', label: 'Note', description: 'Lưu ý bẫy thường gặp' },
  ],
};
export const TASK_LABELS = {
  passage: Object.fromEntries(TASK_OPTIONS.passage.map(option => [option.value, option.label])),
  question: { ...Object.fromEntries(TASK_OPTIONS.question.map(option => [option.value, option.label])), translation: 'Dịch' },
};
export const DEFAULT_TASKS = { passage: TASK_OPTIONS.passage.map(option => option.value), question: TASK_OPTIONS.question.map(option => option.value) };

function Section({ group, icon, title, available, hint, value, onChange }) {
  const selected = value[group];
  const toggle = task => onChange({ ...value, [group]: selected.includes(task) ? selected.filter(item => item !== task) : [...selected, task] });
  return <div className={`cs-tasks__section${available ? '' : ' is-disabled'}`}>
    <div className="cs-tasks__title">{icon}<strong>{title}</strong><small>{available ? `${selected.length}/${TASK_OPTIONS[group].length}` : hint}</small></div>
    {TASK_OPTIONS[group].map(option => <Checkbox
      key={option.value}
      label={option.label}
      description={option.description}
      checked={available && selected.includes(option.value)}
      disabled={!available}
      onChange={() => toggle(option.value)}
    />)}
  </div>;
}

export default function TaskPanel({ value, onChange, hasPassage, hasQuestions, detected }) {
  return <Surface className="cs-tasks" padding="none" aria-label="Nội dung cần tạo">
    <div className="cs-folders__head"><strong>Nội dung cần tạo</strong></div>
    <Section group="passage" icon={<BookText />} title="Đoạn văn" available={!detected || hasPassage} hint="Không có đoạn văn" value={value} onChange={onChange} />
    <Section group="question" icon={<CircleHelp />} title="Câu hỏi" available={!detected || hasQuestions} hint="Không có câu hỏi" value={value} onChange={onChange} />
  </Surface>;
}
