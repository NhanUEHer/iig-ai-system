const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('event retirement migration preserves direct candidates and creates direct indexes',()=>{
  const sql=read('src/database/migrations/120_remove_exam_events.sql');
  assert.match(sql,/DELETE FROM exam_attempts WHERE exam_event_id IS NOT NULL/i);
  assert.match(sql,/DROP COLUMN IF EXISTS exam_event_id/i);
  assert.match(sql,/uq_exam_candidates_candidate_number/i);
  assert.match(sql,/uq_exam_attempts_active_candidate_exam/i);
});

test('candidate admin API exposes list filters and export with granular permissions',()=>{
  const routes=read('src/routes/examCandidateRoutes.js');
  assert.match(routes,/router\.get\('\/'[\s\S]*exam_candidates\.view/);
  assert.match(routes,/filter-options[\s\S]*exam_candidates\.view/);
  assert.match(routes,/export[\s\S]*exam_candidates\.export/);
});

test('candidate list displays direct exam activity and scoring result',()=>{
  const repository=read('src/modules/exam-candidates/examCandidateRepository.js');
  const page=read('frontend/src/features/exam-candidates/pages/ExamCandidateListPage.jsx');
  assert.match(repository,/LEFT JOIN exam_attempts a ON a\.candidate_id=c\.id/);
  assert.match(repository,/LEFT JOIN exams e ON e\.id=a\.exam_id/);
  assert.doesNotMatch(repository,/exam_events|exam_event_id/);
  assert.match(page,/HOẠT ĐỘNG THÍ SINH|Hoạt động thí sinh/i);
  assert.match(page,/row\.activity\.totalScore/);
  assert.match(page,/row\.activity\.correctCount/);
});
