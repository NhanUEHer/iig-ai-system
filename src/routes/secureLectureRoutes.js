const express = require('express');
const multer = require('multer');
const asyncHandler = require('../http/asyncHandler');
const { requirePermission } = require('../middleware/authenticate');
const config = require('../modules/secure-lectures/config');
const { SecureLectureError, toHttp } = require('../modules/secure-lectures/errors');
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
  '/lectures/:id/versions',
  requirePermission('secure_lectures.view'),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await versionService.list(req.params.id) });
  }),
);

router.post(
  '/lectures/:id/versions',
  requirePermission('secure_lectures.manage'),
  uploadHtml,
  asyncHandler(async (req, res) => {
    const data = await versionService.createVersion(req.params.id, req.file, {
      note: req.body?.note,
      makeCurrent: booleanField(req.body?.makeCurrent, true),
      userId: req.auth.userId,
    });
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/lectures/:id/versions/:versionId/current',
  requirePermission('secure_lectures.manage'),
  asyncHandler(async (req, res) => {
    const data = await versionService.setCurrent(
      req.params.id,
      req.params.versionId,
      req.auth.userId,
    );
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
