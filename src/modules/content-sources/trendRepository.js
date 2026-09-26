const db=require('../../config/db');

async function approvedAnalyses(userId,sourceIds=null){
  const params=[userId];let sourceFilter='';
  if(sourceIds){params.push(sourceIds);sourceFilter=' AND source.id=ANY($2::uuid[])';}
  const result=await db.query(`SELECT analysis.id,analysis.source_id,analysis.analysis
    FROM content_source_analyses analysis JOIN content_sources source ON source.id=analysis.source_id
    WHERE source.created_by=$1 AND analysis.review_label='APPROVED' AND analysis.status='completed'${sourceFilter}`,params);
  return result.rows;
}

async function replaceForUser(userId,trends){return db.transaction(async client=>{
  const owned=await client.query('SELECT id FROM content_trends WHERE created_by=$1',[userId]);
  if(owned.rows.length){const ids=owned.rows.map(row=>row.id);await client.query('DELETE FROM content_trend_members WHERE trend_id=ANY($1::uuid[])',[ids]);await client.query('UPDATE content_trends SET is_active=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=ANY($1::uuid[])',[ids]);}
  for(const trend of trends){
    const saved=await client.query(`INSERT INTO content_trends(cluster_key,created_by,skill,question_group,task_type,topic,trend_type,verification_status,source_count,average_similarity,confidence,first_seen_at,last_seen_at,is_active,is_selected,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,$14,CURRENT_TIMESTAMP)
      ON CONFLICT(created_by,cluster_key) DO UPDATE SET skill=EXCLUDED.skill,question_group=EXCLUDED.question_group,task_type=EXCLUDED.task_type,topic=EXCLUDED.topic,trend_type=EXCLUDED.trend_type,verification_status=EXCLUDED.verification_status,source_count=EXCLUDED.source_count,average_similarity=EXCLUDED.average_similarity,confidence=EXCLUDED.confidence,first_seen_at=EXCLUDED.first_seen_at,last_seen_at=EXCLUDED.last_seen_at,is_active=TRUE,is_selected=EXCLUDED.is_selected,updated_at=CURRENT_TIMESTAMP RETURNING id`,[trend.clusterKey,userId,trend.skill,trend.questionGroup,trend.taskType,trend.topic,trend.trendType,trend.verificationStatus,trend.sourceCount,trend.averageSimilarity,trend.confidence,trend.firstSeenAt,trend.lastSeenAt,trend.verificationStatus==='CONFIRMED']);
    const trendId=saved.rows[0].id;
    for(const member of trend.members)await client.query(`INSERT INTO content_trend_members(trend_id,source_id,analysis_id,item_hash,recalled_item,evidence,exam_date) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[trendId,member.sourceId,member.analysisId,member.itemHash,JSON.stringify(member),member.evidence,member.examDate]);
  }
});}

async function list(userId,{status='all'}={}){
  const params=[userId];let filter='';if(status!=='all'){params.push(status);filter=' AND trend.verification_status=$2';}
  const result=await db.query(`SELECT trend.*,COUNT(DISTINCT member.source_id)::int AS member_count,
    jsonb_agg(jsonb_build_object('sourceId',member.source_id,'analysisId',member.analysis_id,'item',member.recalled_item,'evidence',member.evidence,'examDate',member.exam_date) ORDER BY member.created_at) AS members
    FROM content_trends trend JOIN content_trend_members member ON member.trend_id=trend.id
    WHERE trend.created_by=$1 AND trend.is_active=TRUE${filter} GROUP BY trend.id
    ORDER BY trend.verification_status='CONFIRMED' DESC,trend.source_count DESC,trend.confidence DESC`,params);
  return {data:result.rows.map(row=>({id:row.id,skill:row.skill,questionGroup:row.question_group,taskType:row.task_type,topic:row.topic,trendType:row.trend_type,verificationStatus:row.verification_status,isSelected:row.is_selected,sourceCount:row.source_count,averageSimilarity:Number(row.average_similarity),confidence:Number(row.confidence),firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at,members:row.members||[]})),meta:{total:result.rows.length,confirmed:result.rows.filter(row=>row.verification_status==='CONFIRMED').length,selected:result.rows.filter(row=>row.is_selected).length}};
}
async function saveSelection(userId,trendIds){return db.transaction(async client=>{
  const eligible=await client.query(`SELECT id FROM content_trends WHERE created_by=$1 AND is_active=TRUE AND verification_status='CONFIRMED' AND id=ANY($2::uuid[])`,[userId,trendIds]);
  if(eligible.rows.length!==trendIds.length)return null;
  await client.query('UPDATE content_trends SET is_selected=FALSE,updated_at=CURRENT_TIMESTAMP WHERE created_by=$1 AND is_active=TRUE',[userId]);
  if(trendIds.length)await client.query('UPDATE content_trends SET is_selected=TRUE,updated_at=CURRENT_TIMESTAMP WHERE created_by=$1 AND id=ANY($2::uuid[])',[userId,trendIds]);
  return trendIds;
});}
module.exports={approvedAnalyses,replaceForUser,list,saveSelection};
