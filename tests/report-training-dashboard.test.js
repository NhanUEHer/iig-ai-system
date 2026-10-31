const test=require('node:test');
const assert=require('node:assert/strict');
const {buildTrainingDashboard}=require('../src/modules/reports/reportTrainingDashboard');

test('training dashboard aggregates course operations and weighted outcomes',()=>{
  const result=buildTrainingDashboard({dashboard:{period:{year:2026,month:10},kpis:[],details:[
    {course_name:'TOEIC LR',class_count:4,active_student_count:80,student_target:100,new_student_count:20,completed_student_count:20,output_rate:.8,upsell_revenue:100},
    {course_name:'TOEFL',class_count:2,active_student_count:30,student_target:50,new_student_count:10,completed_student_count:10,output_rate:.5,upsell_revenue:20}
  ]},monthly:[{year:2026,month:10,active_students:'110',active_classes:'6'}]});
  assert.equal(result.metrics.activeStudents.value,110);
  assert.equal(result.metrics.studentPlan.value,110/150);
  assert.equal(result.metrics.outputRate.value,.7);
  assert.equal(result.studentMovement.qualifiedStudents,21);
  assert.equal(result.dataQuality.outputDataAvailable,true);
  assert.equal(result.monthly[0].activeClasses,6);
  assert.ok(result.insights.some(item=>item.tone==='danger'));
});

test('training dashboard preserves missing output and target data instead of converting it to zero',()=>{
  const result=buildTrainingDashboard({dashboard:{period:{year:2026,month:9},kpis:[],details:[
    {course_name:'Tin học',class_count:2,active_student_count:30,student_target:null,completed_student_count:5,output_rate:null,qualified_student_count:null}
  ]},monthly:[]});
  assert.equal(result.metrics.outputRate.value,null);
  assert.equal(result.studentMovement.qualifiedStudents,null);
  assert.equal(result.courses[0].target,null);
  assert.equal(result.courses[0].completion,null);
  assert.equal(result.dataQuality.outputDataAvailable,false);
  assert.ok(result.insights.some(item=>item.title.includes('Chưa có dữ liệu đánh giá đầu ra')));
  assert.ok(result.insights.some(item=>item.title.includes('chưa thiết lập kế hoạch')));
});

test('training dashboard endpoint requires report view permission',()=>{
  const routes=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/routes/reportRoutes.js'),'utf8');
  assert.match(routes,/router\.get\('\/dashboard\/training',requirePermission\('reports\.view'\)/);
});
