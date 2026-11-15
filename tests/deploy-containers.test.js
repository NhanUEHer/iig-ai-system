const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('failed deployment restores the exact images that were running before activation', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-deploy-'));
  const bin = path.join(fixture, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(fixture, 'docker-compose.yml'), 'services: {}\n');
  fs.writeFileSync(path.join(fixture, '.env'), [
    'DEPLOY_ENV=production',
    'IMAGE_TAG=prod-old',
    'IMAGE_NAMESPACE=example',
    'API_PORT=3211',
    'ADMIN_PORT=3212',
    'EXAM_PORT=3213',
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(fixture, '.env.container'), [
    'AI_SCORING_ADMIN_URL=https://scoring.invalid',
    'AI_SCORING_ADMIN_SERVICE_TOKEN=test-only-token',
  ].join('\n') + '\n');

  const dockerStub = `#!/usr/bin/env bash
set -eu
printf '%s|%s\\n' "$*" "\${IMAGE_TAG:-}" >> "$DOCKER_LOG"
if [ "$1" = inspect ]; then
  format="$3"
  id="$4"
  case "$format" in
    *State.Running*) printf 'true\\n' ;;
    *Config.Image*)
      case "$id" in
        admin-api-id) printf 'registry.example/admin-api@sha256:aaa\\n' ;;
        admin-web-id) printf 'registry.example/admin-web@sha256:bbb\\n' ;;
        exam-web-id) printf 'registry.example/exam-web@sha256:ccc\\n' ;;
      esac
      ;;
    *State.Health*) printf 'healthy\\n' ;;
  esac
  exit 0
fi
args="$*"
case "$args" in
  *" ps -q admin-api"*) printf 'admin-api-id\\n' ;;
  *" ps -q admin-web"*) printf 'admin-web-id\\n' ;;
  *" ps -q exam-web"*) printf 'exam-web-id\\n' ;;
  *" config --format json"*)
    printf '%s\\n' '{"services":{"admin-api":{"image":"registry.example/admin-api:new"},"admin-web":{"image":"registry.example/admin-web:new"},"exam-web":{"image":"registry.example/exam-web:new"}}}'
    ;;
  *" up -d --remove-orphans"*) exit 23 ;;
esac
exit 0
`;
  fs.writeFileSync(path.join(bin, 'docker'), dockerStub, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'curl'), '#!/usr/bin/env bash\nprintf \'{"status":"ok","database":"ready"}\\n\'\n', { mode: 0o755 });

  const dockerLog = path.join(fixture, 'docker.log');
  const result = spawnSync('bash', [path.join(root, 'scripts/deploy-containers.sh')], {
    cwd: fixture,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      DOCKER_LOG: dockerLog,
      DEPLOY_DIR: fixture,
      DEPLOY_ENV: 'production',
      IMAGE_TAG: `prod-${'1'.repeat(40)}`,
      APP_VERSION: '1.2.3',
      APP_COMMIT: '1'.repeat(40),
    },
  });

  assert.equal(result.status, 23, result.stderr);
  assert.match(result.stderr, /Previous running images restored successfully/);
  const log = fs.readFileSync(dockerLog, 'utf8');
  assert.match(log, /\.compose\.rollback\.[0-9]+\.yml up -d --no-deps/);
  const override = fs.readdirSync(fixture).find(file => file.startsWith('.compose.rollback.'));
  assert.equal(override, undefined, 'temporary rollback override should be removed');
  assert.match(fs.readFileSync(path.join(fixture, '.env'), 'utf8'), /^IMAGE_TAG=prod-old$/m);
  assert.doesNotMatch(log, /iig-ai-scoring|scoring-api|scoring-worker/);
});
