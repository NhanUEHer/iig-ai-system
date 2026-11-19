import { useState } from 'react';
import {
  ChevronRight, Circle, CircleOff, Eraser, Highlighter, MousePointer2, MoveUpRight, NotebookPen,
  PenLine, Redo2, RotateCcw, Sparkles, Square, Trash2, Type, Undo2,
} from 'lucide-react';

const COLORS = ['#111111', '#ef4444', '#2563eb', '#16a34a', '#f97316', '#ffffff'];
const WIDTHS = [[3, 'Mảnh'], [6, 'Vừa'], [12, 'Đậm']];

const TOOLS = [
  ['mouse', 'Chuột (V/Esc)', MousePointer2],
  ['pen', 'Bút (P)', PenLine],
  ['highlighter', 'Bút dạ quang (H)', Highlighter],
  ['text', 'Gõ chữ (T)', Type],
  ['arrow', 'Mũi tên (A)', MoveUpRight],
  ['rect', 'Hình chữ nhật (R)', Square],
  ['ellipse', 'Hình tròn/elip (O)', Circle],
  ['eraser', 'Tẩy (E)', Eraser],
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
  const [open, setOpen] = useState(false);
  const ActiveIcon = (TOOLS.find(([value]) => value === tool) || TOOLS[0])[2];

  if (!open) {
    return <button type="button" className={`slp-rail-toggle ${notesOpen ? "is-shifted" : ""}`} title="Mở công cụ trình chiếu"
      aria-label="Mở công cụ trình chiếu" onClick={() => setOpen(true)}>
      <ActiveIcon />
      {tool !== 'mouse' && <span className="slp-rail-toggle__dot" style={{ '--slp-color': color }} />}
    </button>;
  }

  return <div className={`slp-toolbar ${notesOpen ? "is-shifted" : ""}`} role="toolbar" aria-orientation="vertical" aria-label="Công cụ trình chiếu">
    <ToolButton title="Thu gọn công cụ" onClick={() => setOpen(false)}><ChevronRight /></ToolButton>
    <span className="slp-separator" />
    {TOOLS.map(([value, title, Icon]) => <ToolButton key={value} active={tool === value} title={title}
      onClick={() => setTool(value)}><Icon /></ToolButton>)}
    <span className="slp-separator" />
    <div className="slp-colors" role="group" aria-label="Màu">
      {COLORS.map(value => <button key={value} type="button" aria-label={`Màu ${value}`} title="Màu"
        className={color === value ? 'is-active' : ''} style={{ '--slp-color': value }} onClick={() => setColor(value)} />)}
    </div>
    <div className="slp-widths" role="group" aria-label="Độ dày / cỡ chữ">
      {WIDTHS.map(([value, label]) => <button key={value} type="button" title={`${label} (độ dày / cỡ chữ)`}
        aria-label={label} className={width === value ? 'is-active' : ''} onClick={() => setWidth(value)}>
        <span style={{ width: 4 + value, height: 4 + value }} />
      </button>)}
    </div>
    <span className="slp-separator" />
    <ToolButton title="Hoàn tác (Ctrl/Cmd+Z)" onClick={undo} disabled={!canUndo}><Undo2 /></ToolButton>
    <ToolButton title="Làm lại (Ctrl/Cmd+Shift+Z hoặc Ctrl/Cmd+Y)" onClick={redo} disabled={!canRedo}><Redo2 /></ToolButton>
    <ToolButton title="Xoá mọi nét trên slide" onClick={clear}><Trash2 /></ToolButton>
    <span className="slp-separator" />
    <ToolButton active={whiteboard} title={whiteboard ? 'Quay lại bài giảng (W)' : 'Bảng trắng (W)'}
      onClick={toggleWhiteboard}>{whiteboard ? <RotateCcw /> : <CircleOff />}</ToolButton>
    <ToolButton active={notesOpen} title="Ghi chú (N)" onClick={toggleNotes}><NotebookPen /></ToolButton>
  </div>;
}
