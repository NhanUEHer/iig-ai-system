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
