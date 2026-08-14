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

test('revenue template rows copy and backfill their configured product group', () => {
  const config = read('src/modules/reports/detailRowConfig.js');
  const migration = read('src/database/migrations/035_backfill_revenue_product_groups.sql');
  assert.match(config, /REV:\{detailKey:'revenue',codeField:'product_code',nameField:'product_name',groupField:'product_group'\}/);
  assert.match(migration, /detail\.product_code = template\.row_code/);
  assert.match(migration, /SET product_group = template\.row_group/);
});

test('monitor KPIs show TH/KH ratios but remain excluded from aggregate completion', () => {
  const dashboard = read('frontend/src/features/reports/pages/KpiReportPage.jsx');
  assert.match(dashboard, /monitor\?actualTargetRatio\(kpi\):healthScore\(kpi\)/);
  assert.match(dashboard, /KPI được đánh giá/);
  assert.match(dashboard, /KPI theo dõi/);
});

test('KPI hover details expose unrounded plan, actual and achieved ratio', () => {
  const dashboard = read('frontend/src/features/reports/pages/KpiReportPage.jsx');
  assert.match(dashboard, /Kế hoạch<\/dt><dd>\{fullMetric/);
  assert.match(dashboard, /Thực hiện<\/dt><dd>\{fullMetric/);
  assert.match(dashboard, /Tỷ lệ đạt được<\/dt><dd>\{fullPercent/);
  const css = read('frontend/src/features/reports/pages/KpiReportPage.css');
  assert.match(css, /\.report-bars \.bar-track i:after\{display:none!important\}/);
  assert.match(css, /background:#172033;color:#fff/);
  assert.match(css, /\.report-chart-grid\.redesigned \.report-bars>div>\.kpi-hover-detail\{[^}]*height:auto;overflow:visible;[^}]*background:#172033/);
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

test('production deploy is locked, immutable, identity-verified and rollback-capable',()=>{
  const deployScript=read('deploy.sh');
  const backupScript=read('scripts/backup-production.sh');
  assert.match(deployScript,/ai-scoring-deploy\.lock/);
  assert.match(deployScript,/RELEASES_DIR/);
  assert.match(deployScript,/origin\/main/);
  assert.match(deployScript,/x\.build\?\.version===/);
  assert.match(deployScript,/x\.build\?\.commit===/);
  assert.match(deployScript,/Health verification failed; rolling back/);
  assert.match(backupScript,/\.partial-/);
  assert.match(backupScript,/SHA256SUMS/);
  assert.match(backupScript,/NR>3/);
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

test('Trade date picker keeps date inputs mounted and blank added dates local',()=>{
  const page=read('frontend/src/features/reports/pages/ManualReportPage.jsx');
  assert.match(page,/const addDate=\(\)=>\{editingSchedule\.current=true;setDates\(items=>\[\.\.\.items,''\]\);\}/);
  assert.match(page,/\['range','multiple'\]\.includes\(next\)\?\['',''\]/);
  assert.match(page,/if\(dates\.length<=2\)return/);
  assert.match(page,/editingSchedule=useRef\(false\)/);
  assert.match(page,/if\(editingSchedule\.current&&!incoming\)return/);
  assert.match(page,/dates\.map\(\(date,index\)=><div key=\{index\}>/);
  assert.doesNotMatch(page,/key=\{`\$\{index\}-\$\{date\}`\}/);
  assert.match(page,/maskDateDigits/);
  assert.match(page,/maskRangeDigits/);
  assert.match(page,/DD\/MM\/YYYY - DD\/MM\/YYYY/);
  assert.match(page,/RangeDateInput/);
});

test('communication previous followers and reach are derived from the prior month and excluded from import',()=>{
  const config=read('src/modules/reports/manualReportConfig.js');
  const service=read('src/modules/reports/manualReportService.js');
  const repository=read('src/modules/reports/manualReportRepository.js');
  assert.match(config,/\['followers_previous','Followers kỳ trước','computed'/);
  assert.match(config,/\['reach_previous','Reach kỳ trước','computed'/);
  assert.match(service,/getSocialHistory\(base\.year,base\.month,base\.version_id\)/);
  assert.match(service,/getSocialHistory\(current\.year,current\.month,current\.version_id\)/);
  assert.match(repository,/followers_current,d\.reach_current/);
  assert.match(repository,/month===1\?12:month-1/);
});

test('manual report forms allocate input width by data type',()=>{
  const page=read('frontend/src/features/reports/pages/ManualReportPage.jsx');
  const styles=read('frontend/src/features/reports/pages/ManualReportPage.css');
  assert.match(page,/LONG_TEXT_FIELDS/);
  assert.match(page,/CompactTextArea/);
  assert.match(page,/field-\$\{field\.type\}/);
  assert.match(styles,/\.detail-entry-table input, \.detail-entry-table select \{ width: 100%/);
  assert.match(styles,/\.detail-entry-table th\.field-text/);
  assert.match(styles,/min-height: 130px/);
});

test('Ads product revenue is manually editable and is not overwritten from REV',()=>{
  const page=read('frontend/src/features/reports/pages/ManualReportPage.jsx');
  const service=read('src/modules/reports/manualReportService.js');
  assert.match(page,/<th>Doanh thu<\/th>/);
  assert.match(page,/<NumericInput disabled={!editable} value={row\.revenue} onChange={value=>updateRow\(index,'revenue',value\)}\/>/);
  assert.doesNotMatch(page,/Từ báo cáo REV|Doanh thu từ REV/);
  assert.doesNotMatch(service,/referenceAdsRevenue|Doanh thu theo sản phẩm được làm mới từ báo cáo REV/);
});

test('Ads dashboard detail tables match the entry forms and formulas',()=>{
  const dashboard=read('frontend/src/features/reports/pages/KpiReportPage.jsx');
  assert.match(dashboard,/ADS:\['traffic_source','budget_target','budget_actual','budget_completion','lead_count','order_count','revenue','closing_rate','revenue_per_order','cpr','trend','note'\]/);
  assert.match(dashboard,/ADS_PRODUCT_COLUMNS=\['product_group','product_name','ad_cost','ad_share','revenue','revenue_share_ads','note'\]/);
  assert.match(dashboard,/key==='budget_completion'\?ratio\(row\.budget_actual,row\.budget_target\)/);
  assert.match(dashboard,/key==='closing_rate'\?ratio\(row\.order_count,row\.lead_count\)/);
  assert.match(dashboard,/key==='cpr'\?ratio\(row\.budget_actual,row\.revenue\)/);
  assert.match(dashboard,/className="dashboard-total-row"/);
  assert.match(dashboard,/DETAIL_TITLES=\{REV:'Doanh thu theo sản phẩm',ADS:'Hiệu quả theo nguồn Ads',COM:'Hiệu quả theo kênh truyền thông'/);
  assert.match(dashboard,/TEAM_DETAIL_LABELS=\{REV:\{monthly_target:'KH tháng',previous_revenue:'DT tháng trước'\},ADS:\{order_count:'Đơn hàng'\}/);
});

test('Ads cost reconciliation never blocks report submission',()=>{
  const calculator=read('src/modules/reports/manualReportCalculator.js');
  const repository=read('src/modules/reports/manualReportRepository.js');
  assert.doesNotMatch(calculator,/Tổng chi phí Ads theo sản phẩm chưa khớp ngân sách thực hiện theo nguồn Traffic/);
  assert.match(repository,/action==='submit'&&\(s\.validation_result\?\.errors\|\|\[\]\)\.length/);
});
