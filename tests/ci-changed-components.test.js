const test = require('node:test');
const assert = require('node:assert/strict');

test('changed component detection avoids rebuilding unrelated images', async () => {
  const { componentsForFiles, matrixForComponents } = await import('../scripts/ci/changed-components.mjs');
  assert.deepEqual(componentsForFiles(['frontend/src/App.jsx']), ['admin-web']);
  assert.deepEqual(componentsForFiles(['exam-web/src/App.jsx']), ['exam-web']);
  assert.deepEqual(componentsForFiles(['src/apps/ai-scoring/app.js']), ['admin-api']);
  assert.deepEqual(componentsForFiles(['Dockerfile']), ['admin-api']);
  assert.deepEqual(componentsForFiles(['package.json']), ['admin-api', 'admin-web']);
  assert.deepEqual(componentsForFiles(['deploy/docker/proxy_params']), ['admin-web', 'exam-web']);
  assert.equal(matrixForComponents(['admin-web']).include[0].file, 'frontend/Dockerfile');
});

test('docs, CI and deploy definitions never rebuild images', async () => {
  const { componentsForFiles, flagsForFiles } = await import('../scripts/ci/changed-components.mjs');
  assert.deepEqual(componentsForFiles(['docs/x.md', 'README.md']), []);
  assert.deepEqual(componentsForFiles(['.github/workflows/ci.yml', 'scripts/ci/changed-components.mjs']), []);
  assert.deepEqual(componentsForFiles(['deploy/docker-compose.yml', 'scripts/deploy-containers.sh']), []);
  const docs = flagsForFiles(['docs/x.md']);
  assert.equal(docs.backend || docs.admin_web || docs.exam_web || docs.deploy_defs, false);
  assert.equal(flagsForFiles(['deploy/docker-compose.yml']).deploy_defs, true);
  assert.equal(flagsForFiles(['frontend/src/App.jsx']).backend, false);
});
