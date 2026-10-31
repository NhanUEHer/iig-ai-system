const { healthScore, healthStatus, numericOrNull } = require('./reportHealth');

const average = values => {
  const available = values.filter(value => value !== null && Number.isFinite(value));
  return available.length ? available.reduce((sum,value) => sum + value,0) / available.length : null;
};

function scoreForValue(kpi,value) {
  return healthScore({...kpi,actual_value:value});
}

function summarizeKpis(kpis=[]) {
  const counts={total:kpis.length,good:0,near:0,risk:0,missing:0,monitored:0};
  const currentScores=[],previousScores=[],priorYearScores=[];
  for(const kpi of kpis){
    if(kpi.evaluation_direction==='monitor')counts.monitored++;
    const score=healthScore(kpi),status=healthStatus(score);
    counts[status]++;
    currentScores.push(score);
    previousScores.push(scoreForValue(kpi,kpi.previous_value));
    priorYearScores.push(scoreForValue(kpi,kpi.prior_year_value));
  }
  const achievement=average(currentScores),previousAchievement=average(previousScores),priorYearAchievement=average(priorYearScores);
  return {
    ...counts,
    evaluated:currentScores.filter(value=>value!==null).length,
    achievement,
    previousAchievement,
    priorYearAchievement,
    previousChange:achievement!==null&&previousAchievement!==null?achievement-previousAchievement:null,
    priorYearChange:achievement!==null&&priorYearAchievement!==null?achievement-priorYearAchievement:null
  };
}

function buildInsights(kpis=[],limit=8) {
  const items=[];
  for(const kpi of kpis){
    const score=healthScore(kpi),status=healthStatus(score);
    const actual=numericOrNull(kpi.actual_value),previous=numericOrNull(kpi.previous_value);
    const rawChange=actual!==null&&previous!==null&&previous!==0?(actual-previous)/Math.abs(previous):null;
    const favorableChange=rawChange===null?null:kpi.evaluation_direction==='decrease_good'?-rawChange:rawChange;
    const base={teamCode:kpi.team_code||kpi.teamCode||null,kpiCode:kpi.code,kpiName:kpi.name,status,score,actual,target:numericOrNull(kpi.target_value)};
    if(status==='missing')items.push({...base,type:'missing',severity:'warning',message:'Chưa có đủ kế hoạch hoặc kết quả thực hiện.'});
    else if(status==='risk')items.push({...base,type:'below_target',severity:'critical',message:'KPI đang dưới 85% mức kế hoạch.'});
    if(favorableChange!==null&&favorableChange<=-0.1)items.push({...base,type:'negative_trend',severity:favorableChange<=-0.2?'critical':'warning',change:rawChange,message:'Kết quả diễn biến xấu từ 10% so với kỳ trước.'});
  }
  const priority={critical:0,warning:1,info:2};
  return items.sort((a,b)=>(priority[a.severity]-priority[b.severity])||((a.score??2)-(b.score??2))).slice(0,limit);
}

module.exports={average,summarizeKpis,buildInsights};
