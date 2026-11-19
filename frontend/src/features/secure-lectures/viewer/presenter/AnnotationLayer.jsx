import { useCallback, useEffect, useRef, useState } from 'react';
import { hitTestStroke, normalizePoint, pointToPixel } from './geometry';

function drawStroke(context, stroke, width, height) {
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

export default function AnnotationLayer({ strokes, tool, color, width, onAdd, onErase }) {
  const canvasRef = useRef(null);
  const activeRef = useRef(null);
  const laserRef = useRef([]);
  const animationRef = useRef();
  const [active, setActive] = useState(null);
  const [eraserPoint, setEraserPoint] = useState(null);
  const [laserFrame, setLaserFrame] = useState([]);

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
  }, [active, eraserPoint, laserFrame, strokes, tool]);

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
    const hit = [...strokes].reverse().find(stroke => hitTestStroke(stroke, point, rect.width, rect.height));
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
    const stroke = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      tool,
      color,
      width,
      points: [pointFor(event)],
    };
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
    activeRef.current = { ...activeRef.current, points: [...activeRef.current.points, pointFor(event)] };
    setActive(activeRef.current);
  };

  const finish = event => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (activeRef.current) onAdd(activeRef.current);
    activeRef.current = null;
    setActive(null);
  };

  return <canvas
    ref={canvasRef}
    className={`slp-annotation is-${tool}`}
    aria-label="Lớp vẽ trình chiếu"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={finish}
    onPointerCancel={finish}
    onPointerLeave={() => setEraserPoint(null)}
  />;
}
