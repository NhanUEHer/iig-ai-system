require('dotenv').config();
const db=require('../src/config/db');

const rows=[
  {code:'EV-MOCK-TOEIC-Q1',name:'Kỳ thi thử TOEIC Định kỳ Quý 1 - Format 2026',school:'IIG Việt Nam',status:'PUBLISHED',access:'LIVE',startHours:-2,endHours:4,candidates:24},
  {code:'EV-MOCK-NEU-2026',name:'Khảo sát Năng lực Tiếng Anh Đầu khóa - NEU 2026',school:'Đại học Kinh tế Quốc dân',status:'PUBLISHED',access:'READY',startHours:48,endHours:51,candidates:18},
  {code:'EV-MOCK-HUST-01',name:'Thi thử TOEIC 4 Kỹ năng - Đại học Bách Khoa',school:'Đại học Bách Khoa Hà Nội',status:'PUBLISHED',access:'READY',startHours:120,endHours:123,candidates:12},
  {code:'EV-MOCK-IIG-PLC',name:'TOEIC Placement Test 2026 - Standard Practice',school:'IIG Academy',status:'DRAFT',access:'PAUSED',startHours:240,endHours:242,candidates:0},
  {code:'EV-MOCK-COMPLETE',name:'Kỳ thi đánh giá năng lực tiếng Anh tháng 8/2026',school:'Trường Đại học Ngoại ngữ',status:'PUBLISHED',access:'READY',startHours:-720,endHours:-716,candidates:30},
];

async function main(){
  await db.transaction(async client=>{
    const exam=(await client.query("SELECT id,title FROM exams WHERE status='ACTIVE' ORDER BY updated_at DESC LIMIT 1")).rows[0];
    if(!exam)throw new Error('Chưa có đề thi ACTIVE để liên kết với kỳ thi mock.');
    for(const item of rows){
      const startAt=new Date(Date.now()+item.startHours*3600000);
      const endAt=new Date(Date.now()+item.endHours*3600000);
      await client.query(`INSERT INTO exam_event_schools(name) VALUES($1) ON CONFLICT(LOWER(BTRIM(name))) DO NOTHING`,[item.school]);
      const event=(await client.query(`INSERT INTO exam_events(event_code,name,description,school_name,start_at,end_at,exam_id,status,internal_note)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(UPPER(event_code)) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,school_name=EXCLUDED.school_name,start_at=EXCLUDED.start_at,end_at=EXCLUDED.end_at,exam_id=EXCLUDED.exam_id,status=EXCLUDED.status,internal_note=EXCLUDED.internal_note,updated_at=CURRENT_TIMESTAMP
        RETURNING id`,[item.code,item.name,'[EXAM_EVENT_MOCK_2026] Dữ liệu mẫu phục vụ kiểm thử màn quản lý kỳ thi.',item.school,startAt,endAt,exam.id,item.status,'Dữ liệu mock local, có thể chạy seed lại an toàn.'])).rows[0];
      await client.query("DELETE FROM exam_candidates WHERE exam_event_id=$1 AND email LIKE '%@exam-event-mock.local'",[event.id]);
      for(let index=1;index<=item.candidates;index++)await client.query('INSERT INTO exam_candidates(exam_event_id,full_name,email,school_name) VALUES($1,$2,$3,$4)',[event.id,`Thí sinh Mock ${String(index).padStart(2,'0')}`,`${item.code.toLowerCase()}-${index}@exam-event-mock.local`,item.school]);
    }
    console.log(JSON.stringify({ok:true,exam,events:rows.map(item=>({code:item.code,name:item.name,status:item.status,candidates:item.candidates}))},null,2));
  });
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
