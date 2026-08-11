const crypto=require('crypto');
const db=require('../../config/db');
const {DETAIL_CONFIG}=require('./manualReportConfig');

async function insertRows(client,versionId,detailKey,rows) {
  const [table,columns]=DETAIL_CONFIG[detailKey];
  if(!table) throw new Error('Unsupported report detail type.');
  await client.query(`DELETE FROM ${table} WHERE version_id=$1`,[versionId]);
  if(!rows.length)return;
  const values=[];const tuples=rows.map((row,index)=>{
    const normalized={...row,row_key:String(row.row_key||crypto.randomUUID()).slice(0,160),display_order:index+1};
    const rowValues=[versionId,...columns.map(column=>normalized[column]??null)];
    return `(${rowValues.map(value=>{values.push(value);return `$${values.length}`;}).join(',')})`;
  });
  await client.query(`INSERT INTO ${table}(version_id,${columns.join(',')}) VALUES ${tuples.join(',')}`,values);
}

module.exports={
  async listPeriods({year,status,assignedUserId}) {
    const values=[];const where=[];
    if(year){values.push(year);where.push(`p.year=$${values.length}`);}
    if(status){values.push(status);where.push(`p.status=$${values.length}`);}
    if(assignedUserId){values.push(assignedUserId);where.push(`EXISTS(SELECT 1 FROM report_manual_submissions own_s JOIN report_data_versions own_v ON own_v.id=own_s.version_id WHERE own_s.period_id=p.id AND own_s.assigned_user_id=$${values.length} AND own_v.id=v.id)`);}
    const result=await db.query(`SELECT p.id,p.year,p.month,p.status,p.submission_deadline,p.created_at,p.updated_at,
      v.id AS version_id,v.version_no,v.status AS version_status,v.source_type,
      COUNT(s.id)::int AS total_teams,
      COUNT(s.id) FILTER(WHERE s.status='approved')::int AS approved_teams,
      COUNT(s.id) FILTER(WHERE s.status='submitted')::int AS submitted_teams,
      COUNT(s.id) FILTER(WHERE s.status IN('draft','editing','returned'))::int AS editable_teams
      FROM report_periods p
      LEFT JOIN LATERAL(SELECT * FROM report_data_versions WHERE period_id=p.id AND source_type='manual_entry' ORDER BY version_no DESC LIMIT 1)v ON TRUE
      LEFT JOIN report_manual_submissions s ON s.version_id=v.id
      ${where.length?`WHERE ${where.join(' AND ')}`:''}
      GROUP BY p.id,v.id,v.version_no,v.status,v.source_type
      ORDER BY p.year DESC,p.month DESC`,values);
    return result.rows;
  },
  async createPeriod({year,month,deadline,userId,copyTargets=true}) {
    return db.transaction(async client=>{
      const periodResult=await client.query(`INSERT INTO report_periods(year,month,status,submission_deadline,created_by)
        VALUES($1,$2,'open',$3,$4) ON CONFLICT(year,month) DO UPDATE SET submission_deadline=COALESCE(EXCLUDED.submission_deadline,report_periods.submission_deadline),updated_at=CURRENT_TIMESTAMP RETURNING *`,[year,month,deadline||null,userId]);
      const period=periodResult.rows[0];await client.query('SELECT id FROM report_periods WHERE id=$1 FOR UPDATE',[period.id]);
      if(period.status==='locked')return {locked:true,periodId:period.id};
      const existing=await client.query(`SELECT id FROM report_data_versions WHERE period_id=$1 AND source_type='manual_entry' AND status='draft'`,[period.id]);
      if(existing.rows[0])return {conflict:true,periodId:period.id};
      const next=await client.query('SELECT COALESCE(MAX(version_no),0)+1 no FROM report_data_versions WHERE period_id=$1',[period.id]);
      const version=await client.query(`INSERT INTO report_data_versions(period_id,version_no,source_type,status,created_by) VALUES($1,$2,'manual_entry','draft',$3) RETURNING *`,[period.id,next.rows[0].no,userId]);
      const versionId=version.rows[0].id;
      await client.query(`INSERT INTO report_kpi_values(version_id,kpi_definition_id,target_value,actual_value,previous_value,prior_year_value,source_type,created_by,
        kpi_code,kpi_name,unit_snapshot,evaluation_direction_snapshot,aggregation_method_snapshot,input_mode_snapshot,formula_code_snapshot,display_order_snapshot)
        SELECT $1,d.id,CASE WHEN $5 THEN current_k.target_value ELSE NULL END,NULL,previous_k.actual_value,prior_k.actual_value,'manual_entry',$2,
        d.code,d.name,d.unit,d.evaluation_direction,d.aggregation_method,d.input_mode,d.formula_code,d.display_order
        FROM report_kpi_definitions d
        LEFT JOIN report_kpi_values current_k ON current_k.version_id=$3 AND current_k.kpi_definition_id=d.id
        LEFT JOIN report_periods previous_p ON previous_p.year=CASE WHEN $4=1 THEN $6-1 ELSE $6 END AND previous_p.month=CASE WHEN $4=1 THEN 12 ELSE $4-1 END
        LEFT JOIN report_kpi_values previous_k ON previous_k.version_id=previous_p.current_version_id AND previous_k.kpi_definition_id=d.id
        LEFT JOIN report_periods prior_p ON prior_p.year=$6-1 AND prior_p.month=$4
        LEFT JOIN report_kpi_values prior_k ON prior_k.version_id=prior_p.current_version_id AND prior_k.kpi_definition_id=d.id
        WHERE d.is_active=TRUE`,[versionId,userId,period.current_version_id,month,copyTargets,year]);
      await client.query(`INSERT INTO report_manual_submissions(period_id,version_id,team_id)
        SELECT $1,$2,id FROM report_teams WHERE is_active=TRUE`,[period.id,versionId]);
      await client.query(`INSERT INTO report_entry_audit_logs(period_id,version_id,action,actor_id,change_summary) VALUES($1,$2,'period_created',$3,$4::jsonb)`,[period.id,versionId,userId,JSON.stringify({year,month,copyTargets})]);
      return {periodId:period.id,versionId,versionNo:Number(version.rows[0].version_no)};
    });
  },
  async findPeriod(year,month) {
    const result=await db.query(`SELECT p.*,v.id AS draft_version_id,v.version_no AS draft_version_no,
      COALESCE(json_agg(json_build_object('id',s.id,'teamCode',t.code,'teamName',t.name,'status',s.status,'errors',jsonb_array_length(s.validation_result->'errors'),'warnings',jsonb_array_length(s.validation_result->'warnings'),'assignedUserId',s.assigned_user_id,'assigneeName',u.name,'assigneeEmail',u.email) ORDER BY t.display_order) FILTER(WHERE s.id IS NOT NULL),'[]') submissions
      FROM report_periods p LEFT JOIN LATERAL(SELECT * FROM report_data_versions WHERE period_id=p.id AND source_type='manual_entry' AND status='draft' ORDER BY version_no DESC LIMIT 1)v ON TRUE
      LEFT JOIN report_manual_submissions s ON s.version_id=v.id LEFT JOIN report_teams t ON t.id=s.team_id LEFT JOIN users u ON u.id=s.assigned_user_id
      WHERE p.year=$1 AND p.month=$2 GROUP BY p.id,v.id,v.version_no`,[year,month]);
    return result.rows[0]||null;
  },
  async getPeriod(periodId) {
    const result=await db.query(`SELECT p.*,v.id AS draft_version_id,v.version_no AS draft_version_no,v.status AS version_status,
      COALESCE(json_agg(json_build_object('id',s.id,'teamCode',t.code,'teamName',t.name,'status',COALESCE(s.status,'approved'),'errors',COALESCE(jsonb_array_length(s.validation_result->'errors'),0),'warnings',COALESCE(jsonb_array_length(s.validation_result->'warnings'),0),'assignedUserId',s.assigned_user_id,'assigneeName',u.name,'assigneeEmail',u.email) ORDER BY t.display_order) FILTER(WHERE t.id IS NOT NULL),'[]') submissions
      FROM report_periods p LEFT JOIN LATERAL(SELECT * FROM report_data_versions WHERE period_id=p.id ORDER BY version_no DESC LIMIT 1)v ON TRUE
      LEFT JOIN report_teams t ON t.is_active=TRUE LEFT JOIN report_manual_submissions s ON s.version_id=v.id AND s.team_id=t.id LEFT JOIN users u ON u.id=s.assigned_user_id
      WHERE p.id=$1 GROUP BY p.id,v.id,v.version_no,v.status`,[periodId]);
    return result.rows[0]||null;
  },
  async getWorkspace(periodId,teamCode) {
    const base=await db.query(`SELECT p.id period_id,p.year,p.month,p.status period_status,p.submission_deadline,v.id version_id,v.version_no,
      s.id submission_id,COALESCE(s.status,'approved') submission_status,COALESCE(s.revision,1) revision,COALESCE(s.validation_result,'{"errors":[],"warnings":[]}'::jsonb) validation_result,s.review_note,s.assigned_user_id,u.name assignee_name,u.email assignee_email,t.id team_id,t.code team_code,t.name team_name
      FROM report_periods p JOIN LATERAL(SELECT * FROM report_data_versions WHERE period_id=p.id ORDER BY version_no DESC LIMIT 1)v ON TRUE
      JOIN report_teams t ON t.code=$2 AND t.is_active=TRUE LEFT JOIN report_manual_submissions s ON s.version_id=v.id AND s.team_id=t.id LEFT JOIN users u ON u.id=s.assigned_user_id
      WHERE p.id=$1 AND t.code=$2 ORDER BY v.version_no DESC LIMIT 1`,[periodId,teamCode]);
    if(!base.rows[0])return null;const item=base.rows[0];
    const [kpis,note]=await Promise.all([
      db.query(`SELECT COALESCE(k.kpi_code,d.code) code,COALESCE(k.kpi_name,d.name) name,COALESCE(k.unit_snapshot,d.unit) unit,
        COALESCE(k.evaluation_direction_snapshot,d.evaluation_direction) evaluation_direction,COALESCE(k.input_mode_snapshot,d.input_mode) input_mode,
        COALESCE(k.formula_code_snapshot,d.formula_code) formula_code,k.target_value,k.actual_value,k.previous_value,k.prior_year_value,k.note
        FROM report_kpi_values k JOIN report_kpi_definitions d ON d.id=k.kpi_definition_id WHERE k.version_id=$1 AND d.team_id=$2
        ORDER BY COALESCE(k.display_order_snapshot,d.display_order)`,[item.version_id,item.team_id]),
      db.query('SELECT highlights,issues,risks,proposals,next_month_plan FROM report_notes WHERE version_id=$1 AND team_id=$2',[item.version_id,item.team_id])
    ]);
    return {...item,kpis:kpis.rows,note:note.rows[0]||{},};
  },
  async getDetails(versionId,detailKey) { const [table]=DETAIL_CONFIG[detailKey];const result=await db.query(`SELECT * FROM ${table} WHERE version_id=$1 ORDER BY display_order,row_key`,[versionId]);return result.rows; },
  async getRevenueHistory(year,month) {
    const previousYear=month===1?year-1:year,previousMonth=month===1?12:month-1;
    const result=await db.query(`SELECT source_period,product_code,product_group,product_name,revenue FROM (
      SELECT 'previous' source_period,d.product_code,d.product_group,d.product_name,d.revenue FROM report_periods p JOIN report_revenue_details d ON d.version_id=p.current_version_id WHERE p.year=$1 AND p.month=$2
      UNION ALL
      SELECT 'prior_year',d.product_code,d.product_group,d.product_name,d.revenue FROM report_periods p JOIN report_revenue_details d ON d.version_id=p.current_version_id WHERE p.year=$3 AND p.month=$4
    ) history`,[previousYear,previousMonth,year-1,month]);
    return result.rows;
  },
  async saveWorkspace({base,detailKey,rows,extraDetails,kpis,note,validation,userId,expectedRevision}) {
    return db.transaction(async client=>{
      const locked=await client.query(`SELECT status,revision FROM report_manual_submissions WHERE id=$1 FOR UPDATE`,[base.submission_id]);
      if(!locked.rows[0])return null;if(!['draft','editing','returned'].includes(locked.rows[0].status))return {conflict:true,status:locked.rows[0].status};
      if(Number(expectedRevision??base.revision)!==Number(locked.rows[0].revision))return {stale:true,revision:Number(locked.rows[0].revision)};
      await insertRows(client,base.version_id,detailKey,rows);
      if(extraDetails)await insertRows(client,base.version_id,extraDetails.detailKey,extraDetails.rows);
      for(const kpi of kpis) await client.query(`UPDATE report_kpi_values SET target_value=$3,actual_value=$4,evaluation=$5,note=$6,updated_by=$7,updated_at=CURRENT_TIMESTAMP
        WHERE version_id=$1 AND kpi_definition_id=(SELECT id FROM report_kpi_definitions WHERE team_id=$2 AND code=$8)`,
        [base.version_id,base.team_id,kpi.target_value,kpi.actual_value,kpi.evaluation,kpi.note||null,userId,kpi.code]);
      await client.query(`INSERT INTO report_notes(version_id,team_id,highlights,issues,risks,proposals,next_month_plan,approval_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,'Đang cập nhật') ON CONFLICT(version_id,team_id) DO UPDATE SET highlights=EXCLUDED.highlights,issues=EXCLUDED.issues,risks=EXCLUDED.risks,proposals=EXCLUDED.proposals,next_month_plan=EXCLUDED.next_month_plan,updated_at=CURRENT_TIMESTAMP`,[base.version_id,base.team_id,note.highlights||null,note.issues||null,note.risks||null,note.proposals||null,note.next_month_plan||null]);
      await client.query(`UPDATE report_manual_submissions SET status='editing',validation_result=$2::jsonb,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[base.submission_id,JSON.stringify(validation)]);
      await client.query(`UPDATE report_periods SET status='in_progress',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status IN('open','draft','reopened')`,[base.period_id]);
      await client.query(`INSERT INTO report_entry_audit_logs(period_id,version_id,team_id,action,actor_id,change_summary) VALUES($1,$2,$3,'workspace_saved',$4,$5::jsonb)`,[base.period_id,base.version_id,base.team_id,userId,JSON.stringify({rows:rows.length,kpis:kpis.length,errors:validation.errors.length,warnings:validation.warnings.length})]);
      return {saved:true,validation};
    });
  },
  async transition({periodId,teamCode,action,note,userId}) {
    return db.transaction(async client=>{
      const found=await client.query(`SELECT s.*,t.code FROM report_manual_submissions s JOIN report_teams t ON t.id=s.team_id JOIN report_data_versions v ON v.id=s.version_id
        WHERE s.period_id=$1 AND t.code=$2 AND v.status='draft' FOR UPDATE OF s`,[periodId,teamCode]);const s=found.rows[0];if(!s)return null;
      const transitions={submit:{from:['editing','returned'],to:'submitted'},approve:{from:['submitted'],to:'approved'},return:{from:['submitted'],to:'returned'},recall:{from:['approved'],to:'returned'}};const rule=transitions[action];
      if(!rule||!rule.from.includes(s.status))return {conflict:true,status:s.status};
      if(action==='submit'&&(s.validation_result?.errors||[]).length)return {validation:s.validation_result};
      await client.query(`UPDATE report_manual_submissions SET status=$2,review_note=$3,submitted_by=CASE WHEN $4='submit' THEN $5 ELSE submitted_by END,submitted_at=CASE WHEN $4='submit' THEN CURRENT_TIMESTAMP ELSE submitted_at END,reviewed_by=CASE WHEN $4 IN('approve','return') THEN $5 ELSE reviewed_by END,reviewed_at=CASE WHEN $4 IN('approve','return') THEN CURRENT_TIMESTAMP ELSE reviewed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[s.id,rule.to,note||null,action,userId]);
      await client.query(`INSERT INTO report_entry_audit_logs(period_id,version_id,team_id,action,actor_id,change_summary) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[periodId,s.version_id,s.team_id,action,userId,JSON.stringify({note:note||null})]);return {status:rule.to};
    });
  },
  async publish(periodId,userId) {
    return db.transaction(async client=>{
      const period=await client.query('SELECT * FROM report_periods WHERE id=$1 FOR UPDATE',[periodId]);if(!period.rows[0])return null;
      const version=await client.query(`SELECT * FROM report_data_versions WHERE period_id=$1 AND source_type='manual_entry' AND status='draft' ORDER BY version_no DESC LIMIT 1 FOR UPDATE`,[periodId]);if(!version.rows[0])return {noDraft:true};
      const unassigned=await client.query(`SELECT COUNT(*)::int count FROM report_manual_submissions WHERE version_id=$1 AND assigned_user_id IS NULL`,[version.rows[0].id]);if(unassigned.rows[0].count)return {unassigned:unassigned.rows[0].count};
      const pending=await client.query(`SELECT COUNT(*)::int count FROM report_manual_submissions WHERE version_id=$1 AND status<>'approved'`,[version.rows[0].id]);if(pending.rows[0].count)return {pending:pending.rows[0].count};
      await client.query(`UPDATE report_data_versions SET status='superseded' WHERE period_id=$1 AND status='published'`,[periodId]);
      await client.query(`UPDATE report_data_versions SET status='published',published_by=$2,published_at=CURRENT_TIMESTAMP WHERE id=$1`,[version.rows[0].id,userId]);
      await client.query(`UPDATE report_periods SET current_version_id=$2,status='published',approved_by=$3,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[periodId,version.rows[0].id,userId]);
      await client.query(`INSERT INTO report_entry_audit_logs(period_id,version_id,action,actor_id) VALUES($1,$2,'published',$3)`,[periodId,version.rows[0].id,userId]);return {versionId:version.rows[0].id,versionNo:Number(version.rows[0].version_no)};
    });
  },
  async reopen(periodId,userId,reason) {
    return db.transaction(async client=>{
      const periodResult=await client.query('SELECT * FROM report_periods WHERE id=$1 FOR UPDATE',[periodId]);
      const period=periodResult.rows[0];if(!period)return null;
      if(period.status!=='published'||!period.current_version_id)return {conflict:true,status:period.status};
      const existing=await client.query(`SELECT id FROM report_data_versions WHERE period_id=$1 AND source_type='manual_entry' AND status='draft'`,[periodId]);
      if(existing.rows[0])return {draftExists:true,versionId:existing.rows[0].id};
      const next=await client.query('SELECT COALESCE(MAX(version_no),0)+1 no FROM report_data_versions WHERE period_id=$1',[periodId]);
      const version=await client.query(`INSERT INTO report_data_versions(period_id,version_no,source_type,status,created_by)
        VALUES($1,$2,'manual_entry','draft',$3) RETURNING *`,[periodId,next.rows[0].no,userId]);
      const versionId=version.rows[0].id,sourceVersionId=period.current_version_id;
      await client.query(`INSERT INTO report_kpi_values(version_id,kpi_definition_id,target_value,actual_value,previous_value,prior_year_value,evaluation,note,source_type,created_by,updated_by,
        kpi_code,kpi_name,unit_snapshot,evaluation_direction_snapshot,aggregation_method_snapshot,input_mode_snapshot,formula_code_snapshot,display_order_snapshot)
        SELECT $1,kpi_definition_id,target_value,actual_value,previous_value,prior_year_value,evaluation,note,'manual_entry',$3,$3,
        kpi_code,kpi_name,unit_snapshot,evaluation_direction_snapshot,aggregation_method_snapshot,input_mode_snapshot,formula_code_snapshot,display_order_snapshot
        FROM report_kpi_values WHERE version_id=$2`,[versionId,sourceVersionId,userId]);
      for(const [table,columns] of Object.values(DETAIL_CONFIG)) {
        await client.query(`INSERT INTO ${table}(version_id,${columns.join(',')}) SELECT $1,${columns.join(',')} FROM ${table} WHERE version_id=$2`,[versionId,sourceVersionId]);
      }
      await client.query(`INSERT INTO report_notes(version_id,team_id,executive_summary,highlights,issues,risks,proposals,next_month_plan,approval_status)
        SELECT $1,team_id,executive_summary,highlights,issues,risks,proposals,next_month_plan,'Đang cập nhật' FROM report_notes WHERE version_id=$2`,[versionId,sourceVersionId]);
      await client.query(`INSERT INTO report_manual_submissions(period_id,version_id,team_id,status,validation_result,assigned_user_id,assigned_by,assigned_at,submitted_by,submitted_at,reviewed_by,reviewed_at)
        SELECT $1,$2,t.id,'approved',COALESCE(old.validation_result,'{"errors":[],"warnings":[]}'::jsonb),old.assigned_user_id,$3,CASE WHEN old.assigned_user_id IS NOT NULL THEN CURRENT_TIMESTAMP END,old.submitted_by,old.submitted_at,old.reviewed_by,old.reviewed_at
        FROM report_teams t LEFT JOIN report_manual_submissions old ON old.version_id=$4 AND old.team_id=t.id WHERE t.is_active=TRUE`,[periodId,versionId,userId,sourceVersionId]);
      await client.query(`UPDATE report_periods SET status='reopened',approved_by=NULL,approved_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[periodId]);
      await client.query(`INSERT INTO report_entry_audit_logs(period_id,version_id,action,actor_id,change_summary) VALUES($1,$2,'reopened',$3,$4::jsonb)`,[periodId,versionId,userId,JSON.stringify({sourceVersionId,reason})]);
      return {periodId,versionId,versionNo:Number(version.rows[0].version_no)};
    });
  },
  async deletePeriod(periodId) {
    return db.transaction(async client=>{
      const found=await client.query('SELECT id,status FROM report_periods WHERE id=$1 FOR UPDATE',[periodId]);
      if(!found.rows[0])return null;
      if(['published','locked'].includes(found.rows[0].status))return {protected:true,status:found.rows[0].status};
      await client.query('UPDATE report_periods SET current_version_id=NULL WHERE id=$1',[periodId]);
      await client.query('DELETE FROM report_data_versions WHERE period_id=$1',[periodId]);
      await client.query('DELETE FROM report_imports WHERE period_id=$1',[periodId]);
      await client.query('DELETE FROM report_periods WHERE id=$1',[periodId]);
      return {deleted:true};
    });
  },
  async getMasterData() {
    const result=await db.query('SELECT category,code,label FROM report_lookup_values WHERE is_active=TRUE ORDER BY category,display_order');
    const masterData={};
    result.rows.forEach(row=>{if(!masterData[row.category])masterData[row.category]=[];masterData[row.category].push({code:row.code,label:row.label});});
    return masterData;
  },
  async listAssignees() {
    const result=await db.query(`SELECT u.id,u.name,u.email,u.role,
      string_agg(DISTINCT r.name, ', ' ORDER BY r.name) role_name
      FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
      WHERE u.is_active=TRUE AND (r.permissions ? 'reports.entry' OR r.permissions ? 'reports.review' OR r.permissions ? 'reports.manage')
      GROUP BY u.id ORDER BY u.name,u.email`);
    return result.rows;
  },
  async updateDeadline(periodId,deadline,actorId) {
    return db.transaction(async client=>{
      const current=await client.query('SELECT id,submission_deadline,status FROM report_periods WHERE id=$1 FOR UPDATE',[periodId]);if(!current.rows[0])return null;if(['published','locked'].includes(current.rows[0].status))return {protected:true,status:current.rows[0].status};
      const result=await client.query('UPDATE report_periods SET submission_deadline=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[periodId,deadline]);
      await client.query(`INSERT INTO report_entry_audit_logs(period_id,action,actor_id,change_summary) VALUES($1,'deadline_changed',$2,$3::jsonb)`,[periodId,actorId,JSON.stringify({from:current.rows[0].submission_deadline,to:deadline})]);
      return result.rows[0];
    });
  },
  async listAudit(periodId,{teamCode,limit}) {
    const values=[periodId];let teamFilter='';if(teamCode){values.push(teamCode);teamFilter=`AND (t.code=$${values.length} OR l.team_id IS NULL)`;}values.push(limit);
    const result=await db.query(`SELECT l.id,l.action,l.change_summary,l.created_at,t.code team_code,t.name team_name,u.id actor_id,u.name actor_name,u.email actor_email
      FROM report_entry_audit_logs l LEFT JOIN report_teams t ON t.id=l.team_id LEFT JOIN users u ON u.id=l.actor_id
      WHERE l.period_id=$1 ${teamFilter} ORDER BY l.created_at DESC LIMIT $${values.length}`,values);
    return result.rows;
  },
  async assignSubmission({periodId,teamCode,userId,actorId}) {
    return db.transaction(async client=>{
      if(userId){const eligible=await client.query(`SELECT u.id FROM users u
        WHERE u.id=$1 AND u.is_active=TRUE AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
          WHERE ur.user_id=u.id AND (r.permissions ? 'reports.entry' OR r.permissions ? 'reports.review' OR r.permissions ? 'reports.manage'))`,[userId]);if(!eligible.rows[0])return {invalidUser:true};}
      const current=await client.query(`SELECT s.id,s.status FROM report_manual_submissions s JOIN report_teams t ON t.id=s.team_id JOIN report_data_versions v ON v.id=s.version_id
        WHERE s.period_id=$1 AND t.code=$2 AND v.status='draft' FOR UPDATE OF s`,[periodId,teamCode]);
      if(!current.rows[0])return null;if(!['draft','editing','returned'].includes(current.rows[0].status))return {locked:true,status:current.rows[0].status};
      const result=await client.query(`UPDATE report_manual_submissions s SET assigned_user_id=$3,assigned_by=$4,assigned_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        FROM report_teams t,report_data_versions v WHERE s.team_id=t.id AND s.version_id=v.id AND s.period_id=$1 AND t.code=$2 AND v.status='draft'
        RETURNING s.id,s.assigned_user_id`,[periodId,teamCode,userId||null,actorId]);
      if(!result.rows[0])return null;
      await client.query(`INSERT INTO report_entry_audit_logs(period_id,version_id,team_id,action,actor_id,change_summary)
        SELECT s.period_id,s.version_id,s.team_id,'assignee_changed',$2,$3::jsonb FROM report_manual_submissions s WHERE s.id=$1`,[result.rows[0].id,actorId,JSON.stringify({assignedUserId:userId||null})]);
      return result.rows[0];
    });
  }
  ,async notificationContext(periodId,teamCode,userId=null) {
    const values=[periodId,teamCode];let userFilter='';if(userId){values.push(userId);userFilter=`AND u.id=$${values.length}`;}
    const result=await db.query(`SELECT p.year,p.month,p.submission_deadline,t.code team_code,t.name team_name,u.id user_id,u.name user_name,u.email
      FROM report_periods p JOIN report_data_versions v ON v.period_id=p.id AND v.status='draft' JOIN report_manual_submissions s ON s.version_id=v.id
      JOIN report_teams t ON t.id=s.team_id JOIN users u ON u.id=s.assigned_user_id WHERE p.id=$1 AND t.code=$2 ${userFilter} ORDER BY v.version_no DESC LIMIT 1`,values);
    return result.rows[0]||null;
  },
  async publishChecklist(periodId) {
    const result=await db.query(`SELECT t.code team_code,t.name team_name,s.status,s.assigned_user_id,
      COALESCE(jsonb_array_length(s.validation_result->'errors'),0)::int errors,
      COUNT(k.id) FILTER(WHERE k.target_value IS NULL OR k.actual_value IS NULL)::int incomplete_kpis,
      CASE WHEN n.id IS NULL OR NULLIF(TRIM(n.highlights),'') IS NULL OR NULLIF(TRIM(n.issues),'') IS NULL OR NULLIF(TRIM(n.risks),'') IS NULL OR NULLIF(TRIM(n.proposals),'') IS NULL THEN 1 ELSE 0 END notes_missing
      FROM report_periods p JOIN report_data_versions v ON v.period_id=p.id AND v.status='draft' JOIN report_manual_submissions s ON s.version_id=v.id
      JOIN report_teams t ON t.id=s.team_id LEFT JOIN report_kpi_values k ON k.version_id=v.id AND k.kpi_definition_id IN(SELECT id FROM report_kpi_definitions WHERE team_id=t.id)
      LEFT JOIN report_notes n ON n.version_id=v.id AND n.team_id=t.id WHERE p.id=$1 GROUP BY t.id,t.code,t.name,s.status,s.assigned_user_id,s.validation_result,n.id`,[periodId]);
    // Publishing is a workflow decision. Content completeness is returned for
    // visibility, but it no longer blocks an already approved submission.
    const teams=result.rows.map(row=>({...row,ready:Boolean(row.assigned_user_id&&row.status==='approved')}));
    return {ready:teams.length>0&&teams.every(item=>item.ready),teams};
  }
};
