require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const storage = require('../src/services/storageService');

const EXAM_CODE = 'EX-MOCK-LR20-2026';
const EVENT_CODE = 'EV-MOBILE-LR20-2026';
const MARKER = 'MOBILE_LR20_MCQ_2026';

const listeningPrompts = [
  ['What time does the workshop begin?', 'At 9:00 AM'],
  ['Where should participants check in?', 'At the welcome desk'],
  ['What should students bring?', 'Their student ID'],
  ['Who will lead the first activity?', 'The English instructor'],
  ['How long is the opening session?', 'Thirty minutes'],
  ['What room has been reserved?', 'The main auditorium'],
  ['When will the break start?', 'At 10:30 AM'],
  ['What will participants receive?', 'A workshop handbook'],
  ['How should students submit questions?', 'Through the online form'],
  ['What happens after the workshop?', 'Students receive their results'],
];

const readingPrompts = [
  ['When does workshop registration close?', 'Friday at 5:00 PM'],
  ['Why will tomorrow’s class be online?', 'The classroom is being renovated'],
  ['What must internship applicants submit?', 'A résumé and cover letter'],
  ['Where can students collect certificates?', 'At the student services office'],
  ['Who may join the language club?', 'All university students'],
  ['What is included in the course fee?', 'Digital learning materials'],
  ['When will the library reopen?', 'Next Monday'],
  ['What is the purpose of the notice?', 'To announce a schedule change'],
  ['How should attendees confirm participation?', 'By replying to the email'],
  ['What is the main benefit of the program?', 'Regular English practice'],
];

function options(correct) {
  return [['A', 'None of the above', false], ['B', correct, true], ['C', 'At another location', false], ['D', 'The information is not provided', false]];
}

async function main() {
  const existing = (await db.query(
    `SELECT ee.id event_id,e.id exam_id FROM exam_events ee JOIN exams e ON e.id=ee.exam_id WHERE ee.event_code=$1 LIMIT 1`,
    [EVENT_CODE],
  )).rows[0];
  if (existing) {
    console.log(JSON.stringify({ ok: true, reused: true, eventId: existing.event_id, examId: existing.exam_id, accessPath: `/events/${existing.event_id}` }, null, 2));
    await db.close();
    return;
  }

  const audioPath = path.join(__dirname, '../public/question-bank-media/question-bank/5b121bc0-c49f-4f19-9a0a-d7f4cd9e7d41/content/b5100a7c-f5f5-4b7c-8b39-cdea30b1bb5d/mock-listening.mp3');
  const audioBuffer = fs.readFileSync(audioPath);

  const result = await db.transaction(async client => {
    const groupId = (await client.query(
      `INSERT INTO question_groups(code,title,description,status) VALUES($1,$2,$3,'ACTIVE')
       ON CONFLICT(code) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,status='ACTIVE',updated_at=CURRENT_TIMESTAMP RETURNING id`,
      ['MOBILE-LR20', 'Mobile LR 20 MCQ', `Fixture local ${MARKER}`],
    )).rows[0].id;
    const examId = (await client.query(
      `INSERT INTO exams(exam_code,title,status,duration_minutes,duration_seconds,points_per_question,score_scale,description,introduction)
       VALUES($1,$2,'ACTIVE',20,0,10,200,$3,$4) RETURNING id`,
      [EXAM_CODE, 'English Listening & Reading Quick Test — 20 Questions', 'Đề mock mobile gồm 20 câu MCQ Listening và Reading.', '<p>Hoàn thành 20 câu hỏi. Đáp án được tự động lưu và chỉ được chấm sau khi nộp bài.</p>'],
    )).rows[0].id;

    const snapshot = { exam: { id: examId, title: 'English Listening & Reading Quick Test — 20 Questions', durationSeconds: 1200, pointsPerSubQuestion: 10 }, parts: [] };
    for (const [partIndex, definition] of [{ title: 'Listening', items: listeningPrompts }, { title: 'Reading', items: readingPrompts }].entries()) {
      const partId = (await client.query(
        `INSERT INTO exam_parts(exam_id,part_number,title,duration_minutes,part_label,instruction,display_order)
         VALUES($1,$2,$3,10,$4,$5,$6) RETURNING id`,
        [examId, partIndex + 1, definition.title, definition.title, partIndex === 0 ? 'Nghe nội dung và chọn đáp án đúng.' : 'Đọc nội dung và chọn đáp án đúng.', partIndex],
      )).rows[0].id;
      const snapshotPart = { id: partId, title: definition.title, displayOrder: partIndex, questions: [] };
      for (const [index, [prompt, correct]] of definition.items.entries()) {
        const number = partIndex * 10 + index + 1;
        const questionId = (await client.query(
          `INSERT INTO question_bank_questions(question_name,group_id,question_type,note,status)
           VALUES($1,$2,'MCQ_SINGLE',$3,'ACTIVE') RETURNING id`,
          [`LR20 Question ${number}`, groupId, MARKER],
        )).rows[0].id;
        const contentHtml = partIndex === 0
          ? `<p>Listen to the short workshop announcement and answer question ${number}.</p>`
          : `<article><h3>University English Program Notice</h3><p>Students are invited to join the English development program. Please read the current notice carefully before answering question ${number}.</p></article>`;
        const content = (await client.query(
          `INSERT INTO question_bank_contents(question_id,title,content_html,display_order) VALUES($1,$2,$3,0) RETURNING id,title,content_html,script_html,translation_html,display_order`,
          [questionId, `${definition.title} context ${index + 1}`, contentHtml],
        )).rows[0];
        if (partIndex === 0) {
          const key = `mobile-lr20/${questionId}/${content.id}/listening.mp3`;
          const storageKey = await storage.uploadBuffer(audioBuffer, key, 'audio/mpeg', { preferLocal: true });
          await client.query(
            `INSERT INTO question_bank_media(question_id,content_id,media_type,media_role,original_name,storage_key,mime_type,file_size)
             VALUES($1,$2,'AUDIO','STIMULUS',$3,$4,'audio/mpeg',$5)`,
            [questionId, content.id, `listening-${index + 1}.mp3`, storageKey, audioBuffer.length],
          );
        }
        const sub = (await client.query(
          `INSERT INTO question_bank_sub_questions(question_id,content_id,prompt_html,instruction_html,display_order)
           VALUES($1,$2,$3,$4,0) RETURNING id,content_id,prompt_html,instruction_html,display_order`,
          [questionId, content.id, `<p>${prompt}</p>`, `<p>${definition.title} question ${index + 1}</p>`],
        )).rows[0];
        sub.options = [];
        for (const [order, [key, text, isCorrect]] of options(correct).entries()) {
          const option = (await client.query(
            `INSERT INTO question_bank_sub_question_options(sub_question_id,option_key,option_text,is_correct,display_order)
             VALUES($1,$2,$3,$4,$5) RETURNING id,option_key,option_text,is_correct,display_order`,
            [sub.id, key, text, isCorrect, order],
          )).rows[0];
          sub.options.push(option);
        }
        await client.query(
          `INSERT INTO exam_part_questions(exam_id,part_id,question_id,display_order,points) VALUES($1,$2,$3,$4,10)`,
          [examId, partId, questionId, index],
        );
        snapshotPart.questions.push({ id: questionId, question_name: `LR20 Question ${number}`, question_type: 'MCQ_SINGLE', note: MARKER, status: 'ACTIVE', group_name: 'Mobile LR 20 MCQ', contents: [content], subQuestions: [sub] });
      }
      snapshot.parts.push(snapshotPart);
    }
    const version = (await client.query(
      `INSERT INTO exam_versions(exam_id,version_number,snapshot,total_parent_questions,total_sub_questions,total_points)
       VALUES($1,1,$2,20,20,200) RETURNING id`,
      [examId, JSON.stringify(snapshot)],
    )).rows[0];
    await client.query('UPDATE exams SET active_version_id=$2 WHERE id=$1', [examId, version.id]);
    await client.query(`INSERT INTO exam_event_schools(name) VALUES('IIG Việt Nam') ON CONFLICT(LOWER(BTRIM(name))) DO NOTHING`);
    const event = (await client.query(
      `INSERT INTO exam_events(event_code,name,description,school_name,start_at,end_at,exam_id,status,internal_note)
       VALUES($1,$2,$3,'IIG Việt Nam',CURRENT_TIMESTAMP-INTERVAL '1 hour',CURRENT_TIMESTAMP+INTERVAL '30 days',$4,'PUBLISHED',$5)
       RETURNING id`,
      [EVENT_CODE, 'Workshop English Listening & Reading — 20 câu', '<p>Bài kiểm tra nhanh gồm 10 câu Listening và 10 câu Reading.</p>', examId, MARKER],
    )).rows[0];
    return { eventId: event.id, examId, accessPath: `/events/${event.id}` };
  });
  console.log(JSON.stringify({ ok: true, totalQuestions: 20, ...result }, null, 2));
  await db.close();
}

main().catch(async error => { console.error(error); await db.close(); process.exitCode = 1; });
