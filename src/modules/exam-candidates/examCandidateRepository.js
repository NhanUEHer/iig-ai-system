const db=require('../../config/db');

const attemptStatusSql=`CASE WHEN a.id IS NULL THEN 'REGISTERED' ELSE a.status END`;

function filtersSql(filters,params){
  const where=[];
  if(filters.search){params.push(`%${String(filters.search).trim()}%`);const n=params.length;where.push(`(ec.full_name ILIKE $${n} OR ec.candidate_number ILIKE $${n} OR COALESCE(ec.email,'') ILIKE $${n} OR COALESCE(ec.phone,'') ILIKE $${n})`);}
  const arrays=[['eventIds','ec.exam_event_id','uuid[]'],['toeicExperiences','ec.toeic_experience','text[]'],['attemptStatuses',attemptStatusSql,'text[]'],['schools','ec.school_name','text[]']];
  for(const [key,column,type] of arrays){const values=String(filters[key]||'').split(',').map(value=>value.trim()).filter(Boolean);if(values.length){params.push(values);where.push(`${column}=ANY($${params.length}::${type})`);}}
  return where.length?`WHERE ${where.join(' AND ')}`:'';
}

const joins=`FROM exam_candidates ec
JOIN exam_events ee ON ee.id=ec.exam_event_id
JOIN exams e ON e.id=ee.exam_id
LEFT JOIN LATERAL (
  SELECT ea.id,ea.status,ea.started_at,ea.submitted_at,ea.total_score,ea.updated_at
  FROM exam_attempts ea
  WHERE ea.candidate_id=ec.id AND ea.exam_event_id=ec.exam_event_id
  ORDER BY ea.created_at DESC LIMIT 1
) a ON TRUE`;

function map(row){return {id:row.id,candidateNumber:row.candidate_number,fullName:row.full_name,email:row.email||'',phone:row.phone||'',schoolName:row.school_name||'',birthYear:row.birth_year==null?null:Number(row.birth_year),toeicExperience:row.toeic_experience||null,registeredAt:row.registered_at,event:{id:row.event_id,eventCode:row.event_code,name:row.event_name},exam:{id:row.exam_id,title:row.exam_title},attempt:{id:row.attempt_id||null,status:row.attempt_status,startedAt:row.started_at||null,submittedAt:row.submitted_at||null,totalScore:row.total_score==null?null:Number(row.total_score)}};}

async function list(filters={}){const page=Math.max(Number(filters.page)||1,1);const limit=Math.min(Math.max(Number(filters.limit)||10,1),filters.__export?10000:100);const params=[];const where=filtersSql(filters,params);const count=await db.query(`SELECT COUNT(*)::int total ${joins} ${where}`,params);params.push(limit,(page-1)*limit);const result=await db.query(`SELECT ec.id,ec.candidate_number,ec.full_name,ec.email,ec.phone,ec.school_name,ec.birth_year,ec.toeic_experience,ec.created_at registered_at,ee.id event_id,ee.event_code,ee.name event_name,e.id exam_id,e.title exam_title,a.id attempt_id,${attemptStatusSql} attempt_status,a.started_at,a.submitted_at,a.total_score ${joins} ${where} ORDER BY ec.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);const total=count.rows[0]?.total||0;return {data:result.rows.map(map),meta:{page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit))}};}

async function filterOptions(){const [events,schools]=await Promise.all([db.query(`SELECT DISTINCT ee.id,ee.event_code,ee.name FROM exam_events ee JOIN exam_candidates ec ON ec.exam_event_id=ee.id ORDER BY ee.name`),db.query(`SELECT DISTINCT school_name name FROM exam_candidates WHERE school_name IS NOT NULL AND BTRIM(school_name)<>'' ORDER BY school_name`)]);return {events:events.rows.map(row=>({value:row.id,label:row.name,code:row.event_code})),schools:schools.rows.map(row=>({value:row.name,label:row.name}))};}

module.exports={list,filterOptions};
