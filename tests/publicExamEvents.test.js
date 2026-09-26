const assert = require('node:assert/strict');
const test = require('node:test');

const HttpError = require('../src/http/httpError');
const repository = require('../src/modules/public-exam-events/publicExamEventRepository');
const media = require('../src/modules/exam-events/examEventMediaService');
const service = require('../src/modules/public-exam-events/publicExamEventService');

const eventId = '11111111-1111-4111-8111-111111111111';
const activeEvent = {
  id: eventId,
  eventCode: 'EV-PUBLIC-01',
  name: 'Workshop English Quick Test',
  description: '<p>Giới thiệu</p>',
  schoolName: 'IIG Việt Nam',
  imageStorageKey: 'events/image.png',
  bannerStorageKey: 'events/banner.png',
  startAt: new Date('2026-09-24T01:00:00Z'),
  endAt: new Date('2026-09-24T03:00:00Z'),
  status: 'PUBLISHED',
  exam: {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'English Four Skills Quick Test',
    status: 'ACTIVE',
    durationSeconds: 1800,
    totalQuestions: 12,
    scoreScale: 100,
    parts: [{ id: 'part-1', title: 'Listening', partLabel: '', questionCount: 3 }],
  },
};

async function withPublicMocks(event, callback) {
  const originalFind = repository.findById;
  const originalSignedUrl = media.getSignedMediaUrl;
  repository.findById = async () => event;
  media.getSignedMediaUrl = async key => key ? `https://cdn.test/${key}` : null;
  try { return await callback(); }
  finally {
    repository.findById = originalFind;
    media.getSignedMediaUrl = originalSignedUrl;
  }
}

test('public event returns safe landing metadata while available', async () => {
  await withPublicMocks(activeEvent, async () => {
    const result = await service.getPublicEvent(eventId, { now: new Date('2026-09-24T02:00:00Z') });
    assert.equal(result.accessState, 'AVAILABLE');
    assert.equal(result.canEnter, true);
    assert.equal(result.exam.totalQuestions, 12);
    assert.equal(result.imageUrl, 'https://cdn.test/events/image.png');
    assert.equal(result.status, undefined);
    assert.equal(result.exam.status, undefined);
    assert.equal(result.imageStorageKey, undefined);
    assert.equal(result.bannerStorageKey, undefined);
    assert.equal(JSON.stringify(result).includes('is_correct'), false);
  });
});

test('public event exposes upcoming and completed access states without allowing entry', async () => {
  await withPublicMocks(activeEvent, async () => {
    const upcoming = await service.getPublicEvent(eventId, { now: new Date('2026-09-24T00:00:00Z') });
    const completed = await service.getPublicEvent(eventId, { now: new Date('2026-09-24T04:00:00Z') });
    assert.deepEqual([upcoming.accessState, upcoming.canEnter], ['UPCOMING', false]);
    assert.deepEqual([completed.accessState, completed.canEnter], ['COMPLETED', false]);
  });
});

test('public event conceals drafts and archived events', async () => {
  for (const status of ['DRAFT', 'ARCHIVED']) {
    await withPublicMocks({ ...activeEvent, status }, async () => {
      await assert.rejects(
        () => service.getPublicEvent(eventId),
        error => error instanceof HttpError && error.statusCode === 404 && error.code === 'PUBLIC_EXAM_EVENT_NOT_FOUND',
      );
    });
  }
});

test('public event blocks an inactive linked exam', async () => {
  await withPublicMocks({ ...activeEvent, exam: { ...activeEvent.exam, status: 'INACTIVE' } }, async () => {
    await assert.rejects(
      () => service.getPublicEvent(eventId),
      error => error instanceof HttpError && error.statusCode === 409 && error.code === 'PUBLIC_EXAM_UNAVAILABLE',
    );
  });
});

test('public event validates identifiers and missing records', async () => {
  await assert.rejects(() => service.getPublicEvent('invalid-id'), error => error.code === 'INVALID_EVENT_ID');
  await withPublicMocks(null, async () => {
    await assert.rejects(() => service.getPublicEvent(eventId), error => error.code === 'PUBLIC_EXAM_EVENT_NOT_FOUND');
  });
});

test('public event route is mounted before authenticated admin routes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const publicIndex = source.indexOf("app.use('/api/public/exam-events'");
  const adminIndex = source.indexOf("app.use('/api/exam-events'");
  assert.ok(publicIndex >= 0);
  assert.ok(publicIndex < adminIndex);
  assert.match(source, /app\.use\('\/api\/public\/exam-events', publicExamEventRoutes\)/);
});
