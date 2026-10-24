function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const isMulterLimit = error?.name === 'MulterError' && error?.code === 'LIMIT_FILE_SIZE';
  const isInvalidUuid = error?.code === '22P02';
  const isUniqueConflict = error?.code === '23505';
  const statusCode = isMulterLimit || isInvalidUuid ? 400 : isUniqueConflict ? 409 : Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const code = isMulterLimit ? 'FILE_TOO_LARGE' : isInvalidUuid ? 'INVALID_IDENTIFIER' : isUniqueConflict ? 'RESOURCE_ALREADY_EXISTS' : error.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const safeMessage = isMulterLimit ? 'Tệp tải lên vượt quá dung lượng cho phép.' : isInvalidUuid ? 'Mã định danh không hợp lệ.' : isUniqueConflict ? 'Dữ liệu đã tồn tại.' : null;
  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : safeMessage || error.message || 'Internal Server Error';

  res.locals.errorCode = code;

  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    event: 'request_failed',
    service: 'iig-admin-api',
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    statusCode,
    code,
    errorType: error?.name || 'Error',
    message: error.message,
    stack: statusCode >= 500 ? error.stack : undefined,
    userId: req.auth?.userId
  }));

  const body = { success: false, error: message, code, requestId: req.requestId };
  if (error.details !== undefined && statusCode < 500) body.details = error.details;
  return res.status(statusCode).json(body);
}

module.exports = errorHandler;
