const test = require('node:test');
const assert = require('node:assert/strict');

test('changed component detection avoids rebuilding unrelated images', async () => {
  const { componentsForFiles, matrixForComponents } = await import('../scripts/ci/changed-components.mjs');
  assert.deepEqual(componentsForFiles(['frontend/src/App.jsx']), ['admin-web']);
  assert.deepEqual(componentsForFiles(['exam-web/src/App.jsx']), ['exam-web']);
  assert.deepEqual(componentsForFiles(['src/apps/ai-scoring/app.js']), ['admin-api', 'scoring-api', 'scoring-worker']);
  assert.equal(matrixForComponents(['admin-web']).include[0].file, 'frontend/Dockerfile');
});

test('shared container and workflow changes conservatively rebuild every image', async () => {
  const { componentsForFiles } = await import('../scripts/ci/changed-components.mjs');
  assert.deepEqual(componentsForFiles(['Dockerfile']), ['admin-api', 'scoring-api', 'scoring-worker', 'admin-web', 'exam-web']);
  assert.deepEqual(componentsForFiles(['.github/workflows/ci.yml']), ['admin-api', 'scoring-api', 'scoring-worker', 'admin-web', 'exam-web']);
});
