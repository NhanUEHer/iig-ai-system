const assert = require('node:assert/strict');
const test = require('node:test');

const examEventConstants = require('../src/modules/exam-events/examEventConstants');
const examEventValidator = require('../src/modules/exam-events/examEventValidator');
const examEventRepository = require('../src/modules/exam-events/examEventRepository');
const examEventService = require('../src/modules/exam-events/examEventService');
const examEventMediaService = require('../src/modules/exam-events/examEventMediaService');
const HttpError = require('../src/http/httpError');

test('examEventConstants exports correct default values and constraints', () => {
  assert.deepEqual(examEventConstants.STATUSES, ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
  assert.deepEqual(examEventConstants.LIFECYCLE_STATUSES, ['DRAFT', 'UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED']);
  assert.ok(examEventConstants.ALLOWED_IMAGE_MIME_TYPES.includes('image/png'));
  assert.equal(examEventConstants.MAX_IMAGE_FILE_SIZE, 10 * 1024 * 1024);
  assert.equal(examEventConstants.PAGINATION.DEFAULT_PAGE, 1);
  assert.equal(examEventConstants.PAGINATION.DEFAULT_LIMIT, 20);
});

test('examEventValidator validates name, status, examId, and start/end dates correctly', () => {
  const validExamId = '11111111-1111-4111-8111-111111111111';
  const validStart = '2026-10-01T08:00:00Z';
  const validEnd = '2026-10-01T10:00:00Z';

  // Empty name
  assert.throws(
    () => examEventValidator.validateExamEventInput({ name: '', examId: validExamId, startAt: validStart, endAt: validEnd }, false),
    (err) => err instanceof HttpError && err.code === 'INVALID_NAME'
  );

  // Name too long (> 240 chars)
  assert.throws(
    () => examEventValidator.validateExamEventInput({ name: 'a'.repeat(241), examId: validExamId, startAt: validStart, endAt: validEnd }, false),
    (err) => err instanceof HttpError && err.code === 'NAME_TOO_LONG'
  );

  // Invalid status
  assert.throws(
    () => examEventValidator.validateExamEventInput({ name: 'Event 1', status: 'INVALID', examId: validExamId, startAt: validStart, endAt: validEnd }, false),
    (err) => err instanceof HttpError && err.code === 'INVALID_STATUS'
  );

  // Invalid examId
  assert.throws(
    () => examEventValidator.validateExamEventInput({ name: 'Event 1', examId: 'not-a-uuid', startAt: validStart, endAt: validEnd }, false),
    (err) => err instanceof HttpError && err.code === 'INVALID_EXAM_ID'
  );

  // End date before or equal to start date
  assert.throws(
    () => examEventValidator.validateExamEventInput({ name: 'Event 1', schoolName: 'IIG Việt Nam', description: '<p>Giới thiệu</p>', examId: validExamId, startAt: validEnd, endAt: validStart }, false),
    (err) => err instanceof HttpError && err.code === 'INVALID_DATE_RANGE'
  );

  assert.throws(
    () => examEventValidator.validateExamEventInput({ name: 'Event 1', schoolName: 'IIG Việt Nam', description: '<p>Giới thiệu</p>', examId: validExamId, startAt: validStart, endAt: validStart }, false),
    (err) => err instanceof HttpError && err.code === 'INVALID_DATE_RANGE'
  );

  // Valid create payload
  assert.doesNotThrow(() => {
    examEventValidator.validateExamEventInput({
      name: 'Kỳ thi thử TOEIC tháng 10',
      schoolName: 'IIG Việt Nam',
      description: '<p>Giới thiệu kỳ thi</p>',
      status: 'PUBLISHED',
      examId: validExamId,
      startAt: validStart,
      endAt: validEnd,
    }, false);
  });
});

test('examEventValidator validates media upload file format and size', () => {
  // Invalid mime type
  assert.throws(
    () => examEventValidator.validateMediaUpload({ mimetype: 'application/pdf', size: 1000 }, 'image'),
    (err) => err instanceof HttpError && err.code === 'INVALID_FILE_TYPE'
  );

  // Exceeds max file size
  assert.throws(
    () => examEventValidator.validateMediaUpload({ mimetype: 'image/png', size: 15 * 1024 * 1024 }, 'banner'),
    (err) => err instanceof HttpError && err.code === 'FILE_TOO_LARGE'
  );

  // Valid media file
  assert.doesNotThrow(() => {
    examEventValidator.validateMediaUpload({ mimetype: 'image/jpeg', size: 3, buffer: Buffer.from([0xff, 0xd8, 0xff]) }, 'image');
  });

  assert.throws(
    () => examEventValidator.validateMediaUpload({ mimetype: 'image/png', size: 8, buffer: Buffer.from('not-image') }),
    (err) => err instanceof HttpError && err.code === 'INVALID_FILE_CONTENT'
  );
});

test('examEventValidator rejects invalid IDs and lifecycle filters before querying PostgreSQL', () => {
  assert.throws(() => examEventValidator.validateEventId('not-a-uuid'), error => error.code === 'INVALID_EVENT_ID');
  assert.throws(() => examEventValidator.validateListFilters({ status: 'UNKNOWN' }), error => error.code === 'INVALID_LIFECYCLE_STATUS');
  assert.doesNotThrow(() => examEventValidator.validateListFilters({ status: 'IN_PROGRESS' }));
});

test('examEventRepository mapExamEvent transforms DB snake_case to camelCase correctly', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Toeic Test Event',
    description: 'Description test',
    image_storage_key: 'r2:exam-events/1/image.png',
    image_mime_type: 'image/png',
    image_file_size: '1024',
    banner_storage_key: 'r2:exam-events/1/banner.png',
    banner_mime_type: 'image/png',
    banner_file_size: '2048',
    start_at: new Date('2026-10-01T08:00:00Z'),
    end_at: new Date('2026-10-01T10:00:00Z'),
    exam_id: '22222222-2222-4222-8222-222222222222',
    status: 'DRAFT',
    created_by: '33333333-3333-4333-8333-333333333333',
    updated_by: '33333333-3333-4333-8333-333333333333',
    created_at: new Date(),
    updated_at: new Date(),
    e_id: '22222222-2222-4222-8222-222222222222',
    e_title: 'TOEIC Exam 1',
    e_status: 'ACTIVE',
    e_duration_minutes: 120,
    e_duration_seconds: 0,
    e_total_questions: 25,
  };

  const mapped = examEventRepository.mapExamEvent(row);
  assert.equal(mapped.id, row.id);
  assert.equal(mapped.name, row.name);
  assert.equal(mapped.schoolName, null);
  assert.equal(mapped.imageStorageKey, row.image_storage_key);
  assert.equal(mapped.bannerStorageKey, row.banner_storage_key);
  assert.equal(mapped.imageFileSize, 1024);
  assert.equal(mapped.bannerFileSize, 2048);
  assert.equal(mapped.exam.id, row.e_id);
  assert.equal(mapped.exam.title, 'TOEIC Exam 1');
  assert.equal(mapped.exam.totalQuestions, 25);
  assert.equal(mapped.examAccessStatus, undefined);
});

test('examEventService returns an existing school instead of creating a duplicate', async () => {
  const originalFindSchoolByName = examEventRepository.findSchoolByName;
  const originalCreateSchool = examEventRepository.createSchool;
  let created = false;
  examEventRepository.findSchoolByName = async () => ({ id: 'school-1', name: 'IIG Việt Nam' });
  examEventRepository.createSchool = async () => { created = true; };
  try {
    const school = await examEventService.createSchool({ name: ' IIG Việt Nam ' }, 'user-id');
    assert.equal(school.name, 'IIG Việt Nam');
    assert.equal(created, false);
  } finally { examEventRepository.findSchoolByName = originalFindSchoolByName; examEventRepository.createSchool = originalCreateSchool; }
});

test('examEventService createExamEvent rejects nonexistent exam reference', async () => {
  const originalFindExamById = examEventRepository.findExamById;
  const originalFindSchoolByName = examEventRepository.findSchoolByName;
  examEventRepository.findExamById = async () => null;
  examEventRepository.findSchoolByName = async () => ({ id: 'school-id', name: 'IIG Việt Nam' });

  try {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    await assert.rejects(
      async () => examEventService.createExamEvent({
      name: 'Event test',
        schoolName: 'IIG Việt Nam',
        description: '<p>Giới thiệu kỳ thi</p>',
        examId: validUuid,
        startAt: '2026-10-01T08:00:00Z',
        endAt: '2026-10-01T10:00:00Z',
      }, 'user-id'),
      (err) => err instanceof HttpError && err.code === 'EXAM_NOT_FOUND'
    );
  } finally {
    examEventRepository.findExamById = originalFindExamById;
    examEventRepository.findSchoolByName = originalFindSchoolByName;
  }
});

test('examEventService formatEventOutput generates signed URLs and strips private storage keys', async () => {
  const originalGetSignedMediaUrl = examEventMediaService.getSignedMediaUrl;
  examEventMediaService.getSignedMediaUrl = async (key) => key ? `https://signed.cdn/${key}` : null;

  try {
    const event = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Event',
      imageStorageKey: 'r2:exam-events/img.png',
      bannerStorageKey: 'r2:exam-events/banner.png',
    };

    const formatted = await examEventService.formatEventOutput(event);
    assert.equal(formatted.imageStorageKey, undefined);
    assert.equal(formatted.bannerStorageKey, undefined);
    assert.equal(formatted.imageUrl, 'https://signed.cdn/r2:exam-events/img.png');
    assert.equal(formatted.bannerUrl, 'https://signed.cdn/r2:exam-events/banner.png');
  } finally {
    examEventMediaService.getSignedMediaUrl = originalGetSignedMediaUrl;
  }
});

test('examEventService blocks structural changes after an event starts', async () => {
  const originalFindById = examEventRepository.findById;
  examEventRepository.findById = async () => ({
    id: '11111111-1111-4111-8111-111111111111', name: 'Kỳ thi', description: '<p>Mô tả</p>', status: 'PUBLISHED',
    lifecycleStatus: 'IN_PROGRESS', startAt: new Date('2026-10-01T08:00:00Z'), endAt: new Date('2026-10-01T10:00:00Z'),
    exam: { id: '22222222-2222-4222-8222-222222222222' },
  });
  try {
    await assert.rejects(() => examEventService.updateExamEvent('11111111-1111-4111-8111-111111111111', { endAt: '2026-10-01T11:00:00Z' }), error => error.code === 'EXAM_EVENT_LIFECYCLE_LOCKED');
  } finally { examEventRepository.findById = originalFindById; }
});

test('examEventService maps duplicate event codes to a business conflict', async () => {
  const originalFindExamById = examEventRepository.findExamById;
  const originalCreate = examEventRepository.create;
  const originalFindSchoolByName = examEventRepository.findSchoolByName;
  examEventRepository.findExamById = async () => ({ id: '22222222-2222-4222-8222-222222222222', status: 'ACTIVE' });
  examEventRepository.findSchoolByName = async () => ({ id: 'school-id', name: 'IIG Việt Nam' });
  examEventRepository.create = async () => { const error = new Error('duplicate'); error.code = '23505'; throw error; };
  try {
    await assert.rejects(() => examEventService.createExamEvent({ name: 'Kỳ thi', schoolName: 'IIG Việt Nam', description: '<p>Mô tả</p>', examId: '22222222-2222-4222-8222-222222222222', startAt: '2026-10-01T08:00:00Z', endAt: '2026-10-01T10:00:00Z' }), error => error.statusCode === 409 && error.code === 'EVENT_CODE_EXISTS');
  } finally { examEventRepository.findExamById = originalFindExamById; examEventRepository.findSchoolByName = originalFindSchoolByName; examEventRepository.create = originalCreate; }
});

test('examEventService removes a newly uploaded file when database persistence fails', async () => {
  const originalFindById = examEventRepository.findById;
  const originalUpdateMedia = examEventRepository.updateMedia;
  const originalUpload = examEventMediaService.uploadEventMedia;
  const originalRemove = examEventMediaService.removeEventMedia;
  const removed = [];
  examEventRepository.findById = async () => ({ id: '11111111-1111-4111-8111-111111111111' });
  examEventRepository.updateMedia = async () => { throw new Error('db failed'); };
  examEventMediaService.uploadEventMedia = async () => 'new-key';
  examEventMediaService.removeEventMedia = async key => removed.push(key);
  try {
    const file = { mimetype: 'image/png', size: 8, buffer: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]) };
    await assert.rejects(() => examEventService.uploadMedia('11111111-1111-4111-8111-111111111111', 'image', file), /db failed/);
    assert.deepEqual(removed, ['new-key']);
  } finally {
    examEventRepository.findById = originalFindById; examEventRepository.updateMedia = originalUpdateMedia;
    examEventMediaService.uploadEventMedia = originalUpload; examEventMediaService.removeEventMedia = originalRemove;
  }
});

test('exam event routes and service support removing persisted branding media', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/examEventRoutes.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '../src/modules/exam-events/examEventService.js'), 'utf8');
  assert.match(routes, /delete\('\/:eventId\/media\/:kind'/);
  assert.match(service, /async function removeMedia/);
  assert.match(service, /repo\.clearMedia/);
});

test('exam_events permissions exist in permissions catalog', () => {
  const { ALL_PERMISSIONS } = require('../src/modules/auth/permissions');
  assert.ok(ALL_PERMISSIONS.includes('exam_events.view'));
  assert.ok(ALL_PERMISSIONS.includes('exam_events.manage'));
});
