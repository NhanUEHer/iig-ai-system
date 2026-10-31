const { createHash } = require('node:crypto');
const HttpError = require('../../http/httpError');
const repository = require('./scoringJobRepository');
const { validateCreateRequest, validateJobId, validateRetryRequest } = require('./scoringJobValidator');

const PARTNER = 'IIG_ELEARNING';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requestIdentity({ keycode, scoringId }, partner = PARTNER, tenantId = 'legacy') {
  const sourceKey = `${tenantId}:${partner.toLowerCase()}:${keycode}:${scoringId}`;
  const requestHash = sha256(JSON.stringify({ keycode, scoringId }));
  return { sourceKey, requestHash };
}

class ScoringJobService {
  constructor(jobRepository = repository) {
    this.repository = jobRepository;
  }

  async create(body, {
    idempotencyKey, partner = PARTNER, tenantId, credentialId = null,
  } = {}) {
    const input = validateCreateRequest(body, idempotencyKey);
    if (!tenantId) {
      throw new HttpError('Integration tenant context is required.', 500, 'TENANT_CONTEXT_MISSING');
    }
    const identity = requestIdentity(input, partner, tenantId);
    try {
      return await this.repository.createOrReuse({
        partner,
        tenantId,
        credentialId,
        ...input,
        ...identity,
      });
    } catch (error) {
      if (error?.kind === 'IDEMPOTENCY_KEY_CONFLICT') {
        throw new HttpError(
          'The Idempotency-Key was already used for a different request.',
          409,
          'IDEMPOTENCY_KEY_CONFLICT'
        );
      }
      if (error?.kind === 'SCORING_IDENTITY_CONFLICT') {
        throw new HttpError(
          'The scoringId is already associated with a different keycode.',
          409,
          'SCORING_IDENTITY_CONFLICT'
        );
      }
      throw error;
    }
  }

  async detail(jobId, { partner = PARTNER, tenantId } = {}) {
    if (!tenantId) {
      throw new HttpError('Integration tenant context is required.', 500, 'TENANT_CONTEXT_MISSING');
    }
    const normalizedId = validateJobId(jobId);
    const job = await this.repository.findById(normalizedId, tenantId, partner);
    if (!job) {
      throw new HttpError('Scoring job not found.', 404, 'SCORING_JOB_NOT_FOUND');
    }
    return job;
  }

  async retry(jobId, body, {
    idempotencyKey, partner = PARTNER, tenantId, credentialId = null,
  } = {}) {
    if (!tenantId) {
      throw new HttpError('Integration tenant context is required.', 500, 'TENANT_CONTEXT_MISSING');
    }
    const normalizedId = validateJobId(jobId);
    const input = validateRetryRequest(body, idempotencyKey);
    try {
      return await this.repository.retryFailed({
        jobId: normalizedId,
        partner,
        tenantId,
        credentialId,
        ...input,
      });
    } catch (error) {
      const errors = {
        IDEMPOTENCY_KEY_CONFLICT: [409, 'The Idempotency-Key was already used for a different request.'],
        SCORING_JOB_NOT_FOUND: [404, 'Scoring job not found.'],
        SCORING_JOB_NOT_RETRYABLE: [409, 'Only a terminal failed scoring job can be retried.'],
        SCORING_JOB_SUPERSEDED: [409, 'A newer scoring attempt already exists for this submission.'],
      };
      const mapped = errors[error?.kind];
      if (mapped) throw new HttpError(mapped[1], mapped[0], error.kind);
      throw error;
    }
  }
}

const service = new ScoringJobService();
service.ScoringJobService = ScoringJobService;
service.requestIdentity = requestIdentity;
service.PARTNER = PARTNER;

module.exports = service;
