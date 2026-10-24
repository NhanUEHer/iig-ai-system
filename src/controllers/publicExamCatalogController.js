const service = require('../modules/public-exams/publicExamCatalogService');
const attempts = require('../modules/public-exams/publicExamAttemptService');

const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

async function send(res, operation, statusCode = 200) {
  const data = await operation;
  res.locals.cacheStatus = data?.cache;
  res.locals.answerStorage = data?.storage;
  return res.status(statusCode).json({ success: true, data });
}

const list = async (req, res) => res.json({ success: true, ...await service.list(req.query) });
const detail = async (req, res) => res.json({ success: true, data: await service.detail(req.params.examId) });
const groups = async (_req, res) => res.json({ success: true, data: await service.listGroups() });
const register = async (req, res) => send(res, attempts.register(req.params.examId, req.body), 201);
const startAttempt = async (req, res) => send(res, attempts.start(req.params.examId, bearer(req), req.body), 201);
const resumeAttempt = async (req, res) => send(res, attempts.resume(req.params.examId, req.params.attemptId, bearer(req)));
const structure = async (req, res) => send(res, attempts.structure(req.params.examId, req.params.attemptId, bearer(req)));
const partQuestions = async (req, res) => send(res, attempts.partQuestions(req.params.examId, req.params.attemptId, req.params.partId, bearer(req)));
const questionGroup = async (req, res) => send(res, attempts.questionGroup(req.params.examId, req.params.attemptId, req.params.parentQuestionId, bearer(req)));
const saveAnswer = async (req, res) => send(res, attempts.saveAnswer(req.params.examId, req.params.attemptId, req.params.subQuestionId, bearer(req), req.body));
const submitAttempt = async (req, res) => send(res, attempts.submit(req.params.examId, req.params.attemptId, bearer(req)));
const attemptResult = async (req, res) => send(res, attempts.result(req.params.examId, req.params.attemptId, bearer(req)));

module.exports = { list, detail, groups, register, startAttempt, resumeAttempt, structure, partQuestions, questionGroup, saveAnswer, submitAttempt, attemptResult };
