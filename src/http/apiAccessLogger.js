const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-access-token',
  'x-api-key'
]);

function cleanHeaderValue(value, maxLength = 512) {
  if (typeof value !== 'string') return undefined;
  return value.replace(/[\r\n\u0000-\u001f\u007f]/g, '').slice(0, maxLength) || undefined;
}

function getClientIp(req) {
  const forwardedFor = cleanHeaderValue(req.get?.('x-forwarded-for'), 256);
  return forwardedFor?.split(',')[0]?.trim() || req.socket?.remoteAddress || undefined;
}

function getSafeRequestHeaders(req) {
  const names = ['content-type', 'content-length', 'user-agent'];
  return Object.fromEntries(names.flatMap(name => {
    if (SENSITIVE_HEADER_NAMES.has(name)) return [];
    const value = cleanHeaderValue(req.get?.(name));
    return value ? [[name, value]] : [];
  }));
}

function routeTemplate(path) {
  return String(path || '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, ':id')
    .replace(/\/(\d+)(?=\/|$)/g, '/:number');
}

function buildApiAccessLog(req, res, durationMs, outcome = 'finished') {
  const statusCode = Number(res.statusCode) || 0;
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  const queryKeys = Object.keys(req.query || {}).sort();

  return {
    timestamp: new Date().toISOString(),
    level,
    event: 'api_request_completed',
    service: 'iig-admin-api',
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    routeTemplate: routeTemplate(req.path),
    queryKeys,
    statusCode,
    durationMs,
    outcome,
    responseBytes: Number(res.getHeader?.('content-length')) || undefined,
    clientIp: getClientIp(req),
    userAgent: cleanHeaderValue(req.get?.('user-agent')),
    userId: req.auth?.userId,
    role: req.auth?.role,
    errorCode: res.locals?.errorCode,
    cacheStatus: res.locals?.cacheStatus,
    answerStorage: res.locals?.answerStorage,
    requestHeaders: getSafeRequestHeaders(req)
  };
}

function writeLog(entry) {
  const line = JSON.stringify(entry);
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else console.log(line);
}

function apiAccessLogger(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();

  const startedAt = process.hrtime.bigint();
  let logged = false;
  const complete = outcome => {
    if (logged) return;
    logged = true;
    const elapsedNs = process.hrtime.bigint() - startedAt;
    const durationMs = Math.round(Number(elapsedNs) / 1e4) / 100;
    writeLog(buildApiAccessLog(req, res, durationMs, outcome));
  };

  res.once('finish', () => complete('finished'));
  res.once('close', () => complete(res.writableEnded ? 'finished' : 'aborted'));
  return next();
}

module.exports = { apiAccessLogger, buildApiAccessLog, cleanHeaderValue, routeTemplate };
