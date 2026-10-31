function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  if (typeof value.result_json === 'string') {
    try { return JSON.parse(value.result_json); } catch { return value; }
  }
  return value;
}

function commentFrom(output) {
  const value = asObject(output);
  if (typeof value.comment === 'string') return value.comment;
  if (value.comment && typeof value.comment.text === 'string') return value.comment.text;
  return [value.strength, value.improvement, value.action].filter(Boolean).join(' ') || null;
}

function errorsFrom(output, sourceText) {
  const errors = Array.isArray(asObject(output).errors) ? asObject(output).errors : [];
  return errors.map(error => {
    const evidence = Array.isArray(error.evidence)
      ? error.evidence.find(item => typeof item === 'string' && item)
      : null;
    const start = evidence && sourceText ? sourceText.indexOf(evidence) : -1;
    return {
      span: evidence ? {
        start: start >= 0 ? start : null,
        end: start >= 0 ? start + evidence.length : null,
        text: evidence,
      } : null,
      type: String(error.error_type || error.errorType || error.type || 'OTHER'),
      priority: String(error.severity || error.priority || 'MEDIUM').toUpperCase(),
      comment: String(error.message_vi || error.messageVi || error.comment || ''),
    };
  });
}

function buildResultData({ job, groups, questions }) {
  return {
    jobId: job.id,
    scoringId: job.scoringId,
    keycode: job.keycode,
    scores: groups.map(group => ({
      groupId: group.sourceGroupId,
      appliedQuestionIds: group.sourceQuestionIds,
      score: group.score === null ? null : Number(group.score),
    })),
    details: questions.map(question => ({
      questionId: question.sourceQuestionId,
      comment: commentFrom(question.output),
      errors: errorsFrom(question.output, question.sourceText),
      transcript: question.transcript || question.sourceText || null,
    })),
  };
}

function buildPayload({ eventId, occurredAt, tenantCode, job, groups, questions }) {
  return {
    schemaVersion: 'webhook-scoring-result-v1',
    eventId,
    eventType: 'scoring.completed',
    occurredAt,
    tenantCode,
    data: buildResultData({ job, groups, questions }),
  };
}

module.exports = { buildPayload, buildResultData, commentFrom, errorsFrom };
