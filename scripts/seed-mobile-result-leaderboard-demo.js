const db = require('../src/config/db');

const EVENT_ID = '0bf85593-9a7d-4861-b2dd-35126bb861e0';
const DEMO_ROWS = [
  { candidateId: 'a1000000-0000-4000-8000-000000000001', attemptId: 'b1000000-0000-4000-8000-000000000001', name: 'Khánh Linh', email: 'khanhlinh.demo@iig.local', score: 190, duration: 735 },
  { candidateId: 'a1000000-0000-4000-8000-000000000002', attemptId: 'b1000000-0000-4000-8000-000000000002', name: 'Hoàng Nam', email: 'hoangnam.demo@iig.local', score: 170, duration: 812 },
  { candidateId: 'a1000000-0000-4000-8000-000000000003', attemptId: 'b1000000-0000-4000-8000-000000000003', name: 'Minh Tuấn', email: 'minhtuan.demo@iig.local', score: 150, duration: 905 },
];

async function main() {
  const event = (await db.query('SELECT exam_id,school_name FROM exam_events WHERE id=$1', [EVENT_ID])).rows[0];
  if (!event) throw new Error('Không tìm thấy kỳ thi LR local.');
  await db.transaction(async client => {
    const base = new Date();
    for (const [index, row] of DEMO_ROWS.entries()) {
      const submittedAt = new Date(base.getTime() - (index + 1) * 60000);
      const startedAt = new Date(submittedAt.getTime() - row.duration * 1000);
      const expiresAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO exam_candidates(id,exam_event_id,full_name,email,phone,school_name)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name,email=EXCLUDED.email,school_name=EXCLUDED.school_name,updated_at=CURRENT_TIMESTAMP`,
        [row.candidateId, EVENT_ID, row.name, row.email, `09000000${index + 1}`, event.school_name],
      );
      await client.query(
        `INSERT INTO exam_attempts(id,exam_event_id,exam_id,candidate_id,status,started_at,expires_at,submitted_at,total_score,question_snapshot)
         VALUES($1,$2,$3,$4,'SUBMITTED',$5,$6,$7,$8,'{}'::jsonb)
         ON CONFLICT(id) DO UPDATE SET status='SUBMITTED',started_at=EXCLUDED.started_at,expires_at=EXCLUDED.expires_at,
           submitted_at=EXCLUDED.submitted_at,total_score=EXCLUDED.total_score,updated_at=CURRENT_TIMESTAMP`,
        [row.attemptId, EVENT_ID, event.exam_id, row.candidateId, startedAt, expiresAt, submittedAt, row.score],
      );
    }
  });
  console.log(`Đã tạo ${DEMO_ROWS.length} kết quả demo cho leaderboard kỳ thi LR.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
