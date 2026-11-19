export function resolveShareUrl(
  result,
  origin = typeof window !== 'undefined' ? window.location.origin : '',
) {
  if (result?.baseUrlSource !== 'request' || !result?.path || !origin) return result?.url;
  return `${String(origin).replace(/\/+$/, '')}/${String(result.path).replace(/^\/+/, '')}`;
}
