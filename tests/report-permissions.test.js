const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {ALL_PERMISSIONS}=require('../src/modules/auth/permissions');

const root=path.resolve(__dirname,'..');

test('report permission catalog separates entry, review, publish and assignment',()=>{
  for(const permission of ['reports.view','reports.forms.view','reports.entry','reports.review','reports.publish','reports.assign','reports.manage'])
    assert.ok(ALL_PERMISSIONS.includes(permission),`missing ${permission}`);
});

test('report assignment migration stores assignee and preserves legacy permissions',()=>{
  const sql=fs.readFileSync(path.join(root,'src/database/migrations/027_report_assignment_permissions.sql'),'utf8');
  assert.match(sql,/assigned_user_id UUID REFERENCES users\(id\)/);
  assert.match(sql,/permissions \? 'reports\.upload'/);
  assert.match(sql,/reports\.entry/);
});

test('manual report routes protect assignment and workflow with granular permissions',()=>{
  const routes=fs.readFileSync(path.join(root,'src/routes/reportRoutes.js'),'utf8');
  assert.match(routes,/assignee'.*reports\.assign/s);
  assert.match(routes,/workflow'.*reports\.entry.*reports\.review/s);
  assert.match(routes,/publish'.*reports\.publish/s);
});

test('manual report workflow enforces assignment and deadline while supporting targeted recalls',()=>{
  const service=fs.readFileSync(path.join(root,'src/modules/reports/manualReportService.js'),'utf8');
  const repository=fs.readFileSync(path.join(root,'src/modules/reports/manualReportRepository.js'),'utf8');
  assert.match(service,/REPORT_SUBMISSION_UNASSIGNED/);
  assert.match(service,/REPORT_SUBMISSION_DEADLINE_PASSED/);
  assert.match(service,/REPORT_RETURN_REASON_REQUIRED/);
  assert.match(service,/REPORT_REOPEN_REASON_REQUIRED/);
  assert.match(repository,/recall:\{from:\['approved'\],to:'returned'\}/);
  assert.match(repository,/t\.id,'approved',COALESCE\(old\.validation_result/);
  assert.match(repository,/reports\.review'.*reports\.manage/s);
  assert.match(repository,/assigned_user_id IS NULL/);
  assert.match(service,/REPORT_DEADLINE_LOCKED/);
  assert.match(repository,/deadline_changed/);
  assert.match(repository,/ORDER BY l\.created_at DESC/);
});
