const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('container topology keeps one shared API and two isolated web applications', () => {
  const compose = read('deploy/docker-compose.yml');
  assert.match(compose, /^  api:/m);
  assert.match(compose, /^  admin-web:/m);
  assert.match(compose, /^  exam-web:/m);
  assert.match(compose, /iig-admin-admin-web/);
  assert.equal((compose.match(/^  api:/gm) || []).length, 1);
  assert.match(compose, /127\.0\.0\.1:\$\{ADMIN_PORT/);
  assert.match(compose, /127\.0\.0\.1:\$\{EXAM_PORT/);
});

test('container release uses immutable SHA tags and protected environments', () => {
  const workflow = read('.github/workflows/release-containers.yml');
  assert.match(workflow, /tag=\$\{prefix\}-\$\{GITHUB_SHA\}/);
  assert.match(workflow, /environment: beta/);
  assert.match(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /:latest/);
  assert.match(workflow, /platforms: linux\/arm64/);
});

test('runtime secrets and mutable data are excluded from images', () => {
  const ignore = read('.dockerignore');
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^public\/local_audio$/m);
  assert.match(ignore, /^voice_clone_models$/m);
  const compose = read('deploy/docker-compose.yml');
  assert.match(compose, /\.env\.container/);
  assert.match(compose, /voice_clone_models:\/app\/voice_clone_models:ro/);
  assert.match(compose, /MEDIA_ROOT is required/);
  assert.match(compose, /MODEL_ROOT is required/);
});

test('deployment verifies API identity and both frontend health endpoints', () => {
  const deploy = read('scripts/deploy-containers.sh');
  assert.match(deploy, /EXPECTED_VERSION/);
  assert.match(deploy, /EXPECTED_COMMIT/);
  assert.match(deploy, /admin_port/);
  assert.match(deploy, /exam_port/);
  assert.match(deploy, /\.env\.rollback/);
  assert.match(deploy, /restoring previous immutable release/);
  assert.doesNotMatch(deploy, /docker image prune/);
});

test('GitHub deployment credential is constrained by a forced-command gateway', () => {
  const gateway = read('deploy/docker/deploy-ssh-gateway.sh');
  const workflow = read('.github/workflows/release-containers.yml');
  assert.match(gateway, /SSH_ORIGINAL_COMMAND/);
  assert.match(gateway, /scp -t \/opt\/iig-admin\/beta\//);
  assert.match(gateway, /image_tag.*app_commit/);
  assert.match(workflow, /deploy beta \$IMAGE_TAG \$APP_VERSION \$APP_COMMIT/);
  assert.match(workflow, /deploy production \$IMAGE_TAG \$APP_VERSION \$APP_COMMIT/);
});
