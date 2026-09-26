const service = require('../modules/public-exam-events/publicExamEventService');

async function detail(req, res) {
  res.set('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=30');
  res.json({ success: true, data: await service.getPublicEvent(req.params.eventId) });
}

async function register(req, res) {
  const data = await service.registerCandidate(req.params.eventId, req.body);
  res.status(201).json({ success: true, data });
}

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

async function introduction(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await service.getIntroduction(req.params.eventId, bearerToken(req)) });
}

async function startAttempt(req, res) {
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ success: true, data: await service.startAttempt(req.params.eventId, bearerToken(req), req.body) });
}

async function questions(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.getAttemptQuestions(
    req.params.eventId,
    req.params.attemptId,
    bearerToken(req),
  ) });
}

async function saveAnswer(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.saveAttemptAnswer(
    req.params.eventId,
    req.params.attemptId,
    req.params.subQuestionId,
    bearerToken(req),
    req.body,
  ) });
}

async function submissionSummary(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.getSubmissionSummary(req.params.eventId, req.params.attemptId, bearerToken(req)) });
}

async function submitAttempt(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.submitAttempt(req.params.eventId, req.params.attemptId, bearerToken(req)) });
}

module.exports = { detail, register, introduction, startAttempt, questions, saveAnswer, submissionSummary, submitAttempt };
