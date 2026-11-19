const HttpError = require('../../../http/httpError');

async function kick() {
  throw new HttpError(
    'Quản lý phiên sẽ được triển khai ở S05.',
    501,
    'SESSION_ENGINE_NOT_IMPLEMENTED',
  );
}

module.exports = { kick };
