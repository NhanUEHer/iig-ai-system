const HttpError = require('./httpError');

function firstHeader(req, name) {
  return String(req.get(name) || '').split(',')[0].trim();
}

function requestOrigin(req) {
  const protocol = firstHeader(req, 'x-forwarded-proto') || req.protocol;
  try { return new URL(`${protocol}://${req.get('host')}`).origin; }
  catch { return ''; }
}

function normalizeOrigin(value) {
  try { return new URL(value).origin; } catch { return ''; }
}

// Origins this request may legitimately come from. A reverse proxy (Vite
// `changeOrigin`, nginx) can rewrite Host to the API's own host, so the
// forwarded host and the configured public base URL count as well.
function allowedOrigins(req, env = process.env) {
  const origins = new Set([requestOrigin(req)]);
  const forwardedHost = firstHeader(req, 'x-forwarded-host');
  if (forwardedHost) {
    const protocol = firstHeader(req, 'x-forwarded-proto') || req.protocol;
    origins.add(normalizeOrigin(`${protocol}://${forwardedHost}`));
  }
  for (const value of [env.SECURE_LECTURES_PUBLIC_BASE_URL, env.PUBLIC_BASE_URL]) {
    if (value) origins.add(normalizeOrigin(value));
  }
  origins.delete('');
  return origins;
}

function sameOriginOnly(req, _res, next) {
  // Browsers set Sec-Fetch-Site themselves and proxies do not rewrite it, so it
  // is the most reliable signal when present.
  const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite) {
    if (fetchSite === 'same-origin' || fetchSite === 'none') return next();
    return next(new HttpError('Cross-origin request is not allowed.', 403, 'CORS_FORBIDDEN'));
  }
  const origin = req.get('origin');
  if (!origin) return next();
  if (allowedOrigins(req).has(normalizeOrigin(origin))) return next();
  return next(new HttpError('Cross-origin request is not allowed.', 403, 'CORS_FORBIDDEN'));
}

module.exports = { sameOriginOnly, requestOrigin, allowedOrigins };
