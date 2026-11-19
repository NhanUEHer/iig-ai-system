import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SHAPE_TOOLS, hitTestAnnotation, normalizePoint, pointToPixel, shapeOutline, textFontPx,
} from './geometry';

function drawShape(context, stroke, width, height) {
  const outline = shapeOutline(stroke, width, height);
  if (outline.length < 2) return;
  context.save();
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(outline[0][0], outline[0][1]);
  outline.slice(1).forEach(([x, y]) => context.lineTo(x, y));
  context.stroke();
  if (stroke.tool === 'arrow') {
    const [[x1, y1], [x2, y2]] = outline;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(12, stroke.width * 3.2);
    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45));
    context.lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45));
    context.closePath();
    context.fill();
  }
  context.restore();
}

function drawText(context, stroke, width, height) {
  const [x, y] = pointToPixel(stroke.points?.[0], width, height);
  const font = textFontPx(stroke, height);
  context.save();
  context.fillStyle = stroke.color;
  context.font = `600 ${font}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  context.textBaseline = 'top';
  context.shadowColor = stroke.color === '#ffffff' ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.6)';
  context.shadowBlur = 3;
  String(stroke.text || '').split('\n').forEach((line, index) => context.fillText(line, x, y + index * font * 1.25));
  context.restore();
}

function drawStroke(context, stroke, width, height) {
  if (stroke.tool === 'text') { drawText(context, stroke, width, height); return; }
  if (SHAPE_TOOLS.has(stroke.tool)) { drawShape(context, stroke, width, height); return; }
  const points = stroke.points || [];
  if (!points.length) return;
  const pixels = points.map(point => pointToPixel(point, width, height));
  context.save();
  context.globalAlpha = stroke.tool === 'highlighter' ? 0.35 : 1;
  context.globalCompositeOperation = 'source-over';
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (pixels.length === 1) {
    context.beginPath();
    context.arc(pixels[0][0], pixels[0][1], stroke.width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(pixels[0][0], pixels[0][1]);
    for (let index = 1; index < pixels.length - 1; index += 1) {
      const midpointX = (pixels[index][0] + pixels[index + 1][0]) / 2;
      const midpointY = (pixels[index][1] + pixels[index + 1][1]) / 2;
      context.quadraticCurveTo(pixels[index][0], pixels[index][1], midpointX, midpointY);
    }
    context.lineTo(pixels.at(-1)[0], pixels.at(-1)[1]);
    context.stroke();
  }
  context.restore();
}

const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

export default function AnnotationLayer({ strokes, tool, color, width, textSize, onAdd, onErase }) {
  const canvasRef = useRef(null);
  const activeRef = useRef(null);
  const laserRef = useRef([]);
  const animationRef = useRef();
  const [active, setActive] = useState(null);
  const [eraserPoint, setEraserPoint] = useState(null);
  const [laserFrame, setLaserFrame] = useState([]);
  const [editing, setEditing] = useState(null);
  const editingRef = useRef(null);
  const [frameHeight, setFrameHeight] = useState(720);

  const commitText = useCallback(() => {
    const current = editingRef.current;
    editingRef.current = null;
    setEditing(null);
    const text = current?.text?.replace(/\s+$/, '');
    if (current && text) onAdd({ id: newId(), tool: 'text', color: current.color, size: current.size, text, points: [current.point] });
  }, [onAdd]);

  useEffect(() => { if (tool !== 'text' && editingRef.current) commitText(); }, [commitText, tool]);

  const animateLaser = useCallback(() => {
    laserRef.current = laserRef.current.filter(item => performance.now() - item.at < 1200);
    setLaserFrame([...laserRef.current]);
    animationRef.current = laserRef.current.length ? requestAnimationFrame(animateLaser) : undefined;
  }, []);

  useEffect(() => () => cancelAnimationFrame(animationRef.current), []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
    const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    if (Math.round(rect.height) !== frameHeight) setFrameHeight(Math.round(rect.height) || 720);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    strokes.forEach(stroke => drawStroke(context, stroke, rect.width, rect.height));
    if (active) drawStroke(context, active, rect.width, rect.height);
    const now = performance.now();
    laserFrame.forEach(item => {
      const [x, y] = pointToPixel(item.point, rect.width, rect.height);
      const life = Math.max(0, 1 - (now - item.at) / 1200);
      context.save();
      context.globalAlpha = life * 0.9;
      context.shadowColor = '#ff3b30';
      context.shadowBlur = 14;
      context.fillStyle = '#ff3b30';
      context.beginPath();
      context.arc(x, y, 5 + life * 2, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
    if (tool === 'eraser' && eraserPoint) {
      const [x, y] = pointToPixel(eraserPoint, rect.width, rect.height);
      context.save();
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.setLineDash([4, 3]);
      context.beginPath();
      context.arc(x, y, 14, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }, [active, eraserPoint, frameHeight, laserFrame, strokes, tool]);

  useEffect(() => {
    paint();
    const observer = new ResizeObserver(paint);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [paint]);

  const pointFor = event => normalizePoint(
    event.clientX, event.clientY, canvasRef.current.getBoundingClientRect(), event.pressure,
  );

  const eraseAtPoint = event => {
    const point = pointFor(event);
    setEraserPoint(point);
    const rect = canvasRef.current.getBoundingClientRect();
    const hit = [...strokes].reverse().find(stroke => hitTestAnnotation(stroke, point, rect.width, rect.height));
    if (hit) onErase(hit.id);
  };

  const addLaserPoint = event => {
    laserRef.current.push({ point: pointFor(event), at: performance.now() });
    if (!animationRef.current) animationRef.current = requestAnimationFrame(animateLaser);
  };

  const onPointerDown = event => {
    if (tool === 'mouse') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'eraser') { eraseAtPoint(event); return; }
    if (tool === 'laser') { addLaserPoint(event); return; }
    if (tool === 'text') {
      event.preventDefault();
      if (editingRef.current) { commitText(); return; }
      const next = { point: pointFor(event), text: '', color, size: textSize };
      editingRef.current = next;
      setEditing(next);
      return;
    }
    const start = pointFor(event);
    const stroke = { id: newId(), tool, color, width, points: SHAPE_TOOLS.has(tool) ? [start, start] : [start] };
    activeRef.current = stroke;
    setActive(stroke);
  };

  const onPointerMove = event => {
    if (tool === 'eraser') {
      setEraserPoint(pointFor(event));
      if (event.buttons) eraseAtPoint(event);
      return;
    }
    if (tool === 'laser') { addLaserPoint(event); return; }
    if (!activeRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFor(event);
    const points = SHAPE_TOOLS.has(activeRef.current.tool)
      ? [activeRef.current.points[0], point]
      : [...activeRef.current.points, point];
    activeRef.current = { ...activeRef.current, points };
    setActive(activeRef.current);
  };

  const finish = event => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const done = activeRef.current;
    const [a, b] = done?.points || [];
    const tiny = SHAPE_TOOLS.has(done?.tool) && Math.hypot((b?.[0] || 0) - a[0], (b?.[1] || 0) - a[1]) < 0.004;
    if (done && !tiny) onAdd(done);
    activeRef.current = null;
    setActive(null);
  };

  const editFont = editing ? textFontPx(editing, frameHeight) : 0;
  return <>
    <canvas
    ref={canvasRef}
    className={`slp-annotation is-${tool}`}
    aria-label="Lớp vẽ trình chiếu"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={finish}
    onPointerCancel={finish}
    onPointerLeave={() => setEraserPoint(null)}
      onMouseDown={event => { if (tool === 'text') event.preventDefault(); }}
    />
    {editing && <textarea
      className="slp-text-input"
      aria-label="Gõ chữ lên slide"
      placeholder="Gõ chữ…"
      autoFocus
      rows={Math.max(1, editing.text.split('\n').length)}
      value={editing.text}
      style={{
        left: `${editing.point[0] * 100}%`, top: `${editing.point[1] * 100}%`,
        color: editing.color, fontSize: `${editFont}px`,
        width: `${Math.max(6, ...editing.text.split('\n').map(line => line.length + 2)) * 0.6}em`,
      }}
      onChange={event => { editingRef.current = { ...editingRef.current, text: event.target.value }; setEditing(editingRef.current); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { editingRef.current = null; setEditing(null); }
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commitText(); }
      }}
      onBlur={commitText}
    />}
  </>;
}
