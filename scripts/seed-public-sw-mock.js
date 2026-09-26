/**
 * Repeatable local seed for a four-skill L/R/S/W mock exam.
 * Only rows carrying MOCK_MARKER are replaced; unrelated local data is preserved.
 */
require('dotenv').config();

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const db = require('../src/config/db');
const storage = require('../src/services/storageService');

const MOCK_MARKER = 'PUBLIC_LRSW_MOCK_2026';
const LEGACY_MARKER = 'PUBLIC_SW_MOCK_2026';
const EXAM_CODE = 'EX-MOCK-LRSW-2026';
const LEGACY_EXAM_CODE = 'EX-MOCK-SW-2026';
const EXAM_TITLE = `[${MOCK_MARKER}] English Four Skills Quick Test`;
const GROUP_CODE = 'GRP-MOCK-LRSW-2026';

const parts = [
  {
    title: 'Listening',
    label: 'Listening',
    durationMinutes: 5,
    type: 'MCQ_SINGLE',
    instruction: 'Nghe nội dung và chọn một đáp án đúng nhất cho mỗi câu hỏi.',
    questions: [
      {
        name: 'LRSW Listening Q1 – Workshop time',
        content: '',
        audioText: 'The English workshop will begin at nine o’clock in the main auditorium.',
        prompt: '<p>What time will the workshop begin?</p>',
        options: [['A', 'At 8:00', false], ['B', 'At 9:00', true], ['C', 'At 10:00', false], ['D', 'At 11:00', false]],
      },
      {
        name: 'LRSW Listening Q2 – Library books',
        content: '<p>Audio script: Students may borrow up to five books for fourteen days.</p>',
        audioText: 'Students may borrow up to five books for fourteen days.',
        prompt: '<p>How many books may a student borrow?</p>',
        options: [['A', 'Three', false], ['B', 'Four', false], ['C', 'Five', true], ['D', 'Fourteen', false]],
      },
      {
        name: 'LRSW Listening Q3 – Meeting location',
        content: '<p>Audio script: The meeting has been moved from Room 201 to the conference hall on the third floor.</p>',
        audioText: 'The meeting has been moved from Room two oh one to the conference hall on the third floor.',
        prompt: '<p>Where will the meeting take place?</p>',
        options: [['A', 'Room 201', false], ['B', 'The library', false], ['C', 'The cafeteria', false], ['D', 'The conference hall', true]],
      },
    ],
  },
  {
    title: 'Reading',
    label: 'Reading',
    durationMinutes: 5,
    type: 'MCQ_SINGLE',
    instruction: 'Đọc nội dung và chọn một đáp án đúng nhất cho mỗi câu hỏi.',
    questions: [
      {
        name: 'LRSW Reading Q1 – Registration notice',
        content: '<p>Registration for the university English workshop closes this Friday. Students should complete the online form before 5:00 PM.</p>',
        prompt: '<p>When does registration close?</p>',
        options: [['A', 'Monday', false], ['B', 'Wednesday', false], ['C', 'Friday', true], ['D', 'Sunday', false]],
      },
      {
        name: 'LRSW Reading Q2 – Course email',
        content: '<p>Dear students, tomorrow’s class will be held online because the main classroom is being renovated. A meeting link will be sent this evening.</p>',
        prompt: '<p>Why will the class be held online?</p>',
        options: [['A', 'The teacher is absent', false], ['B', 'The classroom is being renovated', true], ['C', 'The course has ended', false], ['D', 'Students requested it', false]],
      },
      {
        name: 'LRSW Reading Q3 – Internship advertisement',
        content: '<p>An international company is looking for university students with strong communication skills. Applicants must submit a résumé and a short cover letter.</p>',
        prompt: '<p>What must applicants submit?</p>',
        options: [['A', 'A résumé and cover letter', true], ['B', 'A school transcript only', false], ['C', 'A language certificate only', false], ['D', 'A video presentation', false]],
      },
    ],
  },
  {
    title: 'Speaking',
    label: 'Speaking',
    durationMinutes: 8,
    type: 'RECORD',
    instruction: 'Trả lời bằng tiếng Anh. Mỗi câu có thời gian chuẩn bị và tối đa 60 giây ghi âm.',
    questions: [
      {
        name: 'LRSW Speaking Q1 – Self introduction',
        content: '<p>Imagine that you are meeting other students at an English workshop.</p>',
        prompt: '<p>Please introduce yourself and describe one goal you have for learning English.</p>',
      },
      {
        name: 'LRSW Speaking Q2 – Study preference',
        content: '<p>Your teacher is asking about your preferred way of studying.</p>',
        prompt: '<p>Do you prefer studying alone or with a group? Explain your choice.</p>',
      },
      {
        name: 'LRSW Speaking Q3 – Workshop expectation',
        content: '<p>You have just joined an English workshop at your university.</p>',
        prompt: '<p>What do you expect to learn from this workshop? Give at least one reason.</p>',
      },
    ],
  },
  {
    title: 'Writing',
    label: 'Writing',
    durationMinutes: 12,
    type: 'WRITING',
    instruction: 'Viết đoạn trả lời bằng tiếng Anh, trình bày quan điểm rõ ràng và có lý do hoặc ví dụ hỗ trợ.',
    questions: [
      {
        name: 'LRSW Writing Q1 – Online learning',
        content: '<p>Many universities now offer both online and in-person classes.</p>',
        prompt: '<p>Which learning format do you prefer? Support your opinion with reasons or examples.</p>',
      },
      {
        name: 'LRSW Writing Q2 – English for careers',
        content: '<p>English is increasingly important in the workplace.</p>',
        prompt: '<p>What is the most effective way for university students to improve English for their future careers?</p>',
      },
      {
        name: 'LRSW Writing Q3 – Team projects',
        content: '<p>Some students enjoy team projects, while others prefer individual assignments.</p>',
        prompt: '<p>Do team projects help students learn better? Explain your opinion.</p>',
      },
    ],
  },
];

function generateListeningAudio(items) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iig-lrsw-audio-'));
  const buffers = [];
  try {
    for (let index = 0; index < items.length; index += 1) {
      const source = path.join(tempDir, `listening-${index + 1}.aiff`);
      const target = path.join(tempDir, `listening-${index + 1}.mp3`);
      execFileSync('/usr/bin/say', ['-r', '165', '-o', source, items[index].audioText]);
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', source, '-codec:a', 'libmp3lame', '-b:a', '96k', target]);
      buffers.push(fs.readFileSync(target));
    }
    return buffers;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function seed() {
  const listeningAudio = generateListeningAudio(parts[0].questions);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const groupResult = await client.query(
      `INSERT INTO question_groups(code,title,description,status)
       VALUES($1,$2,$3,'ACTIVE')
       ON CONFLICT(code) DO UPDATE SET
         title=EXCLUDED.title,description=EXCLUDED.description,status='ACTIVE',updated_at=CURRENT_TIMESTAMP
       RETURNING id`,
      [GROUP_CODE, 'Mock English Four Skills', `Dữ liệu local phục vụ ${MOCK_MARKER}`]
    );
    const groupId = groupResult.rows[0].id;

    await client.query('DELETE FROM exams WHERE exam_code=ANY($1::varchar[])', [[EXAM_CODE, LEGACY_EXAM_CODE]]);
    await client.query('DELETE FROM question_bank_questions WHERE note=ANY($1::text[])', [[MOCK_MARKER, LEGACY_MARKER]]);

    const examResult = await client.query(
      `INSERT INTO exams(exam_code,title,status,duration_minutes,duration_seconds,points_per_question,score_scale,description,introduction)
       VALUES($1,$2,'ACTIVE',30,0,10,100,$3,$4)
       RETURNING id`,
      [
        EXAM_CODE,
        EXAM_TITLE,
        'Đề thi thử tổng hợp Listening, Reading, Speaking và Writing gồm 4 phần, 12 câu.',
        '<p>Hoàn thành lần lượt 4 kỹ năng. Hãy kiểm tra âm thanh và micro trước khi bắt đầu.</p>',
      ]
    );
    const examId = examResult.rows[0].id;

    let questionTotal = 0;
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const part = parts[partIndex];
      const partResult = await client.query(
        `INSERT INTO exam_parts(exam_id,part_number,title,duration_minutes,part_label,instruction,display_order)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [examId, partIndex + 1, part.title, part.durationMinutes, part.label, part.instruction, partIndex]
      );
      const partId = partResult.rows[0].id;

      for (let questionIndex = 0; questionIndex < part.questions.length; questionIndex += 1) {
        const item = part.questions[questionIndex];
        const questionResult = await client.query(
          `INSERT INTO question_bank_questions(question_name,group_id,question_type,note,status)
           VALUES($1,$2,$3,$4,'ACTIVE') RETURNING id`,
          [item.name, groupId, part.type, MOCK_MARKER]
        );
        const questionId = questionResult.rows[0].id;

        const contentResult = await client.query(
          `INSERT INTO question_bank_contents(question_id,title,content_html,display_order)
           VALUES($1,$2,$3,0) RETURNING id`,
          [questionId, item.name, item.content]
        );

        if (item.audioText) {
          const audioBuffer = listeningAudio[questionIndex];
          const objectKey = `question-bank/${questionId}/content/${contentResult.rows[0].id}/mock-listening.mp3`;
          const storageKey = await storage.uploadBuffer(audioBuffer, objectKey, 'audio/mpeg', { preferLocal: true });
          await client.query(
            `INSERT INTO question_bank_media(
               question_id,content_id,media_type,media_role,original_name,storage_key,mime_type,file_size
             ) VALUES($1,$2,'AUDIO','STIMULUS',$3,$4,'audio/mpeg',$5)`,
            [questionId, contentResult.rows[0].id, `listening-${questionIndex + 1}.mp3`, storageKey, audioBuffer.length]
          );
        }

        const isMcq = part.type === 'MCQ_SINGLE';
        const isSpeaking = part.type === 'RECORD';
        const isWriting = part.type === 'WRITING';
        const subQuestionResult = await client.query(
          `INSERT INTO question_bank_sub_questions(
             question_id,content_id,prompt_html,instruction_html,sentence_starters_html,
             preparation_duration_seconds,recording_duration_seconds,max_character_count,
             min_word_count,max_word_count,display_order
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0) RETURNING id`,
          [
            questionId,
            contentResult.rows[0].id,
            item.prompt,
            `<p>${part.instruction}</p>`,
            item.starter || null,
            isSpeaking ? 20 : null,
            isSpeaking ? 60 : null,
            isWriting ? 2000 : null,
            isWriting ? 80 : null,
            isWriting ? 250 : null,
          ]
        );

        if (isMcq) {
          for (let optionIndex = 0; optionIndex < item.options.length; optionIndex += 1) {
            const [key, text, correct] = item.options[optionIndex];
            await client.query(
              `INSERT INTO question_bank_sub_question_options(sub_question_id,option_key,option_text,is_correct,display_order)
               VALUES($1,$2,$3,$4,$5)`,
              [subQuestionResult.rows[0].id, key, text, correct, optionIndex]
            );
          }
        } else {
          await client.query(
            `INSERT INTO question_bank_sample_answers(sub_question_id,answer_html,display_order)
             VALUES($1,$2,0)`,
            [
              subQuestionResult.rows[0].id,
              isSpeaking
                ? '<p>Sample response is evaluated by pronunciation, fluency, grammar, and relevance.</p>'
                : '<p>Sample response is evaluated by task completion, organization, vocabulary, and grammar.</p>',
            ]
          );
        }

        await client.query(
          `INSERT INTO exam_part_questions(exam_id,part_id,question_id,display_order,points)
           VALUES($1,$2,$3,$4,10)`,
          [examId, partId, questionId, questionIndex]
        );
        questionTotal += 1;
      }
    }

    await client.query('COMMIT');
    console.log('Mock L/R/S/W exam created successfully.');
    console.log(`Exam ID: ${examId}`);
    console.log(`Exam code: ${EXAM_CODE}`);
    console.log(`Parts: ${parts.length}`);
    console.log(`Questions: ${questionTotal}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await db.close();
  }
}

seed().catch(error => {
  console.error('Cannot seed local L/R/S/W mock exam:', error);
  process.exitCode = 1;
});
