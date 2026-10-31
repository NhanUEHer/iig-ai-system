const { getEvidenceContract, normalizedType } = require('./evidenceContractRegistry');

const TASK_EVIDENCE_SCHEMA_VERSION = 1;
const TASK_STATUSES = Object.freeze(['SUCCESS', 'INVALID_RESPONSE', 'FAILED']);
const QUALITY_LEVELS = Object.freeze([
  'STRONG',
  'ADEQUATE',
  'LIMITED',
  'SEVERELY_LIMITED',
  'NOT_ASSESSABLE',
]);

function quality() {
  return Object.freeze({ type: 'enum', values: QUALITY_LEVELS });
}

function enumeration(values) {
  return Object.freeze({ type: 'enum', values: Object.freeze([...values]) });
}

function ratio() {
  return Object.freeze({ type: 'number', minimum: 0, maximum: 1 });
}

function count() {
  return Object.freeze({ type: 'integer', minimum: 0 });
}

function boolean() {
  return Object.freeze({ type: 'boolean' });
}

function fields(value) {
  return Object.freeze({ ...value });
}

const FIELD_SPECS = Object.freeze({
  DESCRIBE_PICTURE: fields({
    main_feature_coverage: ratio(),
    picture_consistency: enumeration(['CONSISTENT', 'PARTIAL', 'CONTRADICTORY']),
    grammar_control: quality(),
    vocabulary_adequacy: quality(),
    cohesion: quality(),
  }),
  RESPOND_TO_QUESTIONS: fields({
    direct_answer: boolean(),
    subquestions_total: count(),
    subquestions_answered: count(),
    grammar_control: quality(),
    vocabulary_adequacy: quality(),
    cohesion: quality(),
    relevance: quality(),
    completeness: quality(),
  }),
  RESPOND_USING_INFORMATION: fields({
    factual_accuracy: enumeration(['ACCURATE', 'MINOR_ERROR', 'MAJOR_ERROR', 'NOT_ASSESSABLE']),
    requested_details_total: count(),
    requested_details_correct: count(),
    irrelevant_information_present: boolean(),
    written_to_spoken_transformation: quality(),
    grammar_control: quality(),
    vocabulary_adequacy: quality(),
    cohesion: quality(),
    relevance: quality(),
    completeness: quality(),
  }),
  EXPRESS_AN_OPINION: fields({
    stance: enumeration(['CLEAR', 'AMBIGUOUS', 'MISSING']),
    reason_count: count(),
    developed_reason_count: count(),
    example_count: count(),
    support_development: quality(),
    grammar_control: quality(),
    vocabulary_adequacy: quality(),
    cohesion: quality(),
    relevance: quality(),
  }),
  WRITE_SENTENCE_PICTURE: fields({
    sentence_count: count(),
    grammar_control: quality(),
    picture_consistency: enumeration(['CONSISTENT', 'PARTIAL', 'CONTRADICTORY']),
    keywords_required: count(),
    keywords_used: count(),
    keyword_forms_appropriate: boolean(),
    keywords_in_same_sentence: boolean(),
  }),
  RESPOND_TO_WRITTEN_REQUEST: fields({
    required_tasks_total: count(),
    required_tasks_completed: count(),
    sentence_quality_variety: quality(),
    vocabulary_adequacy: quality(),
    organization: quality(),
    audience_register: enumeration(['APPROPRIATE', 'PARTIAL', 'INAPPROPRIATE', 'NOT_ASSESSABLE']),
  }),
  WRITE_OPINION_ESSAY: fields({
    stance: enumeration(['CLEAR', 'AMBIGUOUS', 'MISSING']),
    reason_count: count(),
    developed_reason_count: count(),
    example_count: count(),
    task_response: quality(),
    support_development: quality(),
    grammar_control: quality(),
    vocabulary_adequacy: quality(),
    organization: quality(),
  }),
});

function failure(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure(`${field} must be an object.`, 'IIG_AI_TASK_EVIDENCE_INVALID');
  }
  return value;
}

function text(value) {
  return String(value || '').normalize('NFKC').trim();
}

function mediaReferences(media = {}) {
  const references = [];
  for (const [role, assets] of Object.entries(media)) {
    for (const asset of Array.isArray(assets) ? assets : []) {
      references.push({
        role,
        asset_id: text(asset.id) || null,
        mime_type: text(asset.mimeType || asset.mime_type || asset.storage?.mimeType) || null,
        checksum_sha256: text(asset.checksumSha256 || asset.checksum_sha256) || null,
      });
    }
  }
  return references;
}

function buildTaskEvidenceRequest({ aiInput, transcript }) {
  const question = record(aiInput?.question, 'aiInput.question');
  const scorerType = normalizedType(question.scorerType);
  const fieldSpecs = FIELD_SPECS[scorerType];
  if (!fieldSpecs) {
    throw failure('The scorer type has no semantic task contract.', 'IIG_AI_TASK_EVIDENCE_TYPE_UNSUPPORTED');
  }
  const evidenceContract = getEvidenceContract(scorerType);
  const responseText = aiInput.response?.type === 'text'
    ? text(aiInput.response.text)
    : text(transcript);
  if (!responseText) {
    throw failure('Task evidence requires a candidate response.', 'IIG_AI_TASK_EVIDENCE_RESPONSE_REQUIRED');
  }
  const references = mediaReferences(aiInput.media);
  if (['DESCRIBE_PICTURE', 'WRITE_SENTENCE_PICTURE'].includes(scorerType)
    && !references.some(reference => reference.role === 'questionImages')) {
    throw failure('Picture task evidence requires a question image.', 'IIG_AI_TASK_EVIDENCE_IMAGE_REQUIRED');
  }
  if (scorerType === 'RESPOND_USING_INFORMATION'
    && !text(question.contextText)
    && !references.some(reference => reference.role === 'contextImages')) {
    throw failure('Information task evidence requires its source document.', 'IIG_AI_TASK_EVIDENCE_CONTEXT_REQUIRED');
  }
  return {
    schema_version: TASK_EVIDENCE_SCHEMA_VERSION,
    contract_version: evidenceContract.contractVersion,
    task_profile: evidenceContract.taskProfile,
    prompt: {
      question_text: text(question.questionText),
      prompt_text: text(question.promptText),
      context_text: text(question.contextText),
    },
    candidate_response: responseText,
    media_references: references,
    required_evidence_fields: Object.keys(fieldSpecs),
  };
}

function normalizeField(value, field, spec) {
  if (spec.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw failure(`${field} must be a boolean.`, 'IIG_AI_TASK_EVIDENCE_INVALID');
    }
    return value;
  }
  if (spec.type === 'enum') {
    const normalized = text(value).toUpperCase();
    if (!spec.values.includes(normalized)) {
      throw failure(`${field} contains an unsupported value.`, 'IIG_AI_TASK_EVIDENCE_INVALID');
    }
    return normalized;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < spec.minimum || parsed > (spec.maximum ?? Infinity)) {
    throw failure(`${field} is outside its accepted range.`, 'IIG_AI_TASK_EVIDENCE_INVALID');
  }
  if (spec.type === 'integer' && !Number.isInteger(parsed)) {
    throw failure(`${field} must be an integer.`, 'IIG_AI_TASK_EVIDENCE_INVALID');
  }
  return parsed;
}

function normalizeTaskEvidence(scorerType, value) {
  const type = normalizedType(scorerType);
  const fieldSpecs = FIELD_SPECS[type];
  if (!fieldSpecs) {
    throw failure('The scorer type has no semantic task contract.', 'IIG_AI_TASK_EVIDENCE_TYPE_UNSUPPORTED');
  }
  const evidenceContract = getEvidenceContract(type);
  const payload = record(value, 'taskEvidence');
  if (Number(payload.schema_version) !== TASK_EVIDENCE_SCHEMA_VERSION) {
    throw failure('Task evidence schema is incompatible.', 'IIG_AI_TASK_EVIDENCE_SCHEMA_UNSUPPORTED');
  }
  if (text(payload.contract_version) !== evidenceContract.contractVersion) {
    throw failure('Task evidence contract is incompatible.', 'IIG_AI_TASK_EVIDENCE_CONTRACT_MISMATCH');
  }
  const status = text(payload.status).toUpperCase();
  if (!TASK_STATUSES.includes(status)) {
    throw failure('Task evidence status is unsupported.', 'IIG_AI_TASK_EVIDENCE_INVALID');
  }
  const validity = record(payload.validity, 'validity');
  if (typeof validity.usable !== 'boolean' || typeof validity.task_related !== 'boolean') {
    throw failure('Task validity flags must be boolean.', 'IIG_AI_TASK_EVIDENCE_INVALID');
  }
  if (status !== 'SUCCESS') {
    return {
      schemaVersion: TASK_EVIDENCE_SCHEMA_VERSION,
      contractVersion: evidenceContract.contractVersion,
      status,
      validity: { usable: validity.usable, taskRelated: validity.task_related },
      evidence: null,
      flags: Array.isArray(payload.flags) ? payload.flags.map(text).filter(Boolean) : [],
    };
  }
  if (!validity.usable) {
    throw failure('Successful task evidence must be usable.', 'IIG_AI_TASK_EVIDENCE_CONTRADICTORY');
  }
  const evidence = record(payload.evidence, 'evidence');
  const normalizedEvidence = {};
  for (const [field, spec] of Object.entries(fieldSpecs)) {
    if (!Object.hasOwn(evidence, field)) {
      throw failure(`Task evidence is missing ${field}.`, 'IIG_AI_TASK_EVIDENCE_FIELD_MISSING');
    }
    normalizedEvidence[field] = normalizeField(evidence[field], `evidence.${field}`, spec);
  }
  validateRelationships(type, normalizedEvidence);
  return {
    schemaVersion: TASK_EVIDENCE_SCHEMA_VERSION,
    contractVersion: evidenceContract.contractVersion,
    status,
    validity: { usable: validity.usable, taskRelated: validity.task_related },
    evidence: normalizedEvidence,
    flags: Array.isArray(payload.flags) ? payload.flags.map(text).filter(Boolean) : [],
  };
}

function validateRelationships(type, evidence) {
  const pairs = {
    RESPOND_TO_QUESTIONS: [['subquestions_answered', 'subquestions_total']],
    RESPOND_USING_INFORMATION: [['requested_details_correct', 'requested_details_total']],
    WRITE_SENTENCE_PICTURE: [['keywords_used', 'keywords_required']],
    RESPOND_TO_WRITTEN_REQUEST: [['required_tasks_completed', 'required_tasks_total']],
    EXPRESS_AN_OPINION: [['developed_reason_count', 'reason_count']],
    WRITE_OPINION_ESSAY: [['developed_reason_count', 'reason_count']],
  };
  for (const [part, total] of pairs[type] || []) {
    if (evidence[part] > evidence[total]) {
      throw failure(`${part} cannot exceed ${total}.`, 'IIG_AI_TASK_EVIDENCE_CONTRADICTORY');
    }
  }
}

module.exports = {
  TASK_EVIDENCE_SCHEMA_VERSION,
  TASK_STATUSES,
  QUALITY_LEVELS,
  FIELD_SPECS,
  mediaReferences,
  validateRelationships,
  buildTaskEvidenceRequest,
  normalizeTaskEvidence,
};
