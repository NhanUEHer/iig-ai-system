function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeEvidence(features, stage, normalizedEvidence) {
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    throw contractError('Feature payload must be an object.', 'IIG_AI_EVIDENCE_FEATURES_INVALID');
  }
  if (!normalizedEvidence || typeof normalizedEvidence !== 'object' || Array.isArray(normalizedEvidence)) {
    throw contractError('Normalized evidence must be an object.', 'IIG_AI_EVIDENCE_RESULT_INVALID');
  }
  const merged = clone(features);
  merged.completion = merged.completion || {};
  if (stage === 'SPEECH_EVIDENCE') {
    if (merged.completion.speech === 'NOT_REQUIRED') {
      throw contractError('Speech evidence is not required for this feature set.', 'IIG_AI_EVIDENCE_STAGE_UNEXPECTED');
    }
    merged.speech = clone(normalizedEvidence);
    merged.completion.speech = 'READY';
  } else if (stage === 'TASK_EVIDENCE') {
    if (merged.completion.taskSemantic === 'NOT_REQUIRED') {
      throw contractError('Task evidence is not required for this feature set.', 'IIG_AI_EVIDENCE_STAGE_UNEXPECTED');
    }
    merged.task = merged.task || {};
    merged.task.semantic = clone(normalizedEvidence);
    merged.completion.taskSemantic = 'READY';
  } else {
    throw contractError(`Unsupported evidence stage ${stage}.`, 'IIG_AI_EVIDENCE_STAGE_UNSUPPORTED');
  }
  return {
    features: merged,
    ready: ['deterministic', 'speech', 'taskSemantic'].every(key => (
      ['READY', 'NOT_REQUIRED'].includes(merged.completion[key])
    )),
  };
}

function contractError(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

module.exports = { mergeEvidence };
