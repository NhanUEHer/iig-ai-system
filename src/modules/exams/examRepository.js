const crypto = require('crypto');
const db = require('../../config/db');

const mapExam = row => row && ({
  id: row.id, examCode: row.exam_code, title: row.title, status: row.status,
  description: row.description || '', introduction: row.introduction || '', scoreScale: Number(row.score_scale || 100),
  durationSeconds: Number(row.duration_minutes || 0) * 60 + Number(row.duration_seconds || 0),
  pointsPerSubQuestion: Number(row.points_per_question || 10), lockVersion: Number(row.lock_version || 1),
  activeVersionId: row.active_version_id || null, partCount: Number(row.part_count || 0),
  parentQuestionCount: Number(row.parent_question_count || 0), subQuestionCount: Number(row.sub_question_count || 0),
  totalPoints: Number(row.total_points || 0), eventName: row.event_name || null, createdAt: row.created_at, updatedAt: row.updated_at
});

const statsJoin = `
  LEFT JOIN exam_parts ep ON ep.exam_id=e.id
  LEFT JOIN exam_part_questions epq ON epq.part_id=ep.id
  LEFT JOIN question_bank_sub_questions sq ON sq.question_id=epq.question_id`;
const statsSelect = `COUNT(DISTINCT ep.id)::int part_count,
  COUNT(DISTINCT epq.question_id)::int parent_question_count,
  COUNT(sq.id)::int sub_question_count,
  (COUNT(sq.id) * e.points_per_question)::numeric total_points`;

async function list({ page=1, limit=10, search='', status='', statuses='' }={}) {
  const params=[]; const where=[];
  const normalizedSearch=String(search||'').trim();
  if(normalizedSearch){params.push(`%${normalizedSearch}%`);where.push(`(e.title ILIKE $${params.length} OR e.exam_code ILIKE $${params.length})`);}
  const selectedStatuses=String(statuses||status||'').split(',').map(value=>value.trim()).filter(value=>['DRAFT','ACTIVE','INACTIVE'].includes(value));
  if(selectedStatuses.length){params.push(selectedStatuses);where.push(`e.status=ANY($${params.length}::varchar[])`);}
  const filter=where.length?`WHERE ${where.join(' AND ')}`:'';
  const count=await db.query(`SELECT COUNT(*)::int total FROM exams e ${filter}`,params);
  const safeLimit=Math.min(Math.max(Number(limit)||10,1),100); const safePage=Math.max(Number(page)||1,1);
  params.push(safeLimit,(safePage-1)*safeLimit);
  const result=await db.query(`SELECT e.*,${statsSelect} FROM exams e ${statsJoin} ${filter}
    GROUP BY e.id ORDER BY e.updated_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);
  const total=count.rows[0].total;
  return {data:result.rows.map(mapExam),meta:{page:safePage,limit:safeLimit,total,totalPages:Math.max(1,Math.ceil(total/safeLimit))}};
}

async function findById(id, client=db) {
  const examResult=await client.query(`SELECT e.*,${statsSelect}
    FROM exams e ${statsJoin} WHERE e.id=$1 GROUP BY e.id`,[id]);
  const exam=mapExam(examResult.rows[0]); if(!exam)return null;
  const eventResult=await client.query(`SELECT name FROM exam_events
    WHERE exam_id=$1 ORDER BY updated_at DESC LIMIT 1`,[id]);
  exam.eventName=eventResult.rows[0]?.name||null;
  const parts=await client.query(`SELECT ep.*,
    COUNT(DISTINCT epq.question_id)::int parent_question_count,COUNT(sq.id)::int sub_question_count
    FROM exam_parts ep LEFT JOIN exam_part_questions epq ON epq.part_id=ep.id
    LEFT JOIN question_bank_sub_questions sq ON sq.question_id=epq.question_id
    WHERE ep.exam_id=$1 GROUP BY ep.id ORDER BY ep.display_order,ep.part_number`,[id]);
  for(const part of parts.rows){
    const questions=await client.query(`SELECT q.id,q.question_name,q.question_type,q.status,g.title group_name,
      epq.display_order,COUNT(sq.id)::int sub_question_count
      FROM exam_part_questions epq JOIN question_bank_questions q ON q.id=epq.question_id
      JOIN question_groups g ON g.id=q.group_id LEFT JOIN question_bank_sub_questions sq ON sq.question_id=q.id
      WHERE epq.part_id=$1 GROUP BY q.id,g.title,epq.display_order ORDER BY epq.display_order`,[part.id]);
    part.questions=questions.rows.map(q=>({id:q.id,questionName:q.question_name,questionType:q.question_type,status:q.status,groupName:q.group_name,displayOrder:q.display_order,subQuestionCount:q.sub_question_count}));
  }
  exam.parts=parts.rows.map(p=>({id:p.id,title:p.title||`Phần ${p.part_number}`,durationMinutes:Number(p.duration_minutes||0),partLabel:p.part_label||'',instruction:p.instruction||'',displayOrder:p.display_order,parentQuestionCount:p.parent_question_count,subQuestionCount:p.sub_question_count,questions:p.questions}));
  return exam;
}

async function create(data,userId){const total=Number(data.durationSeconds);const id=crypto.randomUUID();const examCode=String(data.examCode||'').trim().toUpperCase()||`EX-${id.replaceAll('-','').slice(0,8).toUpperCase()}`;const r=await db.query(`INSERT INTO exams(id,exam_code,title,status,duration_minutes,duration_seconds,points_per_question,score_scale,description,introduction,created_by,updated_by)
  VALUES($1,$2,$3,$4,$5,$6,10,$7,$8,$9,$10,$10) RETURNING id`,[id,examCode,data.title.trim(),data.status||'DRAFT',Math.floor(total/60),total%60,Number(data.scoreScale||100),String(data.description||'').trim(),String(data.introduction||''),userId||null]);return findById(r.rows[0].id);}
async function update(id,data,userId){const fields=[];const values=[id];if(data.title!==undefined){values.push(data.title.trim());fields.push(`title=$${values.length}`);}if(data.examCode!==undefined){values.push(data.examCode.trim().toUpperCase());fields.push(`exam_code=$${values.length}`);}if(data.status!==undefined){values.push(data.status);fields.push(`status=$${values.length}`);}if(data.scoreScale!==undefined){values.push(Number(data.scoreScale));fields.push(`score_scale=$${values.length}`);}if(data.description!==undefined){values.push(String(data.description||'').trim());fields.push(`description=$${values.length}`);}if(data.introduction!==undefined){values.push(String(data.introduction||''));fields.push(`introduction=$${values.length}`);}if(data.durationSeconds!==undefined){const total=Number(data.durationSeconds);values.push(Math.floor(total/60));fields.push(`duration_minutes=$${values.length}`);values.push(total%60);fields.push(`duration_seconds=$${values.length}`);}values.push(userId||null);fields.push(`updated_by=$${values.length}`,`updated_at=CURRENT_TIMESTAMP`,`lock_version=lock_version+1`);await db.query(`UPDATE exams SET ${fields.join(',')} WHERE id=$1`,values);return findById(id);}
async function remove(id){return db.query('DELETE FROM exams WHERE id=$1 RETURNING id',[id]);}

async function findInProgressEvent(examId){const result=await db.query(`SELECT id,name FROM exam_events
  WHERE exam_id=$1 AND status='PUBLISHED' AND start_at<=CURRENT_TIMESTAMP AND end_at>CURRENT_TIMESTAMP
  ORDER BY start_at LIMIT 1`,[examId]);return result.rows[0]||null;}

async function duplicate(id,userId){return db.transaction(async client=>{
  const source=await client.query('SELECT * FROM exams WHERE id=$1',[id]);
  if(!source.rows[0])return null;
  const newId=crypto.randomUUID();const examCode=`EX-${newId.replaceAll('-','').slice(0,8).toUpperCase()}`;const exam=source.rows[0];
  await client.query(`INSERT INTO exams(id,exam_code,title,status,duration_minutes,duration_seconds,points_per_question,score_scale,description,introduction,created_by,updated_by)
    VALUES($1,$2,$3,'DRAFT',$4,$5,$6,$7,$8,$9,$10,$10)`,[newId,examCode,`${exam.title.slice(0,229)} - Bản sao`,exam.duration_minutes,exam.duration_seconds,exam.points_per_question,exam.score_scale,exam.description,exam.introduction,userId||null]);
  const parts=await client.query('SELECT * FROM exam_parts WHERE exam_id=$1 ORDER BY display_order,part_number',[id]);
  for(const part of parts.rows){const inserted=await client.query(`INSERT INTO exam_parts(exam_id,part_number,title,duration_minutes,part_label,instruction,display_order)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[newId,part.part_number,part.title,part.duration_minutes,part.part_label,part.instruction,part.display_order]);
    await client.query(`INSERT INTO exam_part_questions(exam_id,part_id,question_id,display_order,points)
      SELECT $1,$2,question_id,display_order,points FROM exam_part_questions WHERE part_id=$3`,[newId,inserted.rows[0].id,part.id]);
  }
  return findById(newId,client);
});}

async function listAvailableQuestions(examId,{page=1,limit=10,search='',groupId='',questionType='',status='ACTIVE'}={}){
  const params=[examId];const where=[`NOT EXISTS(SELECT 1 FROM exam_part_questions used WHERE used.exam_id=$1 AND used.question_id=q.id)`,`EXISTS(SELECT 1 FROM question_bank_sub_questions ready WHERE ready.question_id=q.id)`];
  if(search){params.push(`%${String(search).trim()}%`);where.push(`(q.question_name ILIKE $${params.length} OR COALESCE(q.note,'') ILIKE $${params.length} OR q.id::text ILIKE $${params.length})`);}if(groupId){params.push(groupId);where.push(`q.group_id=$${params.length}`);}if(questionType){params.push(questionType);where.push(`q.question_type=$${params.length}`);}if(status){params.push(status);where.push(`q.status=$${params.length}`);}
  const filter=`WHERE ${where.join(' AND ')}`;const count=await db.query(`SELECT COUNT(*)::int total FROM question_bank_questions q ${filter}`,params);const safeLimit=Math.min(Math.max(Number(limit)||10,1),100);const safePage=Math.max(Number(page)||1,1);params.push(safeLimit,(safePage-1)*safeLimit);
  const rows=await db.query(`SELECT q.id,q.question_name,q.question_type,q.status,g.title group_name,COUNT(sq.id)::int sub_question_count
    FROM question_bank_questions q JOIN question_groups g ON g.id=q.group_id LEFT JOIN question_bank_sub_questions sq ON sq.question_id=q.id ${filter}
    GROUP BY q.id,g.title ORDER BY q.updated_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);
  const total=count.rows[0].total;return {data:rows.rows.map(r=>({id:r.id,questionName:r.question_name,questionType:r.question_type,status:r.status,groupName:r.group_name,subQuestionCount:r.sub_question_count})),meta:{page:safePage,limit:safeLimit,total,totalPages:Math.max(1,Math.ceil(total/safeLimit))}};
}

module.exports={mapExam,list,findById,create,update,remove,duplicate,listAvailableQuestions,findInProgressEvent};
