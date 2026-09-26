require('dotenv').config();

const assert = require('node:assert/strict');
const db = require('../src/config/db');

const BASE_URL = process.env.MOBILE_E2E_BASE_URL || 'http://127.0.0.1:5005';
const EVENT_ID = process.env.MOBILE_E2E_EVENT_ID || '0bf85593-9a7d-4861-b2dd-35126bb861e0';

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
  return body;
}

async function main() {
  const runId = Date.now();
  const report = [];
  const eventPath = `/api/public/exam-events/${EVENT_ID}`;

  const event = await request(eventPath);
  assert.equal(event.data.exam.totalQuestions, 20);
  report.push('Trang kỳ thi trả đúng đề LR 20 câu');

  const registration = await request(`${eventPath}/registrations`, {
    method: 'POST',
    expected: 201,
    body: JSON.stringify({
      fullName: `E2E LR ${runId}`,
      phone: `09${String(runId).slice(-8)}`,
      email: `e2e.lr.${runId}@example.com`,
      birthYear: 2002,
      toeicExperience: 'STUDIED_NOT_TESTED',
      privacyConsent: true,
      marketingConsent: false,
    }),
  });
  const candidateToken = registration.data.candidateToken;
  assert.ok(candidateToken);
  report.push('Đăng ký thí sinh test thành công');

  const introduction = await request(`${eventPath}/introduction`, { token: candidateToken });
  assert.equal(introduction.data.event.exam.totalQuestions, 20);
  assert.equal(introduction.data.event.exam.parts.length, 2);
  report.push('Màn chuẩn bị có đủ Listening và Reading');

  const started = await request(`${eventPath}/attempts`, {
    method: 'POST', expected: 201, token: candidateToken,
    body: JSON.stringify({ audioConfirmed: true }),
  });
  const { attemptId, attemptToken } = started.data;
  assert.ok(attemptId && attemptToken);
  report.push('Tạo lượt thi mới thành công');

  const resumedStart = await request(`${eventPath}/attempts`, {
    method: 'POST', expected: 201, token: candidateToken,
    body: JSON.stringify({ audioConfirmed: true }),
  });
  assert.equal(resumedStart.data.attemptId, attemptId);
  assert.equal(resumedStart.data.resumed, true);
  report.push('Bấm bắt đầu lại hoặc reload không tạo attempt trùng');

  const delivery = await request(`${eventPath}/attempts/${attemptId}/questions`, { token: attemptToken });
  const questions = delivery.data.parts.flatMap(part => part.questions);
  assert.equal(questions.length, 20);
  const mediaTypes = new Set(questions.flatMap(question => question.content.media.map(item => item.type)));
  assert.ok(mediaTypes.has('AUDIO'), 'Đề thiếu AUDIO');
  assert.ok(mediaTypes.has('VIDEO'), 'Đề thiếu VIDEO');
  assert.ok(mediaTypes.has('IMAGE'), 'Đề thiếu IMAGE');
  assert.ok(questions.some(question => /<(article|p|ul|ol|table)\b/i.test(question.content.html)), 'Đề thiếu nội dung HTML');
  report.push('Đề có đủ audio, video, ảnh và HTML');

  const first = questions[0];
  const selectedOptionKey = first.options[0].key;
  await request(`${eventPath}/attempts/${attemptId}/answers/${first.id}`, {
    method: 'PUT', token: attemptToken,
    body: JSON.stringify({ selectedOptionKey, flagged: true }),
  });
  const restored = await request(`${eventPath}/attempts/${attemptId}/questions`, { token: attemptToken });
  const restoredFirst = restored.data.parts.flatMap(part => part.questions).find(question => question.id === first.id);
  assert.equal(restoredFirst.selectedOption, selectedOptionKey);
  assert.equal(restoredFirst.flagged, true);
  report.push('Đáp án và cờ xem lại được lưu, tải lại vẫn khôi phục đúng');

  const invalid = await request(`${eventPath}/attempts/${attemptId}/answers/${first.id}`, {
    method: 'PUT', token: attemptToken, expected: 400,
    body: JSON.stringify({ selectedOptionKey: 'INVALID', flagged: false }),
  });
  assert.equal(invalid.code, 'INVALID_SELECTED_OPTION');
  report.push('API từ chối đáp án không hợp lệ');

  const summary = await request(`${eventPath}/attempts/${attemptId}/submission-summary`, { token: attemptToken });
  assert.deepEqual(
    { total: summary.data.totalQuestions, answered: summary.data.answeredCount, flagged: summary.data.flaggedCount },
    { total: 20, answered: 1, flagged: 1 },
  );
  report.push('Tổng hợp trước khi nộp đúng 1/20 câu và 1 câu đánh dấu');

  await db.query("UPDATE exam_attempts SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=$1", [attemptId]);
  const expiredSave = await request(`${eventPath}/attempts/${attemptId}/answers/${questions[1].id}`, {
    method: 'PUT', token: attemptToken, expected: 409,
    body: JSON.stringify({ selectedOptionKey: questions[1].options[0].key, flagged: false }),
  });
  assert.equal(expiredSave.code, 'ATTEMPT_EXPIRED');
  report.push('Hết giờ thì khóa ghi đáp án mới đúng như thiết kế');

  const submitted = await request(`${eventPath}/attempts/${attemptId}/submit`, {
    method: 'POST', token: attemptToken, body: '{}',
  });
  assert.equal(submitted.data.status, 'SUBMITTED');
  assert.equal(submitted.data.totalQuestions, 20);
  assert.equal(submitted.data.answeredCount, 1);
  assert.ok(submitted.data.resultToken);
  assert.ok(submitted.data.leaderboard);
  report.push('Lượt thi hết giờ vẫn tự nộp, chấm điểm và trả kết quả/xếp hạng');

  const duplicateSubmit = await request(`${eventPath}/attempts/${attemptId}/submit`, {
    method: 'POST', token: attemptToken, body: '{}',
  });
  assert.equal(duplicateSubmit.data.status, 'SUBMITTED');
  assert.equal(duplicateSubmit.data.totalScore, submitted.data.totalScore);
  assert.equal(duplicateSubmit.data.correctCount, submitted.data.correctCount);
  report.push('Submit lặp an toàn, không chấm điểm hoặc tạo kết quả trùng');

  console.log(JSON.stringify({ ok: true, attemptId, checks: report }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.close());
