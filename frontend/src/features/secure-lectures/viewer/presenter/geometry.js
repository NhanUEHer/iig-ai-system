export function normalizePoint(clientX, clientY, rect, pressure) {
  const width = Math.max(1, Number(rect?.width) || 1);
  const height = Math.max(1, Number(rect?.height) || 1);
  const point = [
    Math.min(1, Math.max(0, (clientX - (Number(rect?.left) || 0)) / width)),
    Math.min(1, Math.max(0, (clientY - (Number(rect?.top) || 0)) / height)),
  ];
  if (Number.isFinite(pressure) && pressure > 0) point.push(pressure);
  return point;
}

export function pointToPixel(point, width, height) {
  return [(point?.[0] || 0) * width, (point?.[1] || 0) * height, point?.[2]];
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const position = Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + position * dx), point[1] - (start[1] + position * dy));
}

export function hitTestStroke(stroke, normalizedPoint, frameWidth, frameHeight, radiusPx = 14) {
  const points = stroke?.points || [];
  if (!points.length) return false;
  const target = pointToPixel(normalizedPoint, frameWidth, frameHeight);
  const pixels = points.map(point => pointToPixel(point, frameWidth, frameHeight));
  const threshold = radiusPx + Math.max(1, Number(stroke.width) || 1) / 2;
  if (pixels.length === 1) return Math.hypot(target[0] - pixels[0][0], target[1] - pixels[0][1]) <= threshold;
  return pixels.slice(1).some((point, index) => distanceToSegment(target, pixels[index], point) <= threshold);
}

export const TEXT_REFERENCE_HEIGHT = 720;
export const TEXT_SIZES = { 3: 22, 6: 32, 12: 46 };

export function textFontPx(stroke, frameHeight) {
  return Math.max(8, (Number(stroke?.size) || 32) * (frameHeight / TEXT_REFERENCE_HEIGHT));
}

/** Pixel bounding box of a text annotation (approximate, used for erasing). */
export function textBounds(stroke, frameWidth, frameHeight) {
  const [x, y] = pointToPixel(stroke?.points?.[0], frameWidth, frameHeight);
  const font = textFontPx(stroke, frameHeight);
  const lines = String(stroke?.text || '').split('\n');
  const longest = Math.max(1, ...lines.map(line => line.length));
  return { x, y, width: longest * font * 0.58, height: lines.length * font * 1.25 };
}

/** Pixel polyline that traces a shape, so the stroke eraser can hit-test it. */
export function shapeOutline(stroke, frameWidth, frameHeight) {
  const [start, end] = stroke?.points || [];
  if (!start || !end) return [];
  const [x1, y1] = pointToPixel(start, frameWidth, frameHeight);
  const [x2, y2] = pointToPixel(end, frameWidth, frameHeight);
  if (stroke.tool === 'arrow') return [[x1, y1], [x2, y2]];
  if (stroke.tool === 'rect') return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
  const cx = (x1 + x2) / 2; const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2; const ry = Math.abs(y2 - y1) / 2;
  return Array.from({ length: 33 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
  });
}

export const SHAPE_TOOLS = new Set(['arrow', 'rect', 'ellipse']);

export function hitTestAnnotation(stroke, normalizedPoint, frameWidth, frameHeight, radiusPx = 14) {
  if (stroke?.tool === 'text') {
    const [px, py] = pointToPixel(normalizedPoint, frameWidth, frameHeight);
    const box = textBounds(stroke, frameWidth, frameHeight);
    return px >= box.x - radiusPx && px <= box.x + box.width + radiusPx
      && py >= box.y - radiusPx && py <= box.y + box.height + radiusPx;
  }
  if (SHAPE_TOOLS.has(stroke?.tool)) {
    const outline = shapeOutline(stroke, frameWidth, frameHeight);
    const target = pointToPixel(normalizedPoint, frameWidth, frameHeight);
    const threshold = radiusPx + Math.max(1, Number(stroke.width) || 1) / 2;
    return outline.slice(1).some((point, index) => distanceToSegment(target, outline[index], point) <= threshold);
  }
  return hitTestStroke(stroke, normalizedPoint, frameWidth, frameHeight, radiusPx);
}
