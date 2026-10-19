const assert = require('node:assert/strict');
const test = require('node:test');
const service = require('../src/modules/public-exams/publicExamCatalogService');
const repository = require('../src/modules/public-exams/publicExamCatalogRepository');

test('public exam catalog validates and normalizes list filters', () => {
  const filters = service.normalizeFilters({ page: '-2', limit: '999', groupIds: '11111111-1111-4111-8111-111111111111', difficulties: 'BASIC,EXPERT', examTypes: 'LISTENING_READING' });
  assert.equal(filters.page, 1);
  assert.equal(filters.limit, 50);
  assert.deepEqual(filters.difficulties, ['BASIC', 'EXPERT']);
  assert.throws(() => service.normalizeFilters({ difficulty: 'HARD' }), error => error.code === 'PUBLIC_EXAM_DIFFICULTY_INVALID');
  assert.throws(() => service.normalizeFilters({ groupId: 'bad-id' }), error => error.code === 'PUBLIC_EXAM_GROUP_INVALID');
});

test('public catalog query only exposes complete published exams and sorts by popularity', () => {
  assert.match(repository.publicWhere, /status='ACTIVE'/);
  assert.match(repository.publicWhere, /active_version_id IS NOT NULL/);
  assert.match(repository.publicWhere, /published_snapshot IS NOT NULL/);
  assert.match(repository.publicWhere, /card_image_storage_key IS NOT NULL/);
  assert.match(repository.publicWhere, /difficulty IS NOT NULL/);
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/modules/public-exams/publicExamCatalogRepository.js'), 'utf8');
  assert.match(source, /ORDER BY popularity_count DESC/);
  assert.doesNotMatch(source, /SELECT\s+e\.\*,/);
});

test('public exam catalog routes are mounted without admin authentication', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/app.js'), 'utf8');
  assert.match(source, /app\.use\('\/api\/public\/exams', publicExamCatalogRoutes\)/);
  assert.ok(source.indexOf("app.use('/api/public/exams'") < source.indexOf("app.use('/api/exams', authenticate"));
});

test('public exam detail reads Redis first and falls back to the PostgreSQL published snapshot', () => {
  const routeSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/routes/publicExamCatalogRoutes.js'), 'utf8');
  const serviceSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/modules/public-exams/publicExamCatalogService.js'), 'utf8');
  assert.match(routeSource, /router\.get\('\/:examId'/);
  assert.match(serviceSource, /readPublished\(examId, 'manifest'\)/);
  assert.match(serviceSource, /readPublished\(examId, 'structure'\)/);
  assert.match(serviceSource.slice(serviceSource.indexOf('async function detail')), /findCurrentExamQuestionDelivery\(examId\)/);
  assert.match(serviceSource.slice(serviceSource.indexOf('async function detail')), /publishGeneration\(examId, source\.snapshot, source\.media\)/);
});

test('published exam cache remains until republish or deactivate', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/modules/public-exam-events/examDeliveryCache.js'), 'utf8');
  const publishBlock = source.slice(source.indexOf('async function publishGeneration'), source.indexOf('async function clearPublished'));
  assert.doesNotMatch(publishBlock, /EX:\s*TTL_SECONDS/);
  assert.match(source, /async function clearPublished/);
});
