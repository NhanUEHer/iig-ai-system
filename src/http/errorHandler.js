function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const code = error.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : error.message || 'Internal Server Error';

  console.error(JSON.stringify({
    level: 'error',
    event: 'request_failed',
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code,
    message: error.message
  }));

  const body = { success: false, error: message, code, requestId: req.requestId };
  if (error.details !== undefined && statusCode < 500) body.details = error.details;
  return res.status(statusCode).json(body);
}

module.exports = errorHandler;
