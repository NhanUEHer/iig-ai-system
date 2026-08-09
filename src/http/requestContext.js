const { randomUUID } = require('node:crypto');

module.exports = function requestContext(req, res, next) {
  const requestId = req.get('x-request-id') || randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};
