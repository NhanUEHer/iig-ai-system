const express = require('express');
const multer = require('multer');
const asyncHandler = require('../http/asyncHandler');
const { requirePermission } = require('../middleware/authenticate');
const config = require('../modules/secure-lectures/config');
const { SecureLectureError, toHttp } = require('../modules/secure-lectures/errors');
const folderService = require('../modules/secure-lectures/services/folderService');
const lectureService = require('../modules/secure-lectures/services/lectureService');
const shareService = require('../modules/secure-lectures/services/shareService');
const accessEngine = require('../modules/secure-lectures/services/accessEngine');
const versionService = require('../modules/secure-lectures/services/versionService');

const router = express.Router();
const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.floor(config.maxUploadMb * 1024 * 1024), files: 1 },
}).single('file');

function uploadHtml(req, res, next) {
  multipart(req, res, error => {
    if (error?.name === 'MulterError' && error.code === 'LIMIT_FILE_SIZE') {
      return next(new SecureLectureError(
        'FILE_TOO_LARGE',
        `File vượt quá dung lượng tối đa ${config.maxUploadMb} MB.`,
      ));
    }
    return next(error);
  });
}

function booleanField(value, fallback) {
  if (value === undefined) return fallback;
  return value === true || String(value).toLowerCase() === 'true';
}

router.get('/health', requirePermission('secure_lectures.view'), (req, res) => {
  res.json({ ok: true });
});

router.get(
  '/folders',
  requirePermission('secure_lectures.view'),
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await folderService.list() });
  }),
);

router.post(
  '/folders',
  requirePermission('secure_lectures.manage'),
  asyncHandler(async (req, res) => {
    const data = await folderService.create(req.body, req.auth.userId);
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/folders/:id',
  requirePermission('secure_lectures.manage'),
  asyncHandler(async (req, res) => {
    const data = await folderService.update(req.params.id, req.body, req.auth.userId);
    res.json({ success: true, data });
  }),
);

router.delete(
  '/folders/:id',
  requirePermission('secure_lectures.manage'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await folderService.remove(req.params.id) });
  }),
);

router.get(
  '/overview',
  requirePermission('secure_lectures.view'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await lectureService.overview(req.query) });
  }),
);

router.get(
  '/lectures',
  requirePermission('secure_lectures.view'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await lectureService.list(req.query) });
  }),
);

router.post(
  '/lectures',
  requirePermission('secure_lectures.manage'),
  uploadHtml,
  asyncHandler(async (req, res) => {
    const data = await lectureService.create(req.body, req.file, req.auth.userId);
    res.status(201).json({ success: true, data });
  }),
);

// Keep this static path before /lectures/:id.
router.post(
  '/lectures/move',
  requirePermission('secure_lectures.manage'),
  asyncHandler(async (req, res) => {
    const data = await lectureService.move(req.body, req.auth.userId);
    res.json({ success: true, data });
  }),
);

router.get(
  '/lectures/:id',
  requirePermission('secure_lectures.view'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await lectureService.detail(req.params.id) });
  }),
);

router.patch(
  '/lectures/:id',
  requirePermission('secure_lectures.manage'),
  asyncHandler(async (req, res) => {
    const data = await lectureService.update(req.params.id, req.body, req.auth.userId);
    res.json({ success: true, data });
  }),
);

router.delete(
  '/lectures/:id',
  requirePermission('secure_lectures.manage'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await lectureService.archive(req.params.id, req.auth.userId) });
  }),
);

router.get(
  '/lectures/:id/versions',
  requirePermission('secure_lectures.view'),
  asyncHandler(async (req, res) => {
    folderService.requireUuid(req.params.id, 'id');
    res.json({ success: true, data: await versionService.list(req.params.id) });
  }),
);

router.post(
  '/lectures/:id/versions',
  requirePermission('secure_lectures.manage'),
  uploadHtml,
  asyncHandler(async (req, res) => {
    folderService.requireUuid(req.params.id, 'id');
    const data = await versionService.createVersion(req.params.id, req.file, {
      note: req.body?.note,
      makeCurrent: booleanField(req.body?.makeCurrent, true),
      userId: req.auth.userId,
    });
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/lectures/:id/versions/:versionId/preview',
  requirePermission('secure_lectures.view'),
  asyncHandler(async (req, res) => {
    const contentService = require('../modules/secure-lectures/services/contentService');
    try {
      const html = await contentService.preview(
        req.params.id,
        req.params.versionId,
        req.auth?.fullName || req.auth?.name || req.auth?.email,
      );
      contentService.setContentHeaders(res);
      res.status(200).send(html);
    } catch (error) {
      if (error instanceof contentService.ContentNotFoundError) {
        throw new SecureLectureError('LECTURE_NOT_READY', 'Không tìm thấy phiên bản để xem trước.');
      }
      throw error;
    }
  }),
);

router.post(
  '/lectures/:id/versions/:versionId/current',
  requirePermission('secure_lectures.manage'),
  asyncHandler(async (req, res) => {
    folderService.requireUuid(req.params.id, 'id');
    folderService.requireUuid(req.params.versionId, 'versionId');
    const data = await versionService.setCurrent(
      req.params.id,
      req.params.versionId,
      req.auth.userId,
    );
    res.json({ success: true, data });
  }),
);

router.get(
  '/lectures/:id/shares',
  requirePermission('secure_lectures.view'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await shareService.list(req.params.id) });
  }),
);

router.post(
  '/lectures/:id/shares',
  requirePermission('secure_lectures.share'),
  asyncHandler(async (req, res) => {
    const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const requestBaseUrl = `${forwardedProto || req.protocol}://${forwardedHost || req.get('host')}`;
    const data = await shareService.create(
      req.params.id,
      req.body,
      req.auth.userId,
      requestBaseUrl,
    );
    res.status(201).json({ success: true, data });
  }),
);

router.patch(
  '/shares/:id',
  requirePermission('secure_lectures.share'),
  asyncHandler(async (req, res) => {
    const data = await shareService.update(req.params.id, req.body, req.auth.userId);
    res.json({ success: true, data });
  }),
);

router.post(
  '/shares/:id/revoke',
  requirePermission('secure_lectures.share'),
  asyncHandler(async (req, res) => {
    const data = await shareService.revoke(req.params.id, req.body, req.auth.userId);
    res.json({ success: true, data });
  }),
);

router.get(
  '/shares/:id/devices',
  requirePermission('secure_lectures.view'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await shareService.listDevices(req.params.id) });
  }),
);

for (const [action, handler] of [
  ['remove', shareService.removeDevice],
  ['block', shareService.blockDevice],
  ['unblock', shareService.unblockDevice],
]) {
  router.post(
    `/shares/:id/devices/:deviceRef/${action}`,
    requirePermission('secure_lectures.share'),
    asyncHandler(async (req, res) => {
      const data = await handler(req.params.id, req.params.deviceRef, req.auth.userId);
      res.json({ success: true, data });
    }),
  );
}

router.post(
  '/sessions/:id/kick',
  requirePermission('secure_lectures.share'),
  asyncHandler(async (req, res) => {
    const data = await accessEngine.kick(req.params.id, req.auth.userId);
    res.json({ success: true, data });
  }),
);

router.use((error, req, res, next) => {
  if (!(error instanceof SecureLectureError)) return next(error);
  const response = toHttp(error);
  res.locals.errorCode = error.code;
  return res.status(response.status).json(response.body);
});

module.exports = router;
