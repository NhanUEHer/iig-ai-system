const service = require('../modules/public-exams/publicExamCatalogService');
const attempts = require('../modules/public-exams/publicExamAttemptService');

const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

const list = async (req, res) => res.json({ success: true, ...await service.list(req.query) });
const detail = async (req, res) => res.json({ success: true, data: await service.detail(req.params.examId) });
const groups = async (_req, res) => res.json({ success: true, data: await service.listGroups() });
const register = async (req, res) => res.status(201).json({ success: true, data: await attempts.register(req.params.examId, req.body) });
const startAttempt = async (req, res) => res.status(201).json({ success: true, data: await attempts.start(req.params.examId, bearer(req), req.body) });
const resumeAttempt = async (req, res) => res.json({ success: true, data: await attempts.resume(req.params.examId, req.params.attemptId, bearer(req)) });
const structure = async (req, res) => res.json({ success: true, data: await attempts.structure(req.params.examId, req.params.attemptId, bearer(req)) });
const partQuestions = async (req, res) => res.json({ success: true, data: await attempts.partQuestions(req.params.examId, req.params.attemptId, req.params.partId, bearer(req)) });
const questionGroup = async (req, res) => res.json({ success: true, data: await attempts.questionGroup(req.params.examId, req.params.attemptId, req.params.parentQuestionId, bearer(req)) });
const saveAnswer = async (req, res) => res.json({ success: true, data: await attempts.saveAnswer(req.params.examId, req.params.attemptId, req.params.subQuestionId, bearer(req), req.body) });
const submitAttempt = async (req, res) => res.json({ success: true, data: await attempts.submit(req.params.examId, req.params.attemptId, bearer(req)) });
const attemptResult = async (req, res) => res.json({ success: true, data: await attempts.result(req.params.examId, req.params.attemptId, bearer(req)) });

module.exports = { list, detail, groups, register, startAttempt, resumeAttempt, structure, partQuestions, questionGroup, saveAnswer, submitAttempt, attemptResult };
