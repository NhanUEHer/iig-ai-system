import { useState } from 'react';
import {
  ChevronUp, CircleOff, Eraser, EyeOff, Highlighter, Menu, MousePointer2, NotebookPen,
  Palette, PenLine, Redo2, RotateCcw, Sparkles, Trash2, Undo2,
} from 'lucide-react';

const COLORS = ['#111111', '#ef4444', '#2563eb', '#16a34a', '#f97316', '#ffffff'];
const WIDTHS = [3, 6, 12];

const TOOLS = [
  ['mouse', 'Chuột (V/Esc)', MousePointer2],
  ['pen', 'Bút (P)', PenLine],
  ['highlighter', 'Bút dạ quang (H)', Highlighter],
  ['eraser', 'Tẩy nét (E)', Eraser],
  ['laser', 'Laser (L)', Sparkles],
];

function ToolButton({ active, title, onClick, children, disabled = false }) {
  return <button type="button" className={`slp-tool ${active ? 'is-active' : ''}`} title={title}
    aria-label={title} aria-pressed={active} onClick={onClick} disabled={disabled}>{children}</button>;
}

export default function PresenterToolbar({
  tool, setTool, color, setColor, width, setWidth, canUndo, canRedo, undo, redo, clear,
  whiteboard, toggleWhiteboard, notesOpen, toggleNotes,
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return <button type="button" className="slp-toolbar-toggle" title="Hiện công cụ"
      onClick={() => setCollapsed(false)}><Menu /><ChevronUp /></button>;
  }
  return <div className="slp-toolbar" role="toolbar" aria-label="Công cụ trình chiếu">
    {TOOLS.map(([value, title, Icon]) => <ToolButton key={value} active={tool === value} title={title}
      onClick={() => setTool(value)}><Icon /></ToolButton>)}
    <span className="slp-separator" />
    <div className="slp-colors" title="Màu nét">
      <Palette aria-hidden="true" />
      {COLORS.map(value => <button key={value} type="button" aria-label={`Màu ${value}`}
        className={color === value ? 'is-active' : ''} style={{ '--slp-color': value }} onClick={() => setColor(value)} />)}
    </div>
    <select className="slp-width" aria-label="Độ dày nét" title="Độ dày nét" value={width}
      onChange={event => setWidth(Number(event.target.value))}>
      {WIDTHS.map(value => <option key={value} value={value}>{value === 3 ? 'Mảnh' : value === 6 ? 'Vừa' : 'Đậm'}</option>)}
    </select>
    <span className="slp-separator" />
    <ToolButton title="Hoàn tác (Ctrl/Cmd+Z)" onClick={undo} disabled={!canUndo}><Undo2 /></ToolButton>
    <ToolButton title="Làm lại (Ctrl/Cmd+Shift+Z hoặc Ctrl/Cmd+Y)" onClick={redo} disabled={!canRedo}><Redo2 /></ToolButton>
    <ToolButton title="Xoá mọi nét trên slide" onClick={clear}><Trash2 /></ToolButton>
    <span className="slp-separator" />
    <ToolButton active={whiteboard} title={whiteboard ? 'Quay lại bài giảng (W)' : 'Bảng trắng (W)'}
      onClick={toggleWhiteboard}>{whiteboard ? <RotateCcw /> : <CircleOff />}</ToolButton>
    <ToolButton active={notesOpen} title="Ghi chú (N)" onClick={toggleNotes}><NotebookPen /></ToolButton>
    <ToolButton title="Ẩn thanh công cụ" onClick={() => setCollapsed(true)}><EyeOff /></ToolButton>
  </div>;
}
