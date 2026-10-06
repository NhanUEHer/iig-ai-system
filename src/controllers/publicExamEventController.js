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

async function attemptManifest(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.getAttemptManifest(req.params.eventId, req.params.attemptId, bearerToken(req)) });
}

async function attemptStructure(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.getAttemptStructure(req.params.eventId, req.params.attemptId, bearerToken(req)) });
}

async function partQuestions(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.getAttemptPartQuestions(req.params.eventId, req.params.attemptId, req.params.partId, bearerToken(req)) });
}

async function questionDetail(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.getAttemptQuestion(req.params.eventId, req.params.attemptId, req.params.subQuestionId, bearerToken(req)) });
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

async function createRecording(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.status(201).json({ success: true, data: await service.createRecordingUpload(req.params.eventId, req.params.attemptId, req.params.subQuestionId, bearerToken(req), req.body) });
}

async function finalizeRecording(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.finalizeRecording(req.params.eventId, req.params.attemptId, req.params.subQuestionId, req.params.recordingId, bearerToken(req), req.body) });
}

async function getRecording(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.getRecording(req.params.eventId, req.params.attemptId, req.params.subQuestionId, bearerToken(req)) });
}

async function deleteRecording(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.deleteRecording(req.params.eventId, req.params.attemptId, req.params.subQuestionId, req.params.recordingId, bearerToken(req)) });
}

async function submissionSummary(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.getSubmissionSummary(req.params.eventId, req.params.attemptId, bearerToken(req)) });
}

async function submitAttempt(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: await service.submitAttempt(
    req.params.eventId,
    req.params.attemptId,
    bearerToken(req),
    { answers: req.body?.answers },
  ) });
}

module.exports = {
  detail, register, introduction, startAttempt, questions,
  attemptManifest, attemptStructure, partQuestions, questionDetail,
  saveAnswer, createRecording, finalizeRecording, getRecording, deleteRecording,
  submissionSummary, submitAttempt,
};
