const crypto = require('node:crypto');
const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const { SecureLectureError, toHttp } = require('../modules/secure-lectures/errors');
const accessEngine = require('../modules/secure-lectures/services/accessEngine');
const tokenService = require('../modules/secure-lectures/services/tokenService');
const { rateLimitStore } = require('../modules/secure-lectures/stores/runtimeStores');

const DEVICE_COOKIE = 'sl_did';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cookie(req, name) {
  const header = String(req.get('cookie') || '');
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

function device(req, res) {
  const existing = cookie(req, DEVICE_COOKIE);
  if (UUID_PATTERN.test(existing || '')) return existing;
  const id = crypto.randomUUID();
  const forwarded = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  res.cookie(DEVICE_COOKIE, id, {
    httpOnly: true,
    secure: req.secure || forwarded === 'https',
    sameSite: 'lax',
    path: '/api/public/lectures',
    maxAge: 400 * 24 * 60 * 60 * 1000,
  });
  return id;
}

function context(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
    client: req.body?.client || {},
  };
}

function rateLimited(data) {
  return new SecureLectureError('RATE_LIMITED', 'Thao tác quá nhanh, vui lòng thử lại sau.', data);
}

function createSecureLecturePublicRoutes({
  engine = accessEngine,
  limits = rateLimitStore,
} = {}) {
  const router = express.Router();

  async function consume(res, key, limit, windowSec) {
    const result = await limits.consume(key, limit, windowSec);
    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfterSec));
      throw rateLimited({ retryAfterSec: result.retryAfterSec });
    }
  }

  async function limitOpen(req, res) {
    await consume(res, `open:ip:${req.ip}`, 10, 60);
    await consume(res, `open:token:${tokenService.hash(req.body?.token || '')}`, 30, 60);
  }

  router.post('/session', asyncHandler(async (req, res) => {
    await limitOpen(req, res);
    const data = await engine.open(req.body?.token, device(req, res), context(req));
    res.status(201).json({ success: true, data });
  }));

  router.post('/session/takeover', asyncHandler(async (req, res) => {
    await limitOpen(req, res);
    const data = await engine.takeover(
      req.body?.token,
      device(req, res),
      req.body?.kickSessionId,
      context(req),
    );
    res.status(201).json({ success: true, data });
  }));

  router.post('/heartbeat', asyncHandler(async (req, res) => {
    await consume(res, `heartbeat:${req.body?.sessionId || 'missing'}`, 6, 60);
    res.json({ success: true, data: await engine.heartbeat(req.body?.sessionId) });
  }));

  router.post('/end', express.text({ type: 'text/plain', limit: '4kb' }), asyncHandler(async (req, res) => {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    await engine.end(body?.sessionId);
    res.status(204).end();
  }));

  router.post('/event', asyncHandler(async (req, res) => {
    await consume(res, `event:${req.body?.sessionId || 'missing'}`, 5, 24 * 60 * 60);
    await engine.event(req.body?.sessionId, req.body?.type, context(req));
    res.status(204).end();
  }));

  router.use((error, req, res, next) => {
    // Public endpoints never expose internal error details (SQL, stack, paths).
    if (!(error instanceof SecureLectureError) && !(error?.statusCode && error.statusCode < 500)) {
      console.error(JSON.stringify({ level: 'error', event: 'secure_lecture_public_error', requestId: req.requestId, path: req.path, message: error?.message, stack: error?.stack }));
    } else if (!(error instanceof SecureLectureError)) return next(error);
    const response = toHttp(error);
    res.locals.errorCode = error.code;
    return res.status(response.status).json(response.body);
  });

  return router;
}

const router = createSecureLecturePublicRoutes();
module.exports = router;
module.exports.createSecureLecturePublicRoutes = createSecureLecturePublicRoutes;
module.exports.cookie = cookie;
module.exports.device = device;
