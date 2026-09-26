require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const storage = require('../src/services/storageService');

const EVENT_ID = 'b6656e3d-2d18-4432-bc10-f5640c35a33e';
const PARENT_ID = '5b121bc0-c49f-4f19-9a0a-d7f4cd9e7d41';
const CONTENT_ID = 'b5100a7c-f5f5-4b7c-8b39-cdea30b1bb5d';
const FIXTURE_NOTES = ['MOBILE_RICH_GROUP_Q2', 'MOBILE_RICH_GROUP_Q3'];

const contentHtml = [
  '<article>',
  '<h3>WORKSHOP ENGLISH SKILLS DAY</h3>',
  '<p>The workshop begins at 9:00 AM in the main auditorium. Participants should arrive fifteen minutes early and bring their student ID.</p>',
  '<ul><li><strong>Check-in:</strong> 8:45 AM</li><li><strong>Venue:</strong> Main auditorium</li><li><strong>Required:</strong> Student ID</li></ul>',
  '</article>',
].join('');

const subFixtures = [
  {
    note: FIXTURE_NOTES[0],
    prompt: '<p>Where will the workshop take place?</p>',
    correct: 'C',
    options: [['A', 'In the library'], ['B', 'In Room 201'], ['C', 'In the main auditorium'], ['D', 'In the cafeteria']],
  },
  {
    note: FIXTURE_NOTES[1],
    prompt: '<p>What should participants bring?</p>',
    correct: 'B',
    options: [['A', 'A laptop'], ['B', 'Their student ID'], ['C', 'A printed résumé'], ['D', 'A course book']],
  },
];

async function upsertSubQuestion(client, fixture, displayOrder) {
  let row = (await client.query(
    'SELECT id FROM question_bank_sub_questions WHERE question_id=$1 AND note=$2 LIMIT 1',
    [PARENT_ID, fixture.note],
  )).rows[0];
  if (!row) {
    row = (await client.query(
      `INSERT INTO question_bank_sub_questions(question_id,content_id,prompt_html,note,instruction_html,display_order)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [PARENT_ID, CONTENT_ID, fixture.prompt, fixture.note, '<p>Nghe và xem nội dung chung, sau đó chọn đáp án đúng nhất.</p>', displayOrder],
    )).rows[0];
  } else {
    await client.query(
      `UPDATE question_bank_sub_questions
       SET content_id=$2,prompt_html=$3,instruction_html=$4,display_order=$5,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [row.id, CONTENT_ID, fixture.prompt, '<p>Nghe và xem nội dung chung, sau đó chọn đáp án đúng nhất.</p>', displayOrder],
    );
  }
  await client.query('DELETE FROM question_bank_sub_question_options WHERE sub_question_id=$1', [row.id]);
  for (const [index, [key, text]] of fixture.options.entries()) {
    await client.query(
      `INSERT INTO question_bank_sub_question_options(sub_question_id,option_key,option_text,is_correct,display_order)
       VALUES($1,$2,$3,$4,$5)`,
      [row.id, key, text, key === fixture.correct, index],
    );
  }
  return row.id;
}

async function copySharedMedia(client, mediaType) {
  const exists = await client.query(
    'SELECT 1 FROM question_bank_media WHERE content_id=$1 AND media_type=$2 LIMIT 1',
    [CONTENT_ID, mediaType],
  );
  if (exists.rows[0]) return;
  const fixture = mediaType === 'IMAGE'
    ? { file: path.join(__dirname, '../mobile-web/public/workshop-hero-v2.png'), mime: 'image/png', extension: 'png' }
    : { file: path.join(__dirname, '../public/question-bank-media/question-bank/53113b50-5473-4592-8bf3-d2d2ce087b04/content/172db624-9890-4963-a99b-f1bcec80d831/034e54ac-02c1-4aec-8bac-ed57280acc00-ta__o_fvideo_luo__n___i.mp4'), mime: 'video/mp4', extension: 'mp4' };
  if (!fs.existsSync(fixture.file)) throw new Error(`Không tìm thấy fixture ${mediaType}: ${fixture.file}`);
  const buffer = fs.readFileSync(fixture.file);
  const storageKey = await storage.uploadBuffer(
    buffer,
    `mobile-rich-question/${CONTENT_ID}/${mediaType.toLowerCase()}.${fixture.extension}`,
    fixture.mime,
    { preferLocal: true },
  );
  await client.query(
    `INSERT INTO question_bank_media(question_id,content_id,media_type,storage_key,mime_type,original_name,file_size)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [PARENT_ID, CONTENT_ID, mediaType, storageKey, fixture.mime, `mobile-rich-${mediaType.toLowerCase()}.${fixture.extension}`, buffer.length],
  );
}

async function main() {
  const result = await db.transaction(async client => {
    const event = (await client.query('SELECT id,exam_id FROM exam_events WHERE id=$1', [EVENT_ID])).rows[0];
    if (!event) throw new Error('Không tìm thấy kỳ thi mobile local.');

    await client.query(
      `UPDATE question_bank_contents
       SET title=$2,content_html=$3,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [CONTENT_ID, 'Workshop schedule and participation guide', contentHtml],
    );

    const newIds = [];
    for (const [index, fixture] of subFixtures.entries()) {
      newIds.push(await upsertSubQuestion(client, fixture, index + 1));
    }
    await copySharedMedia(client, 'IMAGE');
    await copySharedMedia(client, 'VIDEO');

    const latest = (await client.query(
      'SELECT * FROM exam_versions WHERE exam_id=$1 ORDER BY version_number DESC LIMIT 1',
      [event.exam_id],
    )).rows[0];
    if (!latest) throw new Error('Đề thi chưa có phiên bản đã kích hoạt.');

    const snapshot = structuredClone(latest.snapshot);
    const parent = snapshot.parts.flatMap(part => part.questions || []).find(question => question.id === PARENT_ID);
    if (!parent) throw new Error('Không tìm thấy câu hỏi Listening đầu tiên trong snapshot.');
    parent.contents[0].title = 'Workshop schedule and participation guide';
    parent.contents[0].content_html = contentHtml;

    const dbSubs = (await client.query(
      `SELECT id,content_id,prompt_html,hint,explanation,note,instruction_html,sentence_starters_html,
              preparation_duration_seconds,recording_duration_seconds,max_character_count,min_word_count,max_word_count,display_order
       FROM question_bank_sub_questions WHERE question_id=$1 ORDER BY display_order`,
      [PARENT_ID],
    )).rows;
    for (const sub of dbSubs) {
      sub.options = (await client.query(
        `SELECT id,option_key,option_text,is_correct,display_order
         FROM question_bank_sub_question_options WHERE sub_question_id=$1 ORDER BY display_order`,
        [sub.id],
      )).rows;
    }
    parent.subQuestions = dbSubs;

    const parentCount = snapshot.parts.reduce((sum, part) => sum + (part.questions || []).length, 0);
    const subCount = snapshot.parts.reduce((sum, part) => sum + (part.questions || []).reduce((partSum, question) => partSum + (question.subQuestions || []).length, 0), 0);
    const currentHasFixture = (latest.snapshot.parts || []).flatMap(part => part.questions || []).find(question => question.id === PARENT_ID)?.subQuestions?.some(sub => FIXTURE_NOTES.includes(sub.note));
    let version = latest;
    if (!currentHasFixture) {
      version = (await client.query(
        `INSERT INTO exam_versions(exam_id,version_number,snapshot,total_parent_questions,total_sub_questions,total_points,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [event.exam_id, Number(latest.version_number) + 1, JSON.stringify(snapshot), parentCount, subCount, subCount * 10, latest.created_by],
      )).rows[0];
      await client.query('UPDATE exams SET active_version_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [event.exam_id, version.id]);
    } else {
      await client.query(
        `UPDATE exam_versions SET snapshot=$2,total_parent_questions=$3,total_sub_questions=$4,total_points=$5 WHERE id=$1`,
        [latest.id, JSON.stringify(snapshot), parentCount, subCount, subCount * 10],
      );
    }

    await client.query(
      `UPDATE exam_attempts SET question_snapshot=$2,exam_version_id=$3
       WHERE exam_event_id=$1 AND status='IN_PROGRESS'`,
      [EVENT_ID, JSON.stringify(snapshot), version.id],
    );

    const media = await client.query(
      'SELECT media_type,original_name FROM question_bank_media WHERE content_id=$1 ORDER BY media_type',
      [CONTENT_ID],
    );
    return { eventId: EVENT_ID, examId: event.exam_id, version: version.version_number, parentId: PARENT_ID, groupLabel: 'Câu hỏi 1–3', subQuestionCount: parent.subQuestions.length, media: media.rows };
  });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.close());
