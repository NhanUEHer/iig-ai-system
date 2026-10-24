const { randomUUID } = require('node:crypto');

module.exports = function requestContext(req, res, next) {
  const incomingRequestId = req.get('x-request-id');
  const requestId = typeof incomingRequestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(incomingRequestId)
    ? incomingRequestId
    : randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};
