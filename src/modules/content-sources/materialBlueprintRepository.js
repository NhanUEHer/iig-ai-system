const db=require('../../config/db');

const headerColumns=`blueprint.id,blueprint.title,blueprint.summary,blueprint.status,blueprint.instruction_language,
  blueprint.target_scores,blueprint.difficulty_mix,blueprint.settings_snapshot,blueprint.trend_snapshot,
  blueprint.rejection_note,blueprint.approved_by,blueprint.approved_at,blueprint.created_at,blueprint.updated_at`;

async function list(userId){
  const result=await db.query(`SELECT ${headerColumns},COUNT(item.id)::int AS item_count,
    COALESCE(SUM(item.quantity),0)::int AS asset_count
    FROM material_blueprints blueprint LEFT JOIN material_blueprint_items item ON item.blueprint_id=blueprint.id
    WHERE blueprint.created_by=$1 GROUP BY blueprint.id ORDER BY blueprint.created_at DESC`,[userId]);
  return result.rows;
}

async function detail(userId,id,queryable=db){
  const result=await queryable.query(`SELECT ${headerColumns} FROM material_blueprints blueprint WHERE blueprint.id=$1 AND blueprint.created_by=$2`,[id,userId]);
  if(!result.rows[0])return null;
  const items=await queryable.query('SELECT * FROM material_blueprint_items WHERE blueprint_id=$1 ORDER BY position',[id]);
  return {...result.rows[0],items:items.rows};
}

async function create(userId,data){return db.transaction(async client=>{
  const result=await client.query(`INSERT INTO material_blueprints
    (created_by,title,summary,status,instruction_language,target_scores,difficulty_mix,settings_snapshot,trend_snapshot)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) RETURNING id`,
  [userId,data.title,data.summary,data.status,data.instructionLanguage,JSON.stringify(data.targetScores),JSON.stringify(data.difficultyMix),JSON.stringify(data.settingsSnapshot),JSON.stringify(data.trendSnapshot)]);
  const id=result.rows[0].id;
  await replaceItems(client,id,data.items);
  return detail(userId,id,client);
});}

async function replaceItems(client,blueprintId,items){
  await client.query('DELETE FROM material_blueprint_items WHERE blueprint_id=$1',[blueprintId]);
  for(const [position,item] of items.entries())await client.query(`INSERT INTO material_blueprint_items
    (blueprint_id,position,material_type,skill,question_group,title,objective,rationale,quantity,difficulty_mix,source_trend_ids,generation_constraints)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)`,
  [blueprintId,position+1,item.materialType,item.skill||null,item.questionGroup||null,item.title,item.objective,item.rationale||null,item.quantity,JSON.stringify(item.difficultyMix),JSON.stringify(item.sourceTrendIds),JSON.stringify(item.generationConstraints)]);
}

async function update(userId,id,data){return db.transaction(async client=>{
  const locked=await client.query('SELECT status FROM material_blueprints WHERE id=$1 AND created_by=$2 FOR UPDATE',[id,userId]);
  if(!locked.rows[0])return null;if(locked.rows[0].status!=='DRAFT')return {locked:true};
  await client.query(`UPDATE material_blueprints SET title=$3,summary=$4,instruction_language=$5,target_scores=$6::jsonb,difficulty_mix=$7::jsonb,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND created_by=$2`,[id,userId,data.title,data.summary,data.instructionLanguage,JSON.stringify(data.targetScores),JSON.stringify(data.difficultyMix)]);
  await replaceItems(client,id,data.items);return detail(userId,id,client);
});}

async function setStatus(userId,id,status,note){
  const result=await db.query(`UPDATE material_blueprints SET status=$3,rejection_note=$4,
    approved_by=CASE WHEN $3='APPROVED' THEN $2::uuid ELSE NULL END,
    approved_at=CASE WHEN $3='APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1 AND created_by=$2 RETURNING id`,[id,userId,status,note||null]);
  return result.rows[0]?detail(userId,id):null;
}

module.exports={list,detail,create,update,setStatus};
