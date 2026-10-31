const repository = require('./scoringRunRepository');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ScoringRunService {
  constructor(scoringRunRepository = repository) {
    this.repository = scoringRunRepository;
  }

  async createInitialRun(submissionId, options = {}) {
    const normalizedId = String(submissionId || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedId)) {
      throw Object.assign(new Error('submissionId must be a valid UUID.'), {
        code: 'IIG_AI_SUBMISSION_ID_INVALID',
      });
    }
    const policyVersion = String(options.policyVersion || 'iig-ai-scoring-policy-v1').trim();
    return this.repository.createOrReuseInitialRun({
      submissionId: normalizedId,
      policyVersion,
      inputSchemaVersion: options.inputSchemaVersion || 1,
      aggregationVersion: options.aggregationVersion || 'score-group-average-half-up-v1',
      scorerTypes: options.scorerTypes || null,
      questionNumbers: options.questionNumbers || null,
      planId: options.planId || null,
    });
  }

  async createReadAloudRun(submissionId, options = {}) {
    return this.createInitialRun(submissionId, {
      ...options,
      policyVersion: options.policyVersion || 'rta-q1-q2-dify-policy-v1',
      aggregationVersion: options.aggregationVersion || 'rta-q1-q2-group-llm-v1',
      scorerTypes: ['READ_TEXT_ALOUD'],
      questionNumbers: [1, 2],
    });
  }

  async createDescribePictureRun(submissionId, options = {}) {
    return this.createInitialRun(submissionId, {
      ...options,
      policyVersion: options.policyVersion || 'describe-picture-q3-q4-dify-policy-v1',
      aggregationVersion: options.aggregationVersion || 'describe-picture-q3-q4-group-llm-v1',
      scorerTypes: ['DESCRIBE_PICTURE'],
      questionNumbers: [3, 4],
    });
  }

  async createRespondQ5Q10Run(submissionId, options = {}) {
    return this.createInitialRun(submissionId, {
      ...options,
      policyVersion: options.policyVersion || 'respond-q5-q10-dify-policy-v1',
      aggregationVersion: options.aggregationVersion || 'respond-q5-q10-group-llm-v1',
      scorerTypes: ['RESPOND_TO_QUESTIONS', 'RESPOND_USING_INFORMATION'],
      questionNumbers: [5, 6, 7, 8, 9, 10],
    });
  }

  async createExpressOpinionRun(submissionId, options = {}) {
    return this.createInitialRun(submissionId, {
      ...options,
      policyVersion: options.policyVersion || 'express-opinion-q11-dify-policy-v1',
      aggregationVersion: options.aggregationVersion || 'express-opinion-q11-singleton-v1',
      scorerTypes: ['EXPRESS_AN_OPINION'],
      questionNumbers: [11],
    });
  }

  async createWritingRun(submissionId, options = {}) {
    return this.createInitialRun(submissionId, {
      ...options,
      policyVersion: options.policyVersion || 'write-sentence-q1-q5-dify-policy-v1',
      aggregationVersion: options.aggregationVersion || 'write-sentence-q1-q5-group-llm-v1',
      scorerTypes: ['WRITE_SENTENCE_PICTURE'],
      questionNumbers: [1, 2, 3, 4, 5],
    });
  }

  async createWrittenRequestRun(submissionId, options = {}) {
    return this.createInitialRun(submissionId, {
      ...options,
      policyVersion: options.policyVersion || 'written-request-q6-q7-dify-policy-v1',
      aggregationVersion: options.aggregationVersion || 'written-request-q6-q7-singleton-v1',
      scorerTypes: ['RESPOND_TO_WRITTEN_REQUEST'],
      questionNumbers: [6, 7],
    });
  }

  async createOpinionEssayRun(submissionId, options = {}) {
    return this.createInitialRun(submissionId, {
      ...options,
      policyVersion: options.policyVersion || 'opinion-essay-q8-dify-policy-v1',
      aggregationVersion: options.aggregationVersion || 'opinion-essay-q8-singleton-v1',
      scorerTypes: ['WRITE_OPINION_ESSAY'],
      questionNumbers: [8],
    });
  }

  async getRun(runId) {
    const normalizedId = String(runId || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedId)) {
      throw Object.assign(new Error('runId must be a valid UUID.'), {
        code: 'IIG_AI_SCORING_RUN_ID_INVALID',
      });
    }
    return this.repository.findById(normalizedId);
  }
}

const service = new ScoringRunService();
service.ScoringRunService = ScoringRunService;

module.exports = service;
