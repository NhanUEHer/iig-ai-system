const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const XLSX=require('xlsx');
const db=require('../src/config/db');
const repository=require('../src/modules/reports/reportRepository');

const rows=(wb,name)=>XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null}).slice(5).filter(row=>row[0]);
const date=value=>value instanceof Date?value.toISOString().slice(0,10):null;
const periodRows=(wb,name,year,month)=>rows(wb,name).filter(row=>Number(row[1])===year&&Number(row[2])===month);

async function main(){
  const filePath=path.resolve(process.argv[2]||'');const year=Number(process.argv[3]);const month=Number(process.argv[4]);
  if(!filePath||!Number.isInteger(year)||!Number.isInteger(month))throw new Error('Usage: node scripts/import-standard-report-db.js <file> <year> <month>');
  const buffer=fs.readFileSync(filePath);const wb=XLSX.read(buffer,{type:'buffer',cellDates:true});
  const kpis=periodRows(wb,'02_KPI_SUMMARY',year,month).map(r=>({code:r[6],teamCode:r[4],target:r[10],actual:r[11],previous:r[13],priorYear:r[15],evaluation:r[17],note:r[18]}));
  if(!kpis.length)throw new Error(`Không có KPI kỳ ${month}/${year}.`);
  const revenue=periodRows(wb,'03_REVENUE_DETAIL',year,month).map(r=>({rowKey:r[0],productGroup:r[3],productCode:r[4],productName:r[5],orderCount:r[6],revenue:r[7],monthlyTarget:r[9],previousRevenue:r[11],priorYearRevenue:r[13],note:r[15]}));
  const adsChannels=periodRows(wb,'04_ADS_CHANNEL_DETAIL',year,month).map(r=>({rowKey:r[0],channelCode:r[3],trafficSource:r[4],budgetTarget:r[5],budgetActual:r[6],leadCount:r[8],orderCount:r[9],revenue:r[10],previousRevenue:r[14],note:r[16]}));
  const adsProducts=periodRows(wb,'05_ADS_PRODUCT_DETAIL',year,month).map(r=>({rowKey:r[0],productGroup:r[3],productCode:r[4],productName:r[5],adCost:r[6],revenue:r[8],leadCount:r[10],qualifiedLeadCount:null,orderCount:r[11],note:r[12]}));
  const social=periodRows(wb,'06_SOCIAL_DETAIL',year,month).map(r=>({rowKey:r[0],channelCode:r[3],channelName:r[4],followersCurrent:r[5],followersPrevious:r[6],reachCurrent:r[8],reachPrevious:r[9],organicReach:r[11],videoViews:r[13],engagementCount:r[14],engagementRate:r[15],leadCount:r[16],orderCount:r[17],revenue:r[18],budget:r[19],note:r[21]}));
  const trade=periodRows(wb,'07_TRADE_DETAIL',year,month).map(r=>({rowKey:r[0],organizationCode:r[3],organizationName:r[4],organizationType:r[5],region:r[6],activityType:r[7],activityDateText:r[8] instanceof Date?r[8].toISOString().slice(0,10):r[8],activityDays:r[9],workshopCount:r[10],socialPostCount:r[11],reach:r[12],leadCount:r[13],orderCount:r[14],budget:r[15],revenue:r[16],isNewContract:r[18],note:r[19]}));
  const training=periodRows(wb,'08_TRAINING_DETAIL',year,month).map(r=>({rowKey:r[0],courseCode:r[3],courseName:r[4],classCount:r[5],activeStudentCount:r[6],studentTarget:r[7],newStudentCount:r[9],completedStudentCount:r[10],qualifiedStudentCount:r[11],outputRate:r[12],teacherCount:r[13],startedClassCount:r[14],completedClassCount:r[15],upsellRevenue:r[16],upsellRevenueTarget:r[17],status:r[19],note:r[20]}));
  const products=periodRows(wb,'09_PRODUCT_DETAIL',year,month).map(r=>({rowKey:r[0],productGroup:r[4],activityCode:r[5],activityName:r[6],activityType:r[7],ownerUnit:r[8],cooperatingUnit:r[9],plannedStartDate:date(r[10]),plannedEndDate:date(r[11]),actualStartDate:date(r[12]),actualEndDate:date(r[13]),targetQuantity:r[14],actualQuantity:r[15],progressStatus:r[17],outputUrl:r[18],implementationResult:r[19],evaluationResult:r[20],nextAction:r[21],note:r[22]}));
  const notes=periodRows(wb,'10_REPORT_NOTE',year,month).map(r=>({teamCode:r[3],executiveSummary:r[5],highlights:r[6],issues:r[7],risks:r[8],proposals:r[9],nextMonthPlan:r[10],approvalStatus:r[11]}));
  const payload={filePeriod:{year,month},selectedPeriod:{year,month},warnings:[],missingActuals:kpis.filter(x=>x.actual==null).map(x=>x.code),kpis,details:{revenue,adsChannels,adsProducts,social,trade,training,products},notes,teamStatuses:[]};
  const user=await db.query("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1");if(!user.rows[0])throw new Error('Database dev chưa có admin.');
  const inspection=await repository.createInspection({year,month,userId:user.rows[0].id,fileName:path.basename(filePath),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',fileSize:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),templateVersion:'DB_STANDARD_2026',parsed:payload});
  const committed=await repository.commitImport(inspection.id,user.rows[0].id);console.log(JSON.stringify({kpis:kpis.length,details:Object.fromEntries(Object.entries(payload.details).map(([key,value])=>[key,value.length])),committed},null,2));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
