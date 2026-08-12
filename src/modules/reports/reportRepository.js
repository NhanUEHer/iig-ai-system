const db = require('../../config/db');
const {enrichRevenueDetails}=require('./reportRevenueMetrics');
const {enrichKpiHistory,enrichSocialHistory,applyComKpiFallback}=require('./reportHistoryMetrics');

async function getKpiHistory(year,month,teamCode=null) {
  const previousYear=Number(month)===1?Number(year)-1:Number(year),previousMonth=Number(month)===1?12:Number(month)-1;
  const params=[previousYear,previousMonth,Number(year)-1,Number(month)];let filter='';
  if(teamCode){params.push(teamCode);filter=` AND t.code=$${params.length}`;}
  const result=await db.query(`SELECT source_period,team_code,code,actual_value FROM (
    SELECT 'previous' source_period,t.code team_code,COALESCE(k.kpi_code,d.code) code,k.actual_value
    FROM report_periods p JOIN report_kpi_values k ON k.version_id=p.current_version_id JOIN report_kpi_definitions d ON d.id=k.kpi_definition_id JOIN report_teams t ON t.id=d.team_id
    WHERE p.year=$1 AND p.month=$2${filter}
    UNION ALL
    SELECT 'prior_year',t.code,COALESCE(k.kpi_code,d.code),k.actual_value
    FROM report_periods p JOIN report_kpi_values k ON k.version_id=p.current_version_id JOIN report_kpi_definitions d ON d.id=k.kpi_definition_id JOIN report_teams t ON t.id=d.team_id
    WHERE p.year=$3 AND p.month=$4${filter}
  ) history`,params);
  return result.rows;
}

const DETAIL_CONFIG = {
  revenue: ['report_revenue_details',['row_key','product_group','product_code','product_name','order_count','revenue','monthly_target','previous_revenue','prior_year_revenue','note'],['rowKey','productGroup','productCode','productName','orderCount','revenue','monthlyTarget','previousRevenue','priorYearRevenue','note']],
  adsChannels: ['report_ads_channel_details',['row_key','channel_code','traffic_source','budget_target','budget_actual','lead_count','order_count','revenue','previous_revenue','note'],['rowKey','channelCode','trafficSource','budgetTarget','budgetActual','leadCount','orderCount','revenue','previousRevenue','note']],
  adsProducts: ['report_ads_product_details',['row_key','product_group','product_code','product_name','ad_cost','revenue','lead_count','qualified_lead_count','order_count','note'],['rowKey','productGroup','productCode','productName','adCost','revenue','leadCount','qualifiedLeadCount','orderCount','note']],
  social: ['report_social_details',['row_key','channel_code','channel_name','followers_current','followers_previous','reach_current','reach_previous','organic_reach','video_views','engagement_count','engagement_rate','lead_count','order_count','revenue','budget','note'],['rowKey','channelCode','channelName','followersCurrent','followersPrevious','reachCurrent','reachPrevious','organicReach','videoViews','engagementCount','engagementRate','leadCount','orderCount','revenue','budget','note']],
  trade: ['report_trade_details',['row_key','organization_code','organization_name','organization_type','region','activity_type','activity_date_text','activity_days','workshop_count','social_post_count','reach','lead_count','order_count','budget','revenue','is_new_contract','note'],['rowKey','organizationCode','organizationName','organizationType','region','activityType','activityDateText','activityDays','workshopCount','socialPostCount','reach','leadCount','orderCount','budget','revenue','isNewContract','note']],
  training: ['report_training_details',['row_key','course_code','course_name','class_count','active_student_count','student_target','new_student_count','completed_student_count','qualified_student_count','output_rate','teacher_count','started_class_count','completed_class_count','upsell_revenue','upsell_revenue_target','status','note'],['rowKey','courseCode','courseName','classCount','activeStudentCount','studentTarget','newStudentCount','completedStudentCount','qualifiedStudentCount','outputRate','teacherCount','startedClassCount','completedClassCount','upsellRevenue','upsellRevenueTarget','status','note']],
  products: ['report_product_details',['row_key','product_group','activity_code','activity_name','activity_type','owner_unit','cooperating_unit','planned_start_date','planned_end_date','actual_start_date','actual_end_date','target_quantity','actual_quantity','progress_status','output_url','implementation_result','evaluation_result','next_action','note'],['rowKey','productGroup','activityCode','activityName','activityType','ownerUnit','cooperatingUnit','plannedStartDate','plannedEndDate','actualStartDate','actualEndDate','targetQuantity','actualQuantity','progressStatus','outputUrl','implementationResult','evaluationResult','nextAction','note']]
};

async function insertDetailRows(client, versionId, key, data) {
  const [table, columns, fields] = DETAIL_CONFIG[key];
  const chunkSize = Math.max(1, Math.floor(60000 / (fields.length + 2)));
  for (let start = 0; start < data.length; start += chunkSize) {
    const chunk = data.slice(start, start + chunkSize);
    const values = [];
    const tuples = chunk.map((row,index) => {
      const rowValues = [versionId, start + index + 1, ...fields.map(field => row[field] ?? null)];
      const placeholders = rowValues.map(value => { values.push(value); return `$${values.length}`; });
      return `(${placeholders.join(',')})`;
    });
    await client.query(`INSERT INTO ${table} (version_id,display_order,${columns.join(',')}) VALUES ${tuples.join(',')}`, values);
  }
  return { table, count: data.length };
}

module.exports = {
  async createInspection({ year, month, userId, fileName, mimeType, fileSize, sha256, templateVersion, parsed }) {
    return db.transaction(async client => {
      await client.query(`UPDATE report_imports SET status='cancelled',parsed_payload=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE status='ready' AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`);
      await client.query(`UPDATE report_imports SET parsed_payload=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE status IN ('failed','cancelled') AND parsed_payload IS NOT NULL AND created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`);
      const period = await client.query(`INSERT INTO report_periods(year,month,created_by) VALUES($1,$2,$3)
        ON CONFLICT(year,month) DO UPDATE SET updated_at=CURRENT_TIMESTAMP RETURNING *`, [year, month, userId]);
      const result = await client.query(`INSERT INTO report_imports(period_id,uploaded_by,original_file_name,mime_type,file_size_bytes,sha256,template_version,file_year,file_month,status,warnings,parsed_payload,inspected_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'ready',$10::jsonb,$11::jsonb,CURRENT_TIMESTAMP) RETURNING id,period_id,status,created_at`,
      [period.rows[0].id,userId,fileName,mimeType,fileSize,sha256,templateVersion,parsed.filePeriod.year,parsed.filePeriod.month,JSON.stringify(parsed.warnings),JSON.stringify(parsed)]);
      return { ...result.rows[0], period: period.rows[0] };
    });
  },
  async findImport(id) {
    const result = await db.query(`SELECT i.*,p.year,p.month,p.status AS period_status FROM report_imports i JOIN report_periods p ON p.id=i.period_id WHERE i.id=$1`, [id]);
    return result.rows[0] || null;
  },
  async getActiveTemplate() {
    const result = await db.query(`SELECT code,version,required_sheets,extraction_config,max_file_size_bytes,allowed_extensions
      FROM report_templates WHERE code='DVS_MONTHLY' AND is_active=TRUE ORDER BY created_at DESC LIMIT 1`);
    return result.rows[0] || null;
  },
  async listActiveKpiDefinitions(codes) {
    if (!codes.length) return [];
    const result = await db.query(`SELECT d.id,d.code,t.code AS team_code FROM report_kpi_definitions d
      JOIN report_teams t ON t.id=d.team_id WHERE d.is_active=TRUE AND d.code=ANY($1::text[])`, [codes]);
    return result.rows;
  },
  async markImportFailed(importId, error) {
    await db.query(`UPDATE report_imports SET status='failed',error_summary=$2::jsonb,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND status IN ('ready','committing')`, [importId,JSON.stringify([{ message:String(error?.message || 'Commit failed').slice(0,1000) }])]);
  },
  async commitImport(importId, userId) {
    return db.transaction(async client => {
      const found = await client.query(`SELECT i.*,p.status AS period_status FROM report_imports i JOIN report_periods p ON p.id=i.period_id WHERE i.id=$1 FOR UPDATE OF i,p`, [importId]);
      const item = found.rows[0];
      if (!item) return null;
      if (item.status !== 'ready') return { conflict: true, status: item.status };
      if (item.period_status === 'locked') return { locked: true };
      await client.query(`UPDATE report_imports SET status='committing',updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [importId]);
      const next = await client.query(`SELECT COALESCE(MAX(version_no),0)+1 AS no FROM report_data_versions WHERE period_id=$1`, [item.period_id]);
      const version = await client.query(`INSERT INTO report_data_versions(period_id,version_no,source_type,import_id,status,created_by)
        VALUES($1,$2,'excel_import',$3,'draft',$4) RETURNING *`, [item.period_id,next.rows[0].no,importId,userId]);
      const versionId = version.rows[0].id;
      const payload = item.parsed_payload;
      const codes = payload.kpis.map(kpi => kpi.code);
      const definitions = await client.query('SELECT id,code FROM report_kpi_definitions WHERE code=ANY($1::text[]) AND is_active=TRUE', [codes]);
      const definitionMap = new Map(definitions.rows.map(row => [row.code,row.id]));
      const kpiValues = [];
      const kpiTuples = payload.kpis.map(kpi => {
        const definitionId = definitionMap.get(kpi.code);
        if (!definitionId) throw new Error(`KPI chưa có trong catalog: ${kpi.code}`);
        const row = [versionId,definitionId,kpi.target,kpi.actual,kpi.previous,kpi.priorYear,kpi.evaluation,kpi.note,userId];
        const placeholders = row.map(value => { kpiValues.push(value); return `$${kpiValues.length}`; });
        return `(${placeholders.join(',')})`;
      });
      if (kpiTuples.length) await client.query(`INSERT INTO report_kpi_values(version_id,kpi_definition_id,target_value,actual_value,previous_value,prior_year_value,evaluation,note,created_by,
        kpi_code,kpi_name,unit_snapshot,evaluation_direction_snapshot,aggregation_method_snapshot,input_mode_snapshot,formula_code_snapshot,display_order_snapshot)
        SELECT x.version_id,x.kpi_definition_id,x.target_value,x.actual_value,x.previous_value,x.prior_year_value,x.evaluation,x.note,x.created_by,
          d.code,d.name,d.unit,d.evaluation_direction,d.aggregation_method,d.input_mode,d.formula_code,d.display_order
        FROM (VALUES ${kpiTuples.join(',')}) x(version_id,kpi_definition_id,target_value,actual_value,previous_value,prior_year_value,evaluation,note,created_by)
        JOIN report_kpi_definitions d ON d.id=x.kpi_definition_id`, kpiValues);
      const detailResults = [];
      for (const key of Object.keys(DETAIL_CONFIG)) detailResults.push(await insertDetailRows(client,versionId,key,payload.details[key] || []));
      for (const note of payload.notes || []) {
        await client.query(`INSERT INTO report_notes(version_id,team_id,executive_summary,highlights,issues,risks,proposals,next_month_plan,approval_status)
          SELECT $1,id,$2,$3,$4,$5,$6,$7,$8 FROM report_teams WHERE code=$9`, [versionId,note.executiveSummary,note.highlights,note.issues,note.risks,note.proposals,note.nextMonthPlan,note.approvalStatus,note.teamCode]);
      }
      await client.query(`UPDATE report_data_versions SET status='superseded' WHERE period_id=$1 AND status='published'`, [item.period_id]);
      await client.query(`UPDATE report_data_versions SET status='published',published_by=$2,published_at=CURRENT_TIMESTAMP WHERE id=$1`, [versionId,userId]);
      await client.query(`UPDATE report_periods SET current_version_id=$2,status='published',approved_by=$3,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [item.period_id,versionId,userId]);
      await client.query(`UPDATE report_imports SET status='committed',parsed_payload=NULL,committed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [importId]);
      const logs = [['98_DATA_EXPORT','report_kpi_values',payload.kpis.length], ...detailResults.map(r => ['',r.table,r.count]), ['Nhiều sheet','report_notes',(payload.notes || []).length]];
      for (const [source,target,count] of logs) await client.query(`INSERT INTO report_import_table_logs(import_id,source_sheet,target_table,rows_read,rows_inserted,status) VALUES($1,$2,$3,$4,$4,'success')`, [importId,source,target,count]);
      return { versionId, versionNo: Number(version.rows[0].version_no), counts: Object.fromEntries(logs.map(([,target,count]) => [target,count])) };
    });
  },
  async listBootstrap() {
    const [periods, teams, lookups, template] = await Promise.all([
      db.query(`SELECT p.id,p.year,p.month,p.status,p.current_version_id,i.original_file_name,i.committed_at
        FROM report_periods p LEFT JOIN LATERAL (
          SELECT original_file_name,committed_at FROM report_imports
          WHERE period_id=p.id AND status='committed' ORDER BY committed_at DESC LIMIT 1
        ) i ON TRUE ORDER BY p.year DESC,p.month DESC`),
      db.query(`SELECT id,code,name FROM report_teams WHERE is_active=TRUE ORDER BY display_order`),
      db.query(`SELECT category,code,label,display_order FROM report_lookup_values WHERE is_active=TRUE ORDER BY category,display_order`),
      db.query(`SELECT code,name,version,required_sheets,allowed_extensions,max_file_size_bytes FROM report_templates WHERE code='DVS_MONTHLY' AND is_active=TRUE LIMIT 1`)
    ]);
    const masterData = {};
    lookups.rows.forEach(row => { if (!masterData[row.category]) masterData[row.category]=[]; masterData[row.category].push({code:row.code,label:row.label}); });
    return { periods:periods.rows, teams:teams.rows, masterData, template:template.rows[0] || null };
  },
  async getDashboard({ year, month, teamCode,periodId=null,draft=false }) {
    const version = periodId&&draft
      ? await db.query(`SELECT v.id,v.version_no,v.source_type,p.status,p.year,p.month FROM report_periods p JOIN LATERAL(SELECT * FROM report_data_versions WHERE period_id=p.id AND status='draft' ORDER BY version_no DESC LIMIT 1)v ON TRUE WHERE p.id=$1`,[periodId])
      : await db.query(`SELECT v.id,v.version_no,v.source_type,p.status,p.year,p.month FROM report_periods p JOIN report_data_versions v ON v.id=p.current_version_id WHERE p.year=$1 AND p.month=$2`, [year,month]);
    if (!version.rows[0]) return null;
    const versionId = version.rows[0].id;
    const [kpis,note,kpiHistory] = await Promise.all([
      db.query(`SELECT COALESCE(v.kpi_code,d.code) code,COALESCE(v.kpi_name,d.name) name,COALESCE(v.unit_snapshot,d.unit) unit,
        COALESCE(v.evaluation_direction_snapshot,d.evaluation_direction) evaluation_direction,COALESCE(v.aggregation_method_snapshot,d.aggregation_method) aggregation_method,
        t.code team_code,v.target_value,v.actual_value,v.previous_value,v.prior_year_value,v.evaluation,v.note,
        CASE WHEN v.target_value IS NULL OR v.actual_value IS NULL OR COALESCE(v.evaluation_direction_snapshot,d.evaluation_direction)='monitor' THEN NULL
          WHEN COALESCE(v.evaluation_direction_snapshot,d.evaluation_direction)='decrease_good' THEN CASE WHEN v.actual_value<=0 THEN 1.2 ELSE v.target_value/v.actual_value END
          WHEN v.target_value=0 THEN CASE WHEN v.actual_value>0 THEN 1.2 ELSE NULL END ELSE v.actual_value/v.target_value END AS achievement
        FROM report_kpi_values v JOIN report_kpi_definitions d ON d.id=v.kpi_definition_id JOIN report_teams t ON t.id=d.team_id
        WHERE v.version_id=$1 AND t.code=$2 ORDER BY COALESCE(v.display_order_snapshot,d.display_order)`, [versionId,teamCode]),
      db.query(`SELECT n.* FROM report_notes n JOIN report_teams t ON t.id=n.team_id WHERE n.version_id=$1 AND t.code=$2`, [versionId,teamCode]),
      getKpiHistory(version.rows[0].year,version.rows[0].month,teamCode)
    ]);
    const detailMap = { REV:'report_revenue_details',ADS:'report_ads_channel_details',COM:'report_social_details',TRADE:'report_trade_details',TRAIN:'report_training_details',PROD:'report_product_details' };
    const table = detailMap[teamCode] || detailMap.REV;
    const details = await db.query(`SELECT * FROM ${table} WHERE version_id=$1 ORDER BY display_order,row_key`, [versionId]);
    let detailRows=details.rows;
    if(teamCode==='REV'){
      const period=version.rows[0],previousYear=Number(period.month)===1?Number(period.year)-1:Number(period.year),previousMonth=Number(period.month)===1?12:Number(period.month)-1;
      const history=await db.query(`SELECT source_period,product_code,product_group,product_name,revenue FROM (
        SELECT 'previous' source_period,d.product_code,d.product_group,d.product_name,d.revenue FROM report_periods p JOIN report_revenue_details d ON d.version_id=p.current_version_id WHERE p.year=$1 AND p.month=$2
        UNION ALL
        SELECT 'prior_year',d.product_code,d.product_group,d.product_name,d.revenue FROM report_periods p JOIN report_revenue_details d ON d.version_id=p.current_version_id WHERE p.year=$3 AND p.month=$4
      ) revenue_history`,[previousYear,previousMonth,Number(period.year)-1,Number(period.month)]);
      detailRows=enrichRevenueDetails(detailRows,history.rows);
    }
    if(teamCode==='COM'){
      const period=version.rows[0],previousYear=Number(period.month)===1?Number(period.year)-1:Number(period.year),previousMonth=Number(period.month)===1?12:Number(period.month)-1;
      const history=await db.query(`SELECT d.channel_code,d.channel_name,d.followers_current,d.reach_current FROM report_periods p JOIN report_social_details d ON d.version_id=p.current_version_id WHERE p.year=$1 AND p.month=$2`,[previousYear,previousMonth]);
      detailRows=enrichSocialHistory(detailRows,history.rows);
    }
    const detailSections=[{key:teamCode==='ADS'?'adsChannels':teamCode.toLowerCase(),title:teamCode==='ADS'?'Hiệu quả theo nguồn Ads':'Dữ liệu chi tiết',rows:detailRows}];
    if(teamCode==='ADS'){
      const products=await db.query('SELECT * FROM report_ads_product_details WHERE version_id=$1 ORDER BY display_order,row_key',[versionId]);
      detailSections.push({key:'adsProducts',title:'Tỷ trọng Ads theo sản phẩm',rows:products.rows});
    }
    const kpiRows=teamCode==='COM'?applyComKpiFallback(kpis.rows,detailRows):kpis.rows;
    return { period:version.rows[0],teamCode,kpis:enrichKpiHistory(kpiRows,kpiHistory),note:note.rows[0] || null,details:detailRows,detailSections };
  },
  async getOverviewRows({ year, month }) {
    const [result,social]=await Promise.all([db.query(`SELECT p.year,p.month,v.published_at,t.code AS team_code,t.name AS team_name,
      COALESCE(k.kpi_code,d.code) code,COALESCE(k.kpi_name,d.name) name,COALESCE(k.unit_snapshot,d.unit) unit,
      COALESCE(k.evaluation_direction_snapshot,d.evaluation_direction) evaluation_direction,k.target_value,k.actual_value,k.previous_value,k.prior_year_value,k.evaluation,
      CASE WHEN k.target_value IS NULL OR k.actual_value IS NULL OR COALESCE(k.evaluation_direction_snapshot,d.evaluation_direction)='monitor' THEN NULL
        WHEN COALESCE(k.evaluation_direction_snapshot,d.evaluation_direction)='decrease_good' THEN CASE WHEN k.actual_value<=0 THEN 1.2 ELSE k.target_value/k.actual_value END
        WHEN k.target_value=0 THEN CASE WHEN k.actual_value>0 THEN 1.2 ELSE NULL END ELSE k.actual_value/k.target_value END AS achievement
      FROM report_periods p JOIN report_data_versions v ON v.id=p.current_version_id
      JOIN report_kpi_values k ON k.version_id=v.id JOIN report_kpi_definitions d ON d.id=k.kpi_definition_id
      JOIN report_teams t ON t.id=d.team_id WHERE p.year=$1 AND p.month=$2 ORDER BY t.display_order,COALESCE(k.display_order_snapshot,d.display_order)`, [year,month]),
      db.query(`SELECT d.* FROM report_periods p JOIN report_social_details d ON d.version_id=p.current_version_id WHERE p.year=$1 AND p.month=$2`,[year,month])]);
    const rows=applyComKpiFallback(result.rows.filter(row=>row.team_code==='COM'),social.rows);
    const comByCode=new Map(rows.map(row=>[row.code,row]));
    return enrichKpiHistory(result.rows.map(row=>row.team_code==='COM'?comByCode.get(row.code):row),await getKpiHistory(year,month));
  },
  async getTrendRows({ year, teamCode }) {
    const params=[year]; let teamFilter='';
    if (teamCode) { params.push(teamCode); teamFilter=`AND t.code=$${params.length}`; }
    const result = await db.query(`SELECT p.month,t.code AS team_code,t.name AS team_name,COALESCE(k.kpi_code,d.code) code,
      COALESCE(k.evaluation_direction_snapshot,d.evaluation_direction) evaluation_direction,k.target_value,k.actual_value
      FROM report_periods p JOIN report_data_versions v ON v.id=p.current_version_id
      JOIN report_kpi_values k ON k.version_id=v.id JOIN report_kpi_definitions d ON d.id=k.kpi_definition_id
      JOIN report_teams t ON t.id=d.team_id WHERE p.year=$1 ${teamFilter} ORDER BY p.month,t.display_order,d.display_order`,params);
    return result.rows;
  },
  async listImports(limit = 20) {
    const result = await db.query(`SELECT i.id,i.original_file_name,i.file_size_bytes,i.status,i.warnings,i.created_at,i.committed_at,p.year,p.month,u.name AS uploaded_by
      FROM report_imports i JOIN report_periods p ON p.id=i.period_id JOIN users u ON u.id=i.uploaded_by ORDER BY i.created_at DESC LIMIT $1`, [limit]);
    return result.rows;
  }
};
