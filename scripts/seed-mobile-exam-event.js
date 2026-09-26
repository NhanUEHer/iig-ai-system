require('dotenv').config();

const db = require('../src/config/db');

const EXAM_CODE = 'EX-MOCK-LRSW-2026';
const EVENT_CODE = 'EV-MOBILE-LRSW-2026';
const SCHOOL_NAME = 'IIG Việt Nam';

async function main() {
  const result = await db.transaction(async client => {
    const exam = (await client.query(
      `SELECT id, exam_code, title, status
       FROM exams
       WHERE UPPER(exam_code) = UPPER($1)
       LIMIT 1`,
      [EXAM_CODE],
    )).rows[0];

    if (!exam) throw new Error(`Không tìm thấy đề thi ${EXAM_CODE}. Hãy chạy seed đề thi trước.`);
    if (exam.status !== 'ACTIVE') throw new Error(`Đề thi ${EXAM_CODE} phải ở trạng thái ACTIVE trước khi tạo kỳ thi.`);

    await client.query(
      `INSERT INTO exam_event_schools(name)
       VALUES($1)
       ON CONFLICT(LOWER(BTRIM(name))) DO NOTHING`,
      [SCHOOL_NAME],
    );

    const startAt = new Date(Date.now() - 60 * 60 * 1000);
    const endAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const description = [
      '<p>Bài kiểm tra tiếng Anh nhanh dành cho người tham gia workshop tại trường.</p>',
      '<p>Bài gồm 4 kỹ năng Listening, Reading, Speaking và Writing; kết quả được sử dụng để tư vấn lộ trình học phù hợp.</p>',
    ].join('');

    const event = (await client.query(
      `INSERT INTO exam_events(
         event_code, name, description, school_name, start_at, end_at,
         exam_id, status, internal_note
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,'PUBLISHED',$8)
       ON CONFLICT(UPPER(event_code)) DO UPDATE SET
         name=EXCLUDED.name,
         description=EXCLUDED.description,
         school_name=EXCLUDED.school_name,
         start_at=EXCLUDED.start_at,
         end_at=EXCLUDED.end_at,
         exam_id=EXCLUDED.exam_id,
         status=EXCLUDED.status,
         internal_note=EXCLUDED.internal_note,
         updated_at=CURRENT_TIMESTAMP
       RETURNING id, event_code, name, school_name, start_at, end_at, status, exam_id`,
      [
        EVENT_CODE,
        'Workshop đánh giá năng lực tiếng Anh IIG Việt Nam',
        description,
        SCHOOL_NAME,
        startAt,
        endAt,
        exam.id,
        '[MOBILE_WEB_MOCK] Kỳ thi local phục vụ phát triển luồng thi trên mobile web.',
      ],
    )).rows[0];

    return { exam, event, accessPath: `/events/${event.id}` };
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
