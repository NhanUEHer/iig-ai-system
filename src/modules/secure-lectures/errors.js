const ERROR_CODES = Object.freeze({
  LINK_INVALID: Object.freeze({ httpStatus: 404 }),
  LINK_REVOKED: Object.freeze({ httpStatus: 410 }),
  LINK_EXPIRED: Object.freeze({ httpStatus: 410 }),
  LINK_NOT_STARTED: Object.freeze({ httpStatus: 403 }),
  DEVICE_LIMIT: Object.freeze({ httpStatus: 403 }),
  DEVICE_BLOCKED: Object.freeze({ httpStatus: 403 }),
  DEVICE_REMOVED: Object.freeze({ httpStatus: 403 }),
  CONCURRENT_LIMIT: Object.freeze({ httpStatus: 409 }),
  SESSION_KICKED: Object.freeze({ httpStatus: 409 }),
  SESSION_GONE: Object.freeze({ httpStatus: 404 }),
  RATE_LIMITED: Object.freeze({ httpStatus: 429 }),
  LECTURE_NOT_READY: Object.freeze({ httpStatus: 409 }),
  FILE_INVALID: Object.freeze({ httpStatus: 400 }),
  FILE_TOO_LARGE: Object.freeze({ httpStatus: 413 }),
  FOLDER_CYCLE: Object.freeze({ httpStatus: 409 }),
  FOLDER_TOO_DEEP: Object.freeze({ httpStatus: 409 }),
  NAME_TAKEN: Object.freeze({ httpStatus: 409 }),
});

class SecureLectureError extends Error {
  constructor(code, message, data) {
    const metadata = ERROR_CODES[code] || { httpStatus: 500 };
    super(message || code);
    this.name = 'SecureLectureError';
    this.code = code;
    this.httpStatus = metadata.httpStatus;
    this.data = data;
  }
}

function toHttp(error) {
  if (error instanceof SecureLectureError && ERROR_CODES[error.code]) {
    const detail = { code: error.code, message: error.message };
    if (error.data !== undefined) detail.data = error.data;
    return {
      status: error.httpStatus,
      body: { success: false, error: detail },
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: { code: 'UNKNOWN', message: 'Internal Server Error' },
    },
  };
}

module.exports = { SecureLectureError, ERROR_CODES, toHttp };
