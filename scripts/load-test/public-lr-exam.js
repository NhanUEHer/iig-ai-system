import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = String(__ENV.BASE_URL || 'http://localhost:5005').replace(/\/$/, '');
const EXAM_ID = __ENV.EXAM_ID || '';
const EXAM_CODE = __ENV.EXAM_CODE || 'PUBLIC-LR-01';
const VUS = positiveInteger(__ENV.VUS, 5);
const THINK_TIME = nonNegativeNumber(__ENV.THINK_TIME, 0.05);
const ANSWER_PERCENT = Math.min(100, nonNegativeNumber(__ENV.ANSWER_PERCENT, 100));
const VERIFY_IDEMPOTENCY = String(__ENV.VERIFY_IDEMPOTENCY || 'false').toLowerCase() === 'true';

const businessErrors = new Rate('business_errors');
const catalogDuration = new Trend('catalog_duration', true);
const registrationDuration = new Trend('registration_duration', true);
const startDuration = new Trend('start_duration', true);
const structureDuration = new Trend('structure_duration', true);
const questionDuration = new Trend('question_duration', true);
const answerDuration = new Trend('answer_duration', true);
const resumeDuration = new Trend('resume_duration', true);
const submitDuration = new Trend('submit_duration', true);
const resultDuration = new Trend('result_duration', true);

export const options = {
  scenarios: {
    complete_direct_exam: {
      executor: 'per-vu-iterations', vus: VUS, iterations: 1,
      maxDuration: __ENV.MAX_DURATION || '15m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], business_errors: ['rate<0.01'], http_req_duration: ['p(95)<2000'],
    catalog_duration: ['p(95)<2500'], registration_duration: ['p(95)<2500'], start_duration: ['p(95)<2500'],
    structure_duration: ['p(95)<2500'], question_duration: ['p(95)<2000'], answer_duration: ['p(95)<1500'],
    resume_duration: ['p(95)<2500'], submit_duration: ['p(95)<3000'], result_duration: ['p(95)<3000'],
  },
};

function positiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function parse(response, label, expectedStatus = 200) {
  let body;
  try { body = response.json(); } catch (_) {
    businessErrors.add(1); fail(`${label}: response is not JSON (HTTP ${response.status})`);
  }
  const passed = check(response, {
    [`${label}: HTTP ${expectedStatus}`]: value => value.status === expectedStatus,
    [`${label}: success=true`]: () => body && body.success === true,
  });
  businessErrors.add(!passed);
  if (!passed) fail(`${label}: HTTP ${response.status} ${response.body}`);
  return body.data;
}

function jsonHeaders(token) {
  return {
    Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function deterministicUuid(runId, vu) {
  const left = (Number(runId) + Number(vu)).toString(16).slice(-8).padStart(8, '0');
  const right = `${Number(runId).toString(16)}${Number(vu).toString(16)}`.slice(-12).padStart(12, '0');
  return `${left}-0000-4000-8000-${right}`;
}

function resolveExam() {
  if (EXAM_ID) return EXAM_ID;
  const response = http.get(`${BASE_URL}/api/public/exams?search=${encodeURIComponent(EXAM_CODE)}&limit=50`, {
    headers: jsonHeaders(), tags: { endpoint: 'catalog', name: 'GET /api/public/exams' },
  });
  catalogDuration.add(response.timings.duration);
  const exams = parse(response, 'catalog');
  const exam = exams.find(item => item.code === EXAM_CODE);
  if (!exam) fail(`Cannot find active published exam ${EXAM_CODE}. Set EXAM_ID or seed the catalog.`);
  return exam.id;
}

export function setup() {
  const examId = resolveExam();
  const response = http.get(`${BASE_URL}/api/public/exams/${examId}`, {
    headers: jsonHeaders(), tags: { endpoint: 'exam_detail', name: 'GET /api/public/exams/:examId' },
  });
  catalogDuration.add(response.timings.duration);
  const exam = parse(response, 'exam detail');
  if (!['LR', 'LISTENING_READING'].includes(exam.examType)) fail(`Expected an LR exam, got ${exam.examType}`);
  if (!exam.questionCount) fail('The selected exam has no published questions.');
  if (!exam.sections?.length) fail('The selected exam has no published sections.');
  return { runId: Date.now(), examId, expectedQuestionCount: Number(exam.questionCount) };
}

function registerCandidate(examPath, unique, runId) {
  const response = http.post(`${examPath}/candidates`, JSON.stringify({
    fullName: `Load Test ${unique}`,
    phone: `09${String(runId).slice(-5)}${String(__VU).padStart(3, '0')}`,
    email: `direct.load.${unique}@example.com`, birthYear: 2002,
    toeicExperience: 'STUDIED_NOT_TESTED', privacyConsent: true, marketingConsent: false,
  }), {
    headers: jsonHeaders(), tags: { endpoint: 'register_candidate', name: 'POST /api/public/exams/:examId/candidates' },
  });
  registrationDuration.add(response.timings.duration);
  return parse(response, 'register candidate', 201);
}

function loadQuestions(examPath, attempt) {
  let response = http.get(`${examPath}/attempts/${attempt.attemptId}/structure`, {
    headers: jsonHeaders(attempt.attemptToken),
    tags: { endpoint: 'structure', name: 'GET /api/public/exams/:examId/attempts/:attemptId/structure' },
  });
  structureDuration.add(response.timings.duration);
  const structure = parse(response, 'attempt structure');
  const parts = structure.sections.flatMap(section => section.parts || []);
  const questions = [];
  for (const part of parts) {
    response = http.get(`${examPath}/attempts/${attempt.attemptId}/parts/${part.id}/questions`, {
      headers: jsonHeaders(attempt.attemptToken),
      tags: { endpoint: 'part_questions', name: 'GET /api/public/exams/:examId/attempts/:attemptId/parts/:partId/questions' },
    });
    questionDuration.add(response.timings.duration);
    const partDelivery = parse(response, 'part questions');
    for (const group of partDelivery.questionGroups || []) {
      response = http.get(`${examPath}/attempts/${attempt.attemptId}/question-groups/${group.id}`, {
        headers: jsonHeaders(attempt.attemptToken),
        tags: { endpoint: 'question_group', name: 'GET /api/public/exams/:examId/attempts/:attemptId/question-groups/:parentQuestionId' },
      });
      questionDuration.add(response.timings.duration);
      const groupDelivery = parse(response, 'question group');
      questions.push(...(groupDelivery.questionGroup?.questions || []));
    }
  }
  return questions;
}

function saveAnswers(examPath, attempt, questions) {
  const answerCount = Math.min(questions.length, Math.round(questions.length * ANSWER_PERCENT / 100));
  for (let index = 0; index < answerCount; index += 1) {
    const question = questions[index];
    if (!question.options?.length) fail(`Question ${question.id} has no selectable options.`);
    const option = question.options[(index + __VU) % question.options.length];
    const response = http.put(`${examPath}/attempts/${attempt.attemptId}/answers/${question.id}`,
      JSON.stringify({ selectedOptionKey: option.key }), {
        headers: jsonHeaders(attempt.attemptToken),
        tags: { endpoint: 'save_answer', name: 'PUT /api/public/exams/:examId/attempts/:attemptId/answers/:subQuestionId' },
      });
    answerDuration.add(response.timings.duration);
    const saved = parse(response, 'save answer');
    const passed = check(saved, {
      'save answer: question matches': value => value.subQuestionId === question.id,
      'save answer: storage reported': value => ['REDIS', 'POSTGRESQL_FALLBACK'].includes(value.storage),
    });
    businessErrors.add(!passed);
    if (!passed) fail(`Unexpected saved answer: ${JSON.stringify(saved)}`);
    if (THINK_TIME > 0) sleep(THINK_TIME);
  }
  return answerCount;
}

function verifyResume(examPath, attempt, expectedAnswered) {
  const response = http.post(`${examPath}/attempts/${attempt.attemptId}/resume`, '{}', {
    headers: jsonHeaders(attempt.attemptToken),
    tags: { endpoint: 'resume', name: 'POST /api/public/exams/:examId/attempts/:attemptId/resume' },
  });
  resumeDuration.add(response.timings.duration);
  const resumed = parse(response, 'resume attempt');
  const passed = check(resumed, {
    'resume: attempt remains active': value => value.status === 'IN_PROGRESS',
    'resume: all saved answers recovered': value => value.answeredQuestionIds?.length === expectedAnswered,
    'resume: remaining time is available': value => Number.isFinite(value.remainingSeconds) && value.remainingSeconds >= 0,
  });
  businessErrors.add(!passed);
  if (!passed) fail(`Unexpected resume result: ${JSON.stringify(resumed)}`);
}

export default function (data) {
  const unique = `${data.runId}-${__VU}-${__ITER}`;
  const examPath = `${BASE_URL}/api/public/exams/${data.examId}`;
  const registration = registerCandidate(examPath, unique, data.runId);
  let response = http.post(`${examPath}/attempts`, JSON.stringify({
    audioConfirmed: true, clientSessionId: deterministicUuid(data.runId, __VU),
  }), {
    headers: jsonHeaders(registration.candidateToken),
    tags: { endpoint: 'start_attempt', name: 'POST /api/public/exams/:examId/attempts' },
  });
  startDuration.add(response.timings.duration);
  const attempt = parse(response, 'start attempt', 201);
  const started = check(attempt, {
    'start: attempt token returned': value => Boolean(value.attemptId && value.attemptToken),
    'start: new attempt is not resumed': value => value.resumed === false,
  });
  businessErrors.add(!started);
  if (!started) fail(`Unexpected start result: ${JSON.stringify(attempt)}`);

  const questions = loadQuestions(examPath, attempt);
  if (questions.length !== data.expectedQuestionCount) {
    businessErrors.add(1); fail(`Expected ${data.expectedQuestionCount} delivered questions, got ${questions.length}`);
  }
  const answeredCount = saveAnswers(examPath, attempt, questions);
  verifyResume(examPath, attempt, answeredCount);

  response = http.post(`${examPath}/attempts/${attempt.attemptId}/submit`, '{}', {
    headers: jsonHeaders(attempt.attemptToken),
    tags: { endpoint: 'submit', name: 'POST /api/public/exams/:examId/attempts/:attemptId/submit' },
  });
  submitDuration.add(response.timings.duration);
  const submitted = parse(response, 'submit attempt');
  const submitPassed = check(submitted, {
    'submit: status submitted': value => value.status === 'SUBMITTED',
    'submit: question total preserved': value => value.totalQuestions === data.expectedQuestionCount,
    'submit: answered total preserved': value => value.answeredCount === answeredCount,
    'submit: first submission': value => value.alreadySubmitted === false,
    'submit: score range returned': value => Number.isFinite(value.scoreRange?.min) && Number.isFinite(value.scoreRange?.max),
  });
  businessErrors.add(!submitPassed);
  if (!submitPassed) fail(`Unexpected submit result: ${JSON.stringify(submitted)}`);

  if (VERIFY_IDEMPOTENCY) {
    response = http.post(`${examPath}/attempts/${attempt.attemptId}/submit`, '{}', {
      headers: jsonHeaders(attempt.attemptToken),
      tags: { endpoint: 'submit_idempotent', name: 'POST /api/public/exams/:examId/attempts/:attemptId/submit [repeat]' },
    });
    const repeated = parse(response, 'repeat submit');
    const repeatedPassed = check(repeated, {
      'repeat submit: stored result returned': value => value.alreadySubmitted === true,
      'repeat submit: score unchanged': value => value.totalScore === submitted.totalScore,
    });
    businessErrors.add(!repeatedPassed);
    if (!repeatedPassed) fail(`Unexpected repeated submit result: ${JSON.stringify(repeated)}`);
  }

  response = http.get(`${examPath}/attempts/${attempt.attemptId}/result`, {
    headers: jsonHeaders(attempt.attemptToken),
    tags: { endpoint: 'result', name: 'GET /api/public/exams/:examId/attempts/:attemptId/result' },
  });
  resultDuration.add(response.timings.duration);
  const result = parse(response, 'attempt result');
  const resultPassed = check(result, {
    'result: attempt matches': value => value.attemptId === attempt.attemptId,
    'result: status submitted': value => value.status === 'SUBMITTED',
    'result: score matches submit': value => value.totalScore === submitted.totalScore,
    'result: section scoring returned': value => Array.isArray(value.sections) && value.sections.length > 0,
    'result: candidate returned': value => Boolean(value.candidate?.id),
  });
  businessErrors.add(!resultPassed);
  if (!resultPassed) fail(`Unexpected attempt result: ${JSON.stringify(result)}`);
}
