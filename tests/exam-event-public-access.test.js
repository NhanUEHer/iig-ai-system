const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('exam event admin exposes a public link and locally generated QR', () => {
  const card = read('frontend/src/features/exam-events/components/PublicExamAccessCard.jsx');
  assert.match(card, /QRCode\.toDataURL\(url/);
  assert.match(card, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(card, /download=`qr-/);
  assert.match(card, /target="_blank"/);
  assert.match(card, /VITE_PUBLIC_EXAM_BASE_URL/);
  assert.match(card, /\/events\/\$\{encodeURIComponent\(eventId\)\}/);
});

test('creating an event opens its edit page so the admin can share it immediately', () => {
  const createPage = read('frontend/src/features/exam-events/pages/ExamEventCreatePage.jsx');
  const editPage = read('frontend/src/features/exam-events/pages/ExamEventEditPage.jsx');
  assert.match(createPage, /navigate\(`\/exam-events\/\$\{created\.id\}\/edit`\)/);
  assert.match(editPage, /<PublicExamAccessCard/);
  assert.match(editPage, /eventId=\{id\}/);
  assert.match(editPage, /status=\{form\.status\}/);
});
