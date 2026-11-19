import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import AnnotationLayer from './AnnotationLayer';
import NotesPanel from './NotesPanel';
import PresenterToolbar from './PresenterToolbar';
import {
  annotationHistoryReducer, createAnnotationHistory, currentStrokes, persistedSlides,
} from './annotationHistory';
import { createAnnotationStore } from './annotationStore';
import './presenter.css';

const DRAWING_TOOLS = new Set(['pen', 'highlighter', 'eraser', 'laser']);

function editableTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

export default function PresenterTools({ token, frameRef, frameEpoch }) {
  const [slideKey, setSlideKey] = useState('default');
  const [tool, setTool] = useState('mouse');
  const [color, setColor] = useState('#ef4444');
  const [width, setWidth] = useState(3);
  const [whiteboard, setWhiteboard] = useState(false);
  const [whiteboardDark, setWhiteboardDark] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [viewedNote, setViewedNote] = useState(null);
  const [notes, setNotes] = useState({});
  const [saveError, setSaveError] = useState(false);
  const [history, dispatch] = useReducer(annotationHistoryReducer, undefined, () => createAnnotationHistory());
  const storeRef = useRef(null);
  const loadedRef = useRef(false);
  const activeKey = whiteboard ? 'whiteboard' : slideKey;
  const stateForSlide = history.slides[activeKey] || { past: [], present: [], future: [] };
  const strokes = currentStrokes(history, activeKey);

  useEffect(() => {
    let cancelled = false;
    createAnnotationStore({ token, onError: () => setSaveError(true) }).then(store => {
      if (cancelled) { store.destroy(); return; }
      const saved = store.load();
      storeRef.current = store;
      dispatch({ type: 'reset', slides: saved.slides });
      setNotes(saved.notes);
      loadedRef.current = true;
    });
    return () => {
      cancelled = true;
      storeRef.current?.destroy();
      storeRef.current = null;
    };
  }, [token]);

  const slidesToSave = useMemo(() => persistedSlides(history), [history]);
  const dataToSaveRef = useRef({ slides: slidesToSave, notes });
  dataToSaveRef.current = { slides: slidesToSave, notes };
  useEffect(() => {
    if (loadedRef.current) storeRef.current?.schedule(dataToSaveRef.current, 500);
  }, [slidesToSave]);
  useEffect(() => {
    if (loadedRef.current) storeRef.current?.schedule(dataToSaveRef.current, 400);
  }, [notes]);

  const undo = useCallback(() => dispatch({ type: 'undo', slideKey: activeKey }), [activeKey]);
  const redo = useCallback(() => dispatch({ type: 'redo', slideKey: activeKey }), [activeKey]);

  const handleShortcut = useCallback((eventLike) => {
    const key = String(eventLike.key || '').toLowerCase();
    const command = Boolean(eventLike.ctrlKey ?? eventLike.ctrl);
    const shift = Boolean(eventLike.shiftKey ?? eventLike.shift);
    if (command && key === 'z') { if (shift) redo(); else undo(); return true; }
    if (command && key === 'y') { redo(); return true; }
    const tools = { v: 'mouse', escape: 'mouse', p: 'pen', h: 'highlighter', e: 'eraser', l: 'laser' };
    if (!command && tools[key]) { setTool(tools[key]); return true; }
    if (!command && key === 'w') { setWhiteboard(value => !value); return true; }
    if (!command && key === 'n') { setNotesOpen(value => !value); setViewedNote(null); return true; }
    return false;
  }, [redo, undo]);

  useEffect(() => {
    const onMessage = event => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'sl:slide' && typeof event.data.key === 'string') {
        setSlideKey(event.data.key || 'default');
        setViewedNote(null);
      }
      if (event.data?.type === 'sl:key') handleShortcut(event.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameRef, handleShortcut]);

  useEffect(() => {
    const onKeyDown = event => {
      if (editableTarget(event.target)) return;
      if (handleShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [handleShortcut]);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: 'sl:tool', drawing: DRAWING_TOOLS.has(tool) }, '*');
    frameRef.current?.contentWindow?.postMessage({ type: 'sl:request-slide' }, '*');
  }, [frameEpoch, frameRef, tool]);

  const noteKey = viewedNote || slideKey;
  return <>
    {whiteboard && <div className={`slp-whiteboard ${whiteboardDark ? 'is-dark' : ''}`}>
      <div className="slp-whiteboard__controls">
        <button type="button" onClick={() => setWhiteboard(false)}>Quay lại bài giảng</button>
        <button type="button" onClick={() => setWhiteboardDark(value => !value)}>
          Nền {whiteboardDark ? 'trắng' : 'đen'}
        </button>
      </div>
    </div>}
    <AnnotationLayer
      strokes={strokes}
      tool={tool}
      color={color}
      width={tool === 'highlighter' ? Math.max(12, width * 3) : width}
      onAdd={stroke => dispatch({ type: 'add', slideKey: activeKey, stroke })}
      onErase={strokeId => dispatch({ type: 'remove', slideKey: activeKey, strokeId })}
    />
    <PresenterToolbar
      tool={tool} setTool={setTool} color={color} setColor={setColor} width={width} setWidth={setWidth}
      canUndo={stateForSlide.past.length > 0} canRedo={stateForSlide.future.length > 0}
      undo={undo} redo={redo} clear={() => dispatch({ type: 'clear', slideKey: activeKey })}
      whiteboard={whiteboard} toggleWhiteboard={() => setWhiteboard(value => !value)}
      notesOpen={notesOpen} toggleNotes={() => { setNotesOpen(value => !value); setViewedNote(null); }}
    />
    {notesOpen && <NotesPanel
      slideKey={slideKey}
      notes={notes}
      viewedKey={viewedNote}
      setViewedKey={setViewedNote}
      onChange={(key, value) => setNotes(current => ({ ...current, [key]: value }))}
      onDelete={key => setNotes(current => { const next = { ...current }; delete next[key]; return next; })}
      onClose={() => setNotesOpen(false)}
    />}
    {saveError && <button type="button" className="slp-save-error" onClick={() => setSaveError(false)}>
      Không lưu được trên máy này <span>×</span>
    </button>}
    <span className="slp-slide-reader" aria-live="polite">{noteKey}</span>
  </>;
}
