const db=require('../../config/db');

async function ownedItem(userId,blueprintId,itemId){
  const result=await db.query(`SELECT item.*,blueprint.title AS blueprint_title,blueprint.summary AS blueprint_summary,
    blueprint.status AS blueprint_status,blueprint.instruction_language,blueprint.target_scores,
    blueprint.difficulty_mix AS blueprint_difficulty_mix,blueprint.trend_snapshot
    FROM material_blueprint_items item JOIN material_blueprints blueprint ON blueprint.id=item.blueprint_id
    WHERE blueprint.id=$1 AND item.id=$2 AND blueprint.created_by=$3`,[blueprintId,itemId,userId]);return result.rows[0]||null;
}
async function create(userId,data){return db.transaction(async client=>{
  await client.query('SELECT id FROM material_blueprint_items WHERE id=$1 FOR UPDATE',[data.itemId]);
  const next=await client.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM generated_learning_materials WHERE blueprint_item_id=$1',[data.itemId]);
  const result=await client.query(`INSERT INTO generated_learning_materials
    (blueprint_id,blueprint_item_id,version,title,content,model,prompt_version,template_code,usage_metadata,validation_metadata,pipeline_metadata,created_by)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12) RETURNING *`,[data.blueprintId,data.itemId,next.rows[0].version,data.title,JSON.stringify(data.content),data.model,data.promptVersion,data.templateCode,JSON.stringify(data.usage),JSON.stringify(data.validation),JSON.stringify(data.pipeline),userId]);return result.rows[0];
});}
async function list(userId,blueprintId,itemId){const result=await db.query(`SELECT material.* FROM generated_learning_materials material JOIN material_blueprints blueprint ON blueprint.id=material.blueprint_id WHERE material.blueprint_id=$1 AND material.blueprint_item_id=$2 AND blueprint.created_by=$3 ORDER BY material.version DESC`,[blueprintId,itemId,userId]);return result.rows;}
async function detail(userId,id){const result=await db.query(`SELECT material.* FROM generated_learning_materials material JOIN material_blueprints blueprint ON blueprint.id=material.blueprint_id WHERE material.id=$1 AND blueprint.created_by=$2`,[id,userId]);return result.rows[0]||null;}
async function update(userId,id,title,content){const result=await db.query(`UPDATE generated_learning_materials material SET title=$3,content=$4::jsonb,updated_at=CURRENT_TIMESTAMP FROM material_blueprints blueprint WHERE material.id=$1 AND material.blueprint_id=blueprint.id AND blueprint.created_by=$2 AND material.status='NEEDS_REVIEW' RETURNING material.*`,[id,userId,title,JSON.stringify(content)]);return result.rows[0]||null;}
async function review(userId,id,status,note){const result=await db.query(`UPDATE generated_learning_materials material SET status=$3,review_note=$4,reviewed_by=$2,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP FROM material_blueprints blueprint WHERE material.id=$1 AND material.blueprint_id=blueprint.id AND blueprint.created_by=$2 RETURNING material.*`,[id,userId,status,note||null]);return result.rows[0]||null;}
module.exports={ownedItem,create,list,detail,update,review};
