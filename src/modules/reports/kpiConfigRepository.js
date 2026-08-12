const db=require('../../config/db');

const FIELDS='d.id,d.code,d.name,d.unit,d.evaluation_direction,d.aggregation_method,d.input_mode,d.formula_code,d.display_order,d.is_active,d.created_at,d.updated_at';

async function audit(client,id,action,userId,before,after){
  await client.query(`INSERT INTO report_kpi_definition_audit_logs(kpi_definition_id,action,actor_id,before_data,after_data)
    VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,[id,action,userId,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);
}

module.exports={
  async list(teamCode){
    const result=await db.query(`SELECT ${FIELDS},t.code team_code,t.name team_name
      FROM report_kpi_definitions d JOIN report_teams t ON t.id=d.team_id
      WHERE ($1::text IS NULL OR t.code=$1) ORDER BY t.display_order,d.is_active DESC,d.display_order,d.created_at`,[teamCode||null]);
    return result.rows;
  },
  async create({teamCode,name,unit,evaluationDirection,inputMode,formulaCode,userId}){
    return db.transaction(async client=>{
      const teamResult=await client.query('SELECT * FROM report_teams WHERE code=$1 AND is_active=TRUE FOR UPDATE',[teamCode]);
      const team=teamResult.rows[0];if(!team)return null;
      const definitions=await client.query('SELECT code,display_order FROM report_kpi_definitions WHERE team_id=$1',[team.id]);
      const prefix={REV:'DT',ADS:'ADS',COM:'TT',TRADE:'TRADE',TRAIN:'DAO',PROD:'SP'}[teamCode]||teamCode;
      const max=definitions.rows.reduce((value,row)=>{const match=String(row.code).match(/(\d+)$/);return Math.max(value,match?Number(match[1]):0);},0);
      const code=`${prefix}_${String(max+1).padStart(2,'0')}`;const order=Math.max(0,...definitions.rows.map(row=>Number(row.display_order)||0))+1;
      const result=await client.query(`INSERT INTO report_kpi_definitions(team_id,code,name,unit,evaluation_direction,aggregation_method,display_order,input_mode,formula_code,is_active)
        VALUES($1,$2,$3,$4,$5,'non_aggregatable',$6,$7,$8,TRUE) RETURNING *`,[team.id,code,name,unit,evaluationDirection,order,inputMode,formulaCode]);
      await audit(client,result.rows[0].id,'created',userId,null,result.rows[0]);return result.rows[0];
    });
  },
  async update(id,{name,unit,evaluationDirection,inputMode,formulaCode,isActive,userId}){
    return db.transaction(async client=>{
      const beforeResult=await client.query('SELECT * FROM report_kpi_definitions WHERE id=$1 FOR UPDATE',[id]);const before=beforeResult.rows[0];if(!before)return null;
      const result=await client.query(`UPDATE report_kpi_definitions SET name=$2,unit=$3,evaluation_direction=$4,input_mode=$5,formula_code=$6,is_active=COALESCE($7,is_active),updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,[id,name,unit,evaluationDirection,inputMode,formulaCode,isActive]);
      const action=before.is_active!==result.rows[0].is_active?(result.rows[0].is_active?'activated':'deactivated'):'updated';
      await audit(client,id,action,userId,before,result.rows[0]);return result.rows[0];
    });
  },
  async reorder(teamCode,ids,userId){
    return db.transaction(async client=>{
      const team=await client.query('SELECT id FROM report_teams WHERE code=$1 FOR UPDATE',[teamCode]);if(!team.rows[0])return null;
      const owned=await client.query('SELECT id FROM report_kpi_definitions WHERE team_id=$1 AND is_active=TRUE',[team.rows[0].id]);
      const expected=new Set(owned.rows.map(row=>row.id));if(ids.length!==expected.size||ids.some(id=>!expected.has(id)))return {conflict:true};
      for(const [index,id] of ids.entries())await client.query('UPDATE report_kpi_definitions SET display_order=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[id,index+1]);
      for(const id of ids)await audit(client,id,'reordered',userId,null,{displayOrder:ids.indexOf(id)+1});return {updated:ids.length};
    });
  }
};
