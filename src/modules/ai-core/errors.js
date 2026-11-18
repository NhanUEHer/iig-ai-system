const ERROR_CODES = Object.freeze({
  CONFIG_MISSING: Object.freeze({ httpStatus: 503, retryable: false }),
  AGENT_PAUSED: Object.freeze({ httpStatus: 409, retryable: false }),
  VARIABLES_INVALID: Object.freeze({ httpStatus: 400, retryable: false }),
  INPUT_TOO_LARGE: Object.freeze({ httpStatus: 422, retryable: false }),
  COST_CEILING: Object.freeze({ httpStatus: 422, retryable: false }),
  QUOTA_EXCEEDED: Object.freeze({ httpStatus: 429, retryable: true }),
  OUTPUT_TRUNCATED: Object.freeze({ httpStatus: 502, retryable: true }),
  SCHEMA_INVALID: Object.freeze({ httpStatus: 502, retryable: true }),
  PROVIDER_DOWN: Object.freeze({ httpStatus: 503, retryable: true }),
  AUTH_FAILED: Object.freeze({ httpStatus: 502, retryable: false }),
  TIMEOUT: Object.freeze({ httpStatus: 504, retryable: true }),
});

class AiCoreError extends Error {
  constructor(code, message, options = {}) {
    const metadata = ERROR_CODES[code] || { httpStatus: 500, retryable: false };
    super(message || code);
    this.name = 'AiCoreError';
    this.code = code;
    this.httpStatus = metadata.httpStatus;
    this.retryable = metadata.retryable;
    this.callId = options.callId || null;
  }
}

function toHttp(error) {
  if (error instanceof AiCoreError && ERROR_CODES[error.code]) {
    return {
      status: error.httpStatus,
      body: { error: { code: error.code, message: error.message } },
    };
  }

  return {
    status: 500,
    body: { error: { code: 'UNKNOWN', message: 'Internal Server Error' } },
  };
}

module.exports = { AiCoreError, ERROR_CODES, toHttp };
