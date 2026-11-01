const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('container topology isolates admin API, scoring API, worker and web applications', () => {
  const compose = read('deploy/docker-compose.yml');
  assert.match(compose, /^  admin-api:/m);
  assert.match(compose, /^  scoring-api:/m);
  assert.match(compose, /^  scoring-worker:/m);
  assert.match(compose, /^  migrate:/m);
  assert.match(compose, /^  redis:/m);
  assert.match(compose, /^  admin-web:/m);
  assert.match(compose, /^  exam-web:/m);
  assert.match(compose, /iig-admin-api/);
  assert.match(compose, /iig-ai-scoring-api/);
  assert.match(compose, /iig-ai-scoring-worker/);
  assert.match(compose, /iig-admin-admin-web/);
  assert.match(compose, /iig-admin-exam-web/);
  assert.doesNotMatch(compose, /\/iig-exam-web:/);
  assert.doesNotMatch(compose, /^  api:/m);
  assert.match(compose, /ADMIN_API_IMAGE_TAG/);
  assert.match(compose, /SCORING_API_IMAGE_TAG/);
  assert.match(compose, /SCORING_WORKER_IMAGE_TAG/);
  assert.match(compose, /ADMIN_WEB_IMAGE_TAG/);
  assert.match(compose, /EXAM_WEB_IMAGE_TAG/);
  assert.match(compose, /condition: service_completed_successfully/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /name: iig-admin-\$\{DEPLOY_ENV:-beta\}/);
  assert.match(compose, /external: true/);
  assert.doesNotMatch(compose, /ipam:/);
  assert.match(compose, /redis-data:\/data/);
  assert.doesNotMatch(compose, /^\s+- .*:6379:6379$/m);
  assert.match(compose, /127\.0\.0\.1:\$\{ADMIN_PORT/);
  assert.match(compose, /127\.0\.0\.1:\$\{EXAM_PORT/);
  assert.equal((compose.match(/driver: journald/g) || []).length, 3);
  assert.equal((compose.match(/tag: "iig-admin-\{\{\.Name\}\}"/g) || []).length, 3);
});

test('API observability uses structured request logs without sensitive query strings', () => {
  const format = read('deploy/nginx-api-log-format.conf');
  const include = read('deploy/nginx-api-observability.inc');
  const journalService = read('deploy/systemd/iig-nginx-api-log.service');
  const nginx = read('deploy/nginx-ai-scoring.conf');
  assert.match(format, /log_format iig_api_json escape=json/);
  assert.match(format, /\$uri/);
  assert.doesNotMatch(format, /\$request_uri|\$args/);
  assert.match(include, /X-Request-ID \$request_id/);
  assert.doesNotMatch(include, /syslog:server=/);
  assert.match(journalService, /tail -n 0 -F \/var\/log\/nginx\/iig_api_access\.json/);
  assert.match(journalService, /systemd-cat -t iig_nginx_api/);
  assert.match(journalService, /Restart=always/);
  assert.equal((nginx.match(/iig-api-observability\.conf/g) || []).length, 2);
});

test('container release uses immutable SHA tags and protected environments', () => {
  const workflow = read('.github/workflows/release-containers.yml');
  assert.match(workflow, /tag=\$\{prefix\}-\$\{GITHUB_SHA\}/);
  assert.match(workflow, /environment: beta/);
  assert.match(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /:latest/);
  assert.match(workflow, /platforms: linux\/arm64/);
  assert.match(workflow, /version="\$\(node -p 'require\("\.\/package\.json"\)\.version'\)"/);
  assert.doesNotMatch(workflow, /node -p \\"require\('\.\/package\.json'\)\.version\\"/);
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
  assert.match(gateway, /scp -t \/opt\/iig-admin\/beta["|]/);
  assert.match(gateway, /scp -t \/opt\/iig-admin\/beta\//);
  assert.match(gateway, /scp -t \/opt\/iig-admin\/prod["|]/);
  assert.match(gateway, /scp -t \/opt\/iig-admin\/prod\//);
  assert.match(gateway, /scp -d -t \/opt\/iig-admin\/beta\//);
  assert.match(gateway, /scp -d -t \/opt\/iig-admin\/prod\//);
  assert.match(gateway, /image_tag.*app_commit/);
  assert.match(workflow, /deploy beta \$IMAGE_TAG \$APP_VERSION \$APP_COMMIT/);
  assert.match(workflow, /deploy production \$IMAGE_TAG \$APP_VERSION \$APP_COMMIT/);
  assert.equal((workflow.match(/scp -O /g) || []).length, 2);
  assert.doesNotMatch(workflow, /run: scp (?!-O )/);
});
