const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('database migrations include core, Local TTS, and secure auth tables', () => {
  const initialSchema = read('src/database/migrations/001_initial_schema.sql');
  const ttsSchema = read('src/database/migrations/003_local_tts.sql');
  const authSchema = read('src/database/migrations/004_secure_authentication.sql');

  assert.match(initialSchema, /CREATE TABLE IF NOT EXISTS ai_evaluation_results/);
  assert.match(ttsSchema, /CREATE TABLE IF NOT EXISTS local_voice_clones/);
  assert.match(ttsSchema, /CREATE TABLE IF NOT EXISTS local_tts_history/);
  assert.match(authSchema, /CREATE TABLE IF NOT EXISTS auth_sessions/);
  assert.match(authSchema, /CREATE TABLE IF NOT EXISTS password_action_tokens/);
});

test('multi-role migration creates assignments, audit history, and legacy backfill', () => {
  const migration = read('src/database/migrations/029_user_multiple_roles.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_roles/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_role_audit_logs/);
  assert.match(migration, /SELECT u\.id, r\.id, TRUE/);
  assert.match(migration, /ON CONFLICT \(user_id, role_id\)/);
});

test('voice cloning uses the local OpenVoice engine and requires a successful preview draft', () => {
  const cloneService = read('src/services/voiceCloneService.js');
  const controller = read('src/controllers/localTtsController.js');
  const migration = read('src/database/migrations/009_voice_clone_engine.sql');

  assert.match(cloneService, /openvoice_bridge\.py/);
  assert.match(cloneService, /consent/);
  assert.match(controller, /saveClonedVoice/);
  assert.match(controller, /VOICE_CLONE_ENGINE_UNAVAILABLE/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS engine/);
  assert.doesNotMatch(controller, /edge_tts/);
});

test('mapping routes support create, update, and delete', () => {
  const routes = read('src/routes/submissions/mappingRoutes.js');
  const scheduleMigration = read('src/database/migrations/010_mapping_sync_schedule.sql');

  assert.match(routes, /router\.post\('\/mappings'/);
  assert.match(routes, /router\.put\('\/mappings\/:keycode'/);
  assert.match(routes, /router\.delete\('\/mappings\/:keycode'/);
  assert.match(routes, /router\.get\('\/mapping-sync-schedule'/);
  assert.match(routes, /router\.put\('\/mapping-sync-schedule'/);
  assert.match(scheduleMigration, /CREATE TABLE IF NOT EXISTS mapping_sync_schedule/);
  assert.match(scheduleMigration, /mappings\.schedule/);
});

test('submission detail returns teacher notes', () => {
  const repository = read('src/modules/submissions/submissionRepository.js');
  assert.match(repository, /ai\.teacher_note/);
});

test('submission API exposes answer detail and bulk audio cleaning routes', () => {
  const coreRoutes = read('src/routes/submissions/coreRoutes.js');
  const scoringRoutes = read('src/routes/submissions/scoringRoutes.js');
  assert.match(coreRoutes, /:\id\/answers/);
  assert.match(coreRoutes, /:\id\/answers\/:answerId/);
  assert.match(scoringRoutes, /bulk-clean-audio/);
});

test('source does not contain known hard-coded service credentials', () => {
  const iigClient = read('src/clients/iigClient.js');
  const difyClient = read('src/clients/difyClient.js');
  const deployScript = read('deploy.sh');
  const authController = read('src/controllers/authController.js');

  assert.doesNotMatch(iigClient, /IIG_API_KEY\s*\|\|\s*['"][^'"]+/);
  assert.doesNotMatch(difyClient, /const DIFY_API_KEY\s*=\s*['"][^'"]+/);
  assert.doesNotMatch(deployScript, /^VPS_PASSWORD=['"][^$]/m);
  assert.doesNotMatch(authController, /password="\$\{password\}"/);
});

test('audio cleaner preserves natural pauses and validates output duration', () => {
  const pythonSource = read('src/services/audioCleaner.py');
  const serviceSource = read('src/services/audioCleanerService.js');
  assert.doesNotMatch(pythonSource, /silenceremove=/);
  assert.match(serviceSource, /ensureSafeDuration/);
  assert.match(serviceSource, /inputDuration \* 0\.8/);
});

test('production nginx serves generated Local TTS media before the SPA fallback', () => {
  const nginx = read('deploy/nginx-ai-scoring.conf');
  const localAudio = nginx.indexOf('location /local_audio/');
  const spaFallback = nginx.indexOf('location / {');
  assert.ok(localAudio >= 0 && localAudio < spaFallback);
  assert.match(nginx, /location \/local_voices\//);
  assert.match(nginx, /location \/tmp_local\//);
});
