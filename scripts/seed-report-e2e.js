const db = require('../src/config/db');
const manualReportService = require('../src/modules/reports/manualReportService');
const reportService = require('../src/modules/reports/reportService');
const kpiConfigService = require('../src/modules/reports/kpiConfigService');

const TEAMS = ['REV','ADS','COM','TRADE','TRAIN','PROD'];

function valueFor(kpi, teamIndex, kpiIndex, monthIndex) {
  const ordinal = (teamIndex + 1) * (kpiIndex + 1);
  let target;
  if (kpi.unit === '%') target = 0.08 + ordinal * 0.005;
  else if (kpi.unit === 'Tỷ đồng') target = ordinal * 1_000_000_000;
  else if (kpi.unit === 'Triệu đồng') target = ordinal * 1_000_000;
  else target = ordinal * 100;
  const good = (kpiIndex + monthIndex) % 3 !== 0;
  const factor = kpi.evaluation_direction === 'decrease_good'
    ? (good ? 0.88 : 1.12)
    : (good ? 1.08 : 0.86);
  return { target_value:target, actual_value:target * factor, note:`E2E kỳ ${monthIndex + 1}` };
}

function detailsFor(team, month) {
  const multiplier = month === 8 ? 1.12 : 1;
  const rows = {
    REV:[{row_key:`e2e-rev-${month}-1`,product_group:'TOEIC LR',product_name:'TOEIC Online E2E',order_count:120*multiplier,revenue:1_800_000_000*multiplier,monthly_target:1_700_000_000,note:'Dữ liệu kiểm thử E2E'}],
    ADS:[{row_key:`e2e-ads-${month}-1`,traffic_source:'Facebook',budget_target:300_000_000,budget_actual:280_000_000*multiplier,lead_count:900*multiplier,order_count:110*multiplier,revenue:1_200_000_000*multiplier,note:'Dữ liệu kiểm thử E2E'}],
    COM:[{row_key:`e2e-com-${month}-1`,channel_name:'Fanpage IIG Vietnam',followers_current:105_000*multiplier,followers_previous:100_000,reach_current:1_500_000*multiplier,reach_previous:1_300_000,video_views:400_000*multiplier,engagement_rate:0.035,lead_count:180*multiplier,revenue:220_000_000*multiplier,note:'Dữ liệu kiểm thử E2E'}],
    TRADE:[{row_key:`e2e-trade-${month}-1`,organization_name:'Đại học E2E',organization_type:'Đại học',region:'Miền Bắc',activity_date_text:`15/${month}/2026`,activity_days:2,workshop_count:1,reach:8_000*multiplier,lead_count:140*multiplier,budget:80_000_000,revenue:250_000_000*multiplier,note:'Dữ liệu kiểm thử E2E'}],
    TRAIN:[{row_key:`e2e-train-${month}-1`,course_name:'TOEIC LR E2E',class_count:4,active_student_count:100*multiplier,student_target:95,new_student_count:30*multiplier,completed_student_count:25,qualified_student_count:22,output_rate:0.88,teacher_count:5,upsell_revenue:180_000_000*multiplier,status:'Đang thực hiện',note:'Dữ liệu kiểm thử E2E'}],
    PROD:[{row_key:`e2e-prod-${month}-1`,product_group:'TOEIC LR',activity_name:'Nâng cấp sản phẩm E2E',activity_type:'Điều chỉnh',owner_unit:'DVS',cooperating_unit:'Academic',next_action:'Theo dõi sau phát hành',implementation_result:'Hoàn thành kiểm thử',progress_status:'Hoàn thành',actual_end_date:`2026-${String(month).padStart(2,'0')}-20`,output_url:'https://example.com/e2e',note:'Dữ liệu kiểm thử E2E'}]
  };
  return rows[team];
}

async function seedPeriod(year, month, userId, monthIndex) {
  const created = await manualReportService.create({year,month,copyTargets:true},userId);
  for (const [teamIndex,team] of TEAMS.entries()) {
    const workspace = await manualReportService.workspace(created.periodId,team);
    const kpis = workspace.kpis.map((kpi,kpiIndex)=>({code:kpi.code,...valueFor(kpi,teamIndex,kpiIndex,monthIndex)}));
    const body = {
      kpis,
      details:detailsFor(team,month),
      adsProducts:team==='ADS'?[{row_key:`e2e-ads-product-${month}`,product_group:'TOEIC LR',product_name:'TOEIC Online E2E',ad_cost:180_000_000,revenue:900_000_000,lead_count:600,qualified_lead_count:420,order_count:80,note:'E2E'}]:[],
      note:{highlights:`Kết quả E2E tháng ${month}`,issues:'Dữ liệu dùng để kiểm thử luồng báo cáo.',risks:'Không sử dụng cho báo cáo thực tế.',proposals:'Đối chiếu dashboard và công thức.',next_month_plan:'Tiếp tục kiểm thử dữ liệu tháng kế tiếp.'}
    };
    const saved = await manualReportService.save(created.periodId,team,body,userId);
    if (saved.validation_result.errors.length) throw new Error(`${team} validation failed: ${saved.validation_result.errors.join('; ')}`);
    await manualReportService.transition(created.periodId,team,{action:'submit'},userId);
    await manualReportService.transition(created.periodId,team,{action:'approve',note:'E2E approved'},userId);
  }
  await manualReportService.publish(created.periodId,userId);
  return created;
}

async function main() {
  if (process.env.CONFIRM_SEED_REPORT_E2E !== 'yes') throw new Error('Set CONFIRM_SEED_REPORT_E2E=yes to create test report data.');
  const actor = await db.query('SELECT id FROM users ORDER BY created_at LIMIT 1');
  if (!actor.rows[0]) throw new Error('No user is available for report audit fields.');
  const userId = actor.rows[0].id;
  const existing = await db.query('SELECT year,month FROM report_periods ORDER BY year,month');
  if (existing.rowCount) throw new Error(`Report periods already exist: ${existing.rows.map(x=>`${x.month}/${x.year}`).join(', ')}`);

  const config = {};
  for (const team of TEAMS) {
    const items = await kpiConfigService.list({team});
    const active = items.filter(item=>item.is_active);
    if (!active.length || active.some(item=>item.input_mode!=='manual')) throw new Error(`Invalid KPI config for ${team}.`);
    await kpiConfigService.reorder({teamCode:team,ids:active.map(item=>item.id)},userId);
    config[team] = active.length;
  }

  await seedPeriod(2026,7,userId,0);
  await seedPeriod(2026,8,userId,1);

  const overviews = [];
  for (const month of [7,8]) {
    const overview = await reportService.overview({year:2026,month});
    if (overview.teams.length!==6 || overview.kpis.length!==47) throw new Error(`Overview ${month}/2026 is incomplete.`);
    const dashboards = {};
    for (const team of TEAMS) {
      const dashboard = await reportService.dashboard({year:2026,month,team});
      if (!dashboard.kpis.length || !dashboard.details.length) throw new Error(`Dashboard ${team} ${month}/2026 is incomplete.`);
      dashboards[team] = {kpis:dashboard.kpis.length,details:dashboard.details.length};
    }
    overviews.push({month,summary:overview.summary,teams:overview.teams.length,kpis:overview.kpis.length,dashboards});
  }
  const trend = await reportService.trend({year:2026});
  if (trend.length!==2) throw new Error('Trend does not contain both E2E periods.');
  console.log(JSON.stringify({config,periods:overviews,trend},null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
