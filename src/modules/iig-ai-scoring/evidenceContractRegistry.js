const SPEAKING_BASE_TRAITS = Object.freeze([
  Object.freeze({ key: 'pronunciation', label: 'Pronunciation' }),
  Object.freeze({ key: 'intonation_stress', label: 'Intonation and Stress' }),
]);

const SPEAKING_EXTENDED_TRAITS = Object.freeze([
  ...SPEAKING_BASE_TRAITS,
  Object.freeze({ key: 'grammar', label: 'Grammar' }),
  Object.freeze({ key: 'vocabulary', label: 'Vocabulary' }),
  Object.freeze({ key: 'cohesion', label: 'Cohesion' }),
]);

const SPEAKING_FULL_TRAITS = Object.freeze([
  ...SPEAKING_EXTENDED_TRAITS,
  Object.freeze({ key: 'relevance', label: 'Relevance of Content' }),
  Object.freeze({ key: 'completeness', label: 'Completeness of Content' }),
]);

function contract(value) {
  return Object.freeze({
    ...value,
    officialScale: Object.freeze([...value.officialScale]),
    officialTraits: Object.freeze(value.officialTraits.map(trait => Object.freeze({ ...trait }))),
    requiredEvidenceFamilies: Object.freeze([...value.requiredEvidenceFamilies]),
    auxiliaryEvidenceFamilies: Object.freeze([...value.auxiliaryEvidenceFamilies]),
  });
}

const CONTRACTS = Object.freeze({
  READ_TEXT_ALOUD: contract({
    contractVersion: 'ets-rta-evidence-v2',
    taskProfile: 'READ_ALOUD',
    officialScoreMode: 'TRAIT_SCORES',
    officialScale: [0, 1, 2, 3],
    officialTraits: SPEAKING_BASE_TRAITS,
    requiredEvidenceFamilies: ['validity', 'alignment', 'pronunciation', 'prosody'],
    auxiliaryEvidenceFamilies: ['fluency', 'audio_quality'],
  }),
  DESCRIBE_PICTURE: contract({
    contractVersion: 'ets-describe-picture-evidence-v1',
    taskProfile: 'DESCRIBE_PICTURE',
    officialScoreMode: 'HOLISTIC',
    officialScale: [0, 1, 2, 3],
    officialTraits: SPEAKING_EXTENDED_TRAITS,
    requiredEvidenceFamilies: ['validity', 'speech_delivery', 'language_control', 'picture_coverage', 'cohesion'],
    auxiliaryEvidenceFamilies: ['fluency', 'audio_quality', 'scene_entities'],
  }),
  RESPOND_TO_QUESTIONS: contract({
    contractVersion: 'ets-respond-questions-evidence-v1',
    taskProfile: 'RESPOND_TO_QUESTIONS',
    officialScoreMode: 'HOLISTIC',
    officialScale: [0, 1, 2, 3],
    officialTraits: SPEAKING_FULL_TRAITS,
    requiredEvidenceFamilies: ['validity', 'speech_delivery', 'language_control', 'relevance', 'completeness'],
    auxiliaryEvidenceFamilies: ['fluency', 'audio_quality', 'subquestion_coverage'],
  }),
  RESPOND_USING_INFORMATION: contract({
    contractVersion: 'ets-respond-information-evidence-v1',
    taskProfile: 'RESPOND_USING_INFORMATION',
    officialScoreMode: 'HOLISTIC',
    officialScale: [0, 1, 2, 3],
    officialTraits: SPEAKING_FULL_TRAITS,
    requiredEvidenceFamilies: [
      'validity', 'speech_delivery', 'language_control', 'relevance', 'completeness', 'factual_accuracy',
    ],
    auxiliaryEvidenceFamilies: ['fluency', 'audio_quality', 'document_alignment'],
  }),
  EXPRESS_AN_OPINION: contract({
    contractVersion: 'ets-express-opinion-evidence-v1',
    taskProfile: 'EXPRESS_AN_OPINION',
    officialScoreMode: 'HOLISTIC',
    officialScale: [0, 1, 2, 3, 4, 5],
    officialTraits: SPEAKING_FULL_TRAITS,
    requiredEvidenceFamilies: [
      'validity', 'speech_delivery', 'language_control', 'relevance', 'stance', 'support_development', 'cohesion',
    ],
    auxiliaryEvidenceFamilies: ['fluency', 'audio_quality', 'argument_structure'],
  }),
  WRITE_SENTENCE_PICTURE: contract({
    contractVersion: 'ets-write-sentence-picture-evidence-v1',
    taskProfile: 'WRITE_SENTENCE_PICTURE',
    officialScoreMode: 'HOLISTIC',
    officialScale: [0, 1, 2, 3],
    officialTraits: [
      { key: 'grammar', label: 'Grammar' },
      { key: 'picture_relevance', label: 'Relevance to the Picture' },
    ],
    requiredEvidenceFamilies: ['validity', 'grammar', 'picture_relevance', 'keyword_fulfillment'],
    auxiliaryEvidenceFamilies: ['sentence_structure', 'mechanics'],
  }),
  RESPOND_TO_WRITTEN_REQUEST: contract({
    contractVersion: 'ets-written-request-evidence-v1',
    taskProfile: 'RESPOND_TO_WRITTEN_REQUEST',
    officialScoreMode: 'HOLISTIC',
    officialScale: [0, 1, 2, 3, 4],
    officialTraits: [
      { key: 'sentence_quality_variety', label: 'Quality and Variety of Sentences' },
      { key: 'vocabulary', label: 'Vocabulary' },
      { key: 'organization', label: 'Organization' },
    ],
    requiredEvidenceFamilies: [
      'validity', 'task_fulfillment', 'sentence_quality_variety', 'vocabulary', 'organization', 'audience_register',
    ],
    auxiliaryEvidenceFamilies: ['mechanics', 'format'],
  }),
  WRITE_OPINION_ESSAY: contract({
    contractVersion: 'ets-opinion-essay-evidence-v1',
    taskProfile: 'WRITE_OPINION_ESSAY',
    officialScoreMode: 'HOLISTIC',
    officialScale: [0, 1, 2, 3, 4, 5],
    officialTraits: [
      { key: 'opinion_support', label: 'Opinion Support with Reasons or Examples' },
      { key: 'grammar', label: 'Grammar' },
      { key: 'vocabulary', label: 'Vocabulary' },
      { key: 'organization', label: 'Organization' },
    ],
    requiredEvidenceFamilies: [
      'validity', 'task_response', 'support_development', 'grammar', 'vocabulary', 'organization',
    ],
    auxiliaryEvidenceFamilies: ['mechanics', 'argument_structure'],
  }),
});

function normalizedType(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase();
}

function contractError(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function getEvidenceContract(scorerType) {
  const type = normalizedType(scorerType);
  const contract = CONTRACTS[type];
  if (!contract) {
    throw contractError(
      `No approved evidence contract exists for scorer type ${type || '(empty)'}.`,
      'IIG_AI_EVIDENCE_CONTRACT_UNSUPPORTED'
    );
  }
  return contract;
}

module.exports = {
  READ_ALOUD_EVIDENCE_CONTRACT_VERSION: CONTRACTS.READ_TEXT_ALOUD.contractVersion,
  SPEAKING_BASE_TRAITS,
  SPEAKING_EXTENDED_TRAITS,
  SPEAKING_FULL_TRAITS,
  CONTRACTS,
  normalizedType,
  getEvidenceContract,
};
