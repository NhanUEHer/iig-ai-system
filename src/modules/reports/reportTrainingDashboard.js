const n=value=>value===null||value===undefined||value===''?null:Number(value);
const sum=(rows,key)=>rows.reduce((total,row)=>total+(n(row[key])||0),0);
const ratio=(value,base)=>base?value/base:null;
const change=(value,base)=>base?(value-base)/Math.abs(base):null;

function weightedRate(rows){
  const weighted=rows.filter(row=>n(row.output_rate)!==null&&n(row.completed_student_count)>0);
  const weight=sum(weighted,'completed_student_count');
  if(weight)return weighted.reduce((total,row)=>total+n(row.output_rate)*n(row.completed_student_count),0)/weight;
  const rates=rows.map(row=>n(row.output_rate)).filter(value=>value!==null);
  return rates.length?rates.reduce((total,value)=>total+value,0)/rates.length:null;
}

function buildTrainingDashboard({dashboard,monthly=[]}){
  const rows=dashboard?.details||[],kpis=dashboard?.kpis||[],kpi=code=>kpis.find(item=>item.code===code)||{};
  const activeClasses=sum(rows,'class_count'),activeStudents=sum(rows,'active_student_count'),studentTarget=sum(rows,'student_target'),newStudents=sum(rows,'new_student_count'),completedStudents=sum(rows,'completed_student_count'),outputRate=weightedRate(rows),outputDataAvailable=rows.some(row=>n(row.qualified_student_count)!==null||n(row.output_rate)!==null),qualifiedStudents=outputDataAvailable?rows.reduce((total,row)=>total+(n(row.qualified_student_count)??Math.round((n(row.completed_student_count)||0)*(n(row.output_rate)||0))),0):null,upsellRevenue=sum(rows,'upsell_revenue');
  const metric=(code,value)=>({value,previous:n(kpi(code).previous_value),change:change(value,n(kpi(code).previous_value))});
  const courses=rows.map((row,index)=>{const target=n(row.student_target),courseOutputRate=n(row.output_rate),qualified=n(row.qualified_student_count);return{id:row.id||row.row_key||index,name:row.course_name||'Khóa học',classes:n(row.class_count)||0,activeStudents:n(row.active_student_count)||0,target,completion:target>0?ratio(n(row.active_student_count)||0,target):null,newStudents:n(row.new_student_count)||0,completedStudents:n(row.completed_student_count)||0,qualifiedStudents:qualified??(courseOutputRate!==null?Math.round((n(row.completed_student_count)||0)*courseOutputRate):null),outputRate:courseOutputRate,teachers:n(row.teacher_count)||0,upsellRevenue:n(row.upsell_revenue)||0,status:row.status||'',averageClassSize:ratio(n(row.active_student_count)||0,n(row.class_count)||0)}}).sort((a,b)=>b.activeStudents-a.activeStudents);
  const lowOutput=[...courses].filter(item=>item.outputRate!==null).sort((a,b)=>a.outputRate-b.outputRate)[0],oversized=courses.filter(item=>item.averageClassSize>25),revenueLeader=[...courses].sort((a,b)=>b.upsellRevenue-a.upsellRevenue)[0],missingTargets=courses.filter(item=>!item.target).length;
  const insights=[!outputDataAvailable&&{tone:'danger',title:'Chưa có dữ liệu đánh giá đầu ra',detail:'Cần cập nhật số học viên đạt chuẩn hoặc tỷ lệ đầu ra trước khi đánh giá chất lượng.'},missingTargets&&{tone:'warning',title:`${missingTargets} khóa chưa thiết lập kế hoạch`,detail:'Bổ sung kế hoạch học viên để theo dõi mức hoàn thành chính xác.'},lowOutput&&lowOutput.outputRate<.75&&{tone:'danger',title:`${lowOutput.name} có tỷ lệ đầu ra thấp`,detail:`Chỉ đạt ${(lowOutput.outputRate*100).toLocaleString('vi-VN',{maximumFractionDigits:1})}%, cần rà soát chất lượng học tập.`},oversized.length&&{tone:'warning',title:`${oversized.length} khóa vượt quy mô khuyến nghị`,detail:'Quy mô bình quân trên 25 học viên/lớp; cần rà soát khả năng mở thêm lớp.'},revenueLeader&&revenueLeader.upsellRevenue>0&&{tone:'success',title:`${revenueLeader.name} có doanh thu học lên cao nhất`,detail:`Đóng góp ${revenueLeader.upsellRevenue.toLocaleString('vi-VN')} đồng trong kỳ.`}].filter(Boolean).slice(0,4);
  return{period:dashboard.period,metrics:{activeClasses:metric('DAO_06',activeClasses),activeStudents:metric('DAO_01',activeStudents),studentPlan:{value:ratio(activeStudents,studentTarget),target:studentTarget||null,previous:null,change:null},completedStudents:metric('DAO_03',completedStudents),outputRate:metric('DAO_04',outputRate),upsellRevenue:metric('DAO_09',upsellRevenue)},studentMovement:{newStudents,activeStudents,completedStudents,qualifiedStudents},courses,monthly:monthly.map(item=>({year:Number(item.year),month:Number(item.month),activeStudents:Number(item.active_students)||0,activeClasses:Number(item.active_classes)||0})),dataQuality:{outputDataAvailable},insights};
}

module.exports={buildTrainingDashboard,weightedRate};
