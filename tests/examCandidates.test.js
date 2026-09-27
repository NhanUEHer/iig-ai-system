const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('candidate management migration adds stable SBD and list indexes',()=>{
  const sql=read('src/database/migrations/099_exam_candidate_management.sql');
  assert.match(sql,/ADD COLUMN IF NOT EXISTS candidate_number/i);
  assert.match(sql,/UNIQUE INDEX[\s\S]*exam_event_id, candidate_number/i);
  assert.match(sql,/exam_candidates_event_toeic/i);
});

test('candidate admin API exposes list filters and export with granular permissions',()=>{
  const routes=read('src/routes/examCandidateRoutes.js');
  assert.match(routes,/router\.get\('\/'[\s\S]*exam_candidates\.view/);
  assert.match(routes,/filter-options[\s\S]*exam_candidates\.view/);
  assert.match(routes,/export[\s\S]*exam_candidates\.export/);
});

test('candidate list keeps one registration per event and displays raw score',()=>{
  const repository=read('src/modules/exam-candidates/examCandidateRepository.js');
  const page=read('frontend/src/features/exam-candidates/pages/ExamCandidateListPage.jsx');
  assert.match(repository,/JOIN exam_events ee ON ee\.id=ec\.exam_event_id/);
  assert.match(repository,/ORDER BY ea\.created_at DESC LIMIT 1/);
  assert.match(page,/ĐIỂM GỐC/);
  assert.match(page,/row\.attempt\.totalScore/);
  assert.doesNotMatch(page,/toeicEstimate|\/990/);
});
