require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const db = require('../src/config/db');

const BASE_URL = String(process.env.DIRECT_LR_E2E_BASE_URL || 'http://127.0.0.1:5006').replace(/\/$/, '');
const EXAM_ID = process.env.DIRECT_LR_E2E_EXAM_ID || '';
const EXAM_CODE = process.env.DIRECT_LR_E2E_EXAM_CODE || 'PUBLIC-LR-01';

async function request(path, { token, expected = 200, ...options } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  assert.equal(response.status, expected, `${options.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  if (expected < 400) assert.equal(body?.success, true, `${path} did not return success=true`);
  return body;
}

async function resolveExamId() {
  if (EXAM_ID) return EXAM_ID;
  const catalog = await request(`/api/public/exams?search=${encodeURIComponent(EXAM_CODE)}&limit=50`);
  const exam = catalog.data.find(item => item.code === EXAM_CODE);
  assert.ok(exam, `Không tìm thấy đề ${EXAM_CODE}`);
  return exam.id;
}

async function loadQuestions(examPath, attemptId, attemptToken) {
  const structure = await request(`${examPath}/attempts/${attemptId}/structure`, { token: attemptToken });
  const parts = structure.data.sections.flatMap(section => section.parts || []);
  const questions = [];
  for (const part of parts) {
    const partDelivery = await request(`${examPath}/attempts/${attemptId}/parts/${part.id}/questions`, { token: attemptToken });
    for (const group of partDelivery.data.questionGroups || []) {
      const groupDelivery = await request(`${examPath}/attempts/${attemptId}/question-groups/${group.id}`, { token: attemptToken });
      questions.push(...groupDelivery.data.questionGroup.questions);
    }
  }
  return { structure: structure.data, questions };
}

async function main() {
  const runId = Date.now();
  const report = [];
  const examId = await resolveExamId();
  const examPath = `/api/public/exams/${examId}`;
  const exam = await request(examPath);
  assert.ok(['LR', 'LISTENING_READING'].includes(exam.data.examType));
  assert.ok(exam.data.questionCount > 0);
  assert.ok(exam.data.sections.length > 0);
  report.push(`Catalog trả đúng đề LR ${exam.data.questionCount} câu`);

  const registration = await request(`${examPath}/candidates`, {
    method: 'POST', expected: 201,
    body: JSON.stringify({
      fullName: `Regression LR ${runId}`,
      phone: `09${String(runId).slice(-8)}`,
      email: `regression.lr.${runId}@example.com`,
      birthYear: 2002,
      toeicExperience: 'STUDIED_NOT_TESTED',
      privacyConsent: true,
      marketingConsent: false,
    }),
  });
  const candidateToken = registration.data.candidateToken;
  assert.ok(candidateToken);
  report.push('Đăng ký thí sinh và nhận candidate token');

  const clientSessionId = crypto.randomUUID();
  const started = await request(`${examPath}/attempts`, {
    method: 'POST', expected: 201, token: candidateToken,
    body: JSON.stringify({ audioConfirmed: true, clientSessionId }),
  });
  const { attemptId, attemptToken } = started.data;
  assert.ok(attemptId && attemptToken);
  assert.equal(started.data.resumed, false);
  report.push('Tạo attempt mới với quyền sở hữu browser session');

  const resumedStart = await request(`${examPath}/attempts`, {
    method: 'POST', expected: 201, token: candidateToken,
    body: JSON.stringify({ audioConfirmed: true, clientSessionId }),
  });
  assert.equal(resumedStart.data.attemptId, attemptId);
  assert.equal(resumedStart.data.resumed, true);
  report.push('Cùng browser session vào lại không tạo attempt trùng');

  const conflict = await request(`${examPath}/attempts`, {
    method: 'POST', expected: 409, token: candidateToken,
    body: JSON.stringify({ audioConfirmed: true, clientSessionId: crypto.randomUUID() }),
  });
  assert.equal(conflict.code, 'ATTEMPT_ACTIVE_ON_ANOTHER_DEVICE');
  report.push('Browser hoặc thiết bị khác bị chặn với mã conflict đúng');

  const delivery = await loadQuestions(examPath, attemptId, attemptToken);
  assert.equal(delivery.questions.length, exam.data.questionCount);
  assert.ok(delivery.questions.every(question => question.options.length >= 2));
  report.push('Structure, Part và nhóm câu hỏi trả đủ dữ liệu an toàn');

  const first = delivery.questions[0];
  await request(`${examPath}/attempts/${attemptId}/answers/${first.id}`, {
    method: 'PUT', token: attemptToken,
    body: JSON.stringify({ selectedOptionKey: first.options[0].key }),
  });
  const resumed = await request(`${examPath}/attempts/${attemptId}/resume`, {
    method: 'POST', token: attemptToken, body: '{}',
  });
  assert.deepEqual(resumed.data.answeredQuestionIds, [first.id]);
  report.push('F5/resume khôi phục chính xác đáp án đã lưu');

  const invalid = await request(`${examPath}/attempts/${attemptId}/answers/${first.id}`, {
    method: 'PUT', token: attemptToken, expected: 400,
    body: JSON.stringify({ selectedOptionKey: 'INVALID_OPTION' }),
  });
  assert.equal(invalid.code, 'INVALID_SELECTED_OPTION');
  report.push('API từ chối lựa chọn không thuộc câu hỏi');

  for (const [index, question] of delivery.questions.entries()) {
    await request(`${examPath}/attempts/${attemptId}/answers/${question.id}`, {
      method: 'PUT', token: attemptToken,
      body: JSON.stringify({ selectedOptionKey: question.options[index % question.options.length].key }),
    });
  }
  const fullyResumed = await request(`${examPath}/attempts/${attemptId}/resume`, {
    method: 'POST', token: attemptToken, body: '{}',
  });
  assert.equal(fullyResumed.data.answeredQuestionIds.length, exam.data.questionCount);
  report.push('Autosave và resume bảo toàn toàn bộ đáp án');

  const submitted = await request(`${examPath}/attempts/${attemptId}/submit`, {
    method: 'POST', token: attemptToken, body: '{}',
  });
  assert.equal(submitted.data.status, 'SUBMITTED');
  assert.equal(submitted.data.totalQuestions, exam.data.questionCount);
  assert.equal(submitted.data.answeredCount, exam.data.questionCount);
  assert.equal(submitted.data.alreadySubmitted, false);
  assert.ok(submitted.data.sections.length > 0);
  report.push('Submit lưu kết quả tổng và điểm từng section');

  const duplicate = await request(`${examPath}/attempts/${attemptId}/submit`, {
    method: 'POST', token: attemptToken, body: '{}',
  });
  assert.equal(duplicate.data.alreadySubmitted, true);
  assert.equal(duplicate.data.totalScore, submitted.data.totalScore);
  report.push('Submit lặp trả kết quả cũ, không chấm hoặc ghi trùng');

  const result = await request(`${examPath}/attempts/${attemptId}/result`, { token: attemptToken });
  assert.equal(result.data.attemptId, attemptId);
  assert.equal(result.data.totalScore, submitted.data.totalScore);
  assert.equal(result.data.sections.length, submitted.data.sections.length);
  assert.equal(result.data.candidate.email, `regression.lr.${runId}@example.com`);
  assert.ok(result.data.ranking?.rank > 0);
  assert.ok(Array.isArray(result.data.leaderboard?.entries));
  report.push('API kết quả trả đủ thí sinh, section, xếp hạng và leaderboard');

  const consistency = await db.query(
    `SELECT a.status,a.total_questions,a.answered_count,a.unanswered_count,a.correct_count,a.incorrect_count,
            COUNT(DISTINCT aa.sub_question_id)::int answer_rows,
            COUNT(DISTINCT ss.section_id)::int section_rows
     FROM exam_attempts a
     LEFT JOIN exam_attempt_answers aa ON aa.attempt_id=a.id
     LEFT JOIN exam_attempt_section_scores ss ON ss.attempt_id=a.id
     WHERE a.id=$1
     GROUP BY a.id`,
    [attemptId],
  );
  const stored = consistency.rows[0];
  assert.equal(stored.status, 'SUBMITTED');
  assert.equal(Number(stored.total_questions), exam.data.questionCount);
  assert.equal(Number(stored.answered_count), exam.data.questionCount);
  assert.equal(Number(stored.answer_rows), exam.data.questionCount);
  assert.equal(Number(stored.correct_count) + Number(stored.incorrect_count), exam.data.questionCount);
  assert.equal(Number(stored.section_rows), exam.data.sections.length);
  report.push('PostgreSQL khớp tổng câu, đáp án, kết quả và số section');

  console.log(JSON.stringify({ ok: true, examId, attemptId, checks: report }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.close());
