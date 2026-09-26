/**
 * scripts/seed-public-lr-mock.js
 * Safe repeatable local seed script for Public Exam Test Fixture.
 *
 * Requirements:
 * - Uses existing DB and storageService S3/R2 flow.
 * - Fails clearly if S3/R2 is not configured.
 * - Only manages rows/assets marked with marker MOCK_MARKER ("PUBLIC_LR_MOCK_2026").
 * - Never deletes or modifies unrelated user data or Admin data.
 * - Idempotent by marker/title.
 * - Creates/reuses 1 ACTIVE Exam, 1 Part, 10 ACTIVE Questions (5 LISTENING, 5 READING),
 *   each with title, content_text HTML, question_text HTML, 4 options with 1 correct option, fixed 10 points.
 * - Creates/reuses 1 PUBLISHED Exam Event with schoolName, active dates, 15-minute duration, linked to the mock exam.
 * - Generates small valid fixture media (IMAGE, AUDIO, VIDEO) with ffmpeg, uploads via storageService.uploadBuffer to S3/R2,
 *   inserts question_bank_media rows storing only storage keys.
 * - Prints exam ID, event ID, public URL, and media upload result.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Support local R2 config overrides if present
const r2LocalPath = path.join(__dirname, '../.env.r2.local');
if (fs.existsSync(r2LocalPath)) {
  const r2Env = require('dotenv').parse(fs.readFileSync(r2LocalPath));
  for (const k in r2Env) {
    process.env[k] = r2Env[k];
  }
}

const db = require('../src/config/db');
const storageService = require('../src/services/storageService');

const MOCK_MARKER = 'PUBLIC_LR_MOCK_2026';
const MOCK_EXAM_TITLE = `[${MOCK_MARKER}] TOEIC® Listening & Reading Diagnostic Mock Exam`;
const MOCK_EVENT_TITLE = `[${MOCK_MARKER}] TOEIC® Listening & Reading Diagnostic Workshop`;
const MOCK_SCHOOL_NAME = 'Đại học Bách Khoa Hà Nội (HUST)';

async function main() {
  console.log('--- Starting Public L&R Mock Exam Seed ---');

  // 1. Check storageService configuration
  if (!storageService.isR2Configured()) {
    console.error('ERROR: S3/R2 storage is not configured properly in .env! Failing as required.');
    process.exit(1);
  }
  console.log('[Storage] S3/R2 storage configured successfully.');

  // 2. Generate local media assets using ffmpeg
  const tmpDir = path.join(__dirname, '../tmp/mock_seed_assets');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const imgFile = path.join(tmpDir, 'stimulus.png');
  const audioFile = path.join(tmpDir, 'audio.mp3');
  const videoFile = path.join(tmpDir, 'video.mp4');

  console.log('[Media] Generating fixture assets with ffmpeg...');
  try {
    execSync(`ffmpeg -y -f lavfi -i color=c=blue:s=320x240:d=1 -frames:v 1 "${imgFile}"`, { stdio: 'pipe' });
    execSync(`ffmpeg -y -f lavfi -i sine=frequency=800:duration=2 "${audioFile}"`, { stdio: 'pipe' });
    execSync(`ffmpeg -y -f lavfi -i testsrc=duration=2:size=320x240:rate=10 -f lavfi -i sine=frequency=440:duration=2 -pix_fmt yuv420p "${videoFile}"`, { stdio: 'pipe' });
  } catch (err) {
    console.error('ERROR: Failed to generate media files with ffmpeg:', err.message);
    process.exit(1);
  }

  const imgBuf = fs.readFileSync(imgFile);
  const audioBuf = fs.readFileSync(audioFile);
  const videoBuf = fs.readFileSync(videoFile);

  console.log(`[Media] Local assets generated: PNG (${imgBuf.length}B), MP3 (${audioBuf.length}B), MP4 (${videoBuf.length}B)`);

  // 3. Perform database seed in transaction
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // A. Create or reuse Mock Exam
    let examRes = await client.query('SELECT * FROM exams WHERE title = $1', [MOCK_EXAM_TITLE]);
    let exam = examRes.rows[0];

    if (!exam) {
      const newExam = await client.query(
        `INSERT INTO exams (title, status, duration_minutes, duration_seconds, points_per_question)
         VALUES ($1, 'ACTIVE', 15, 0, 10)
         RETURNING *`,
        [MOCK_EXAM_TITLE]
      );
      exam = newExam.rows[0];
      console.log(`[DB] Created Exam: ${exam.id}`);
    } else {
      console.log(`[DB] Reusing Existing Exam: ${exam.id}`);
    }

    // B. Create or reuse Part
    let partRes = await client.query('SELECT * FROM exam_parts WHERE exam_id = $1 AND part_number = 1', [exam.id]);
    let part = partRes.rows[0];

    if (!part) {
      const newPart = client.query(
        `INSERT INTO exam_parts (exam_id, part_number, title, display_order)
         VALUES ($1, 1, $2, 1)
         RETURNING *`,
        [exam.id, `Part 1 - Listening & Reading Diagnostic [${MOCK_MARKER}]`]
      );
      part = (await newPart).rows[0];
      console.log(`[DB] Created Part 1: ${part.id}`);
    } else {
      console.log(`[DB] Reusing Existing Part 1: ${part.id}`);
    }

    // C. Create/Reuse 10 ACTIVE Questions (5 LISTENING, 5 READING)
    const questionsData = [
      // 5 Listening Questions
      {
        skill: 'LISTENING',
        title: `[${MOCK_MARKER}] Q1 Listening - Image Description`,
        contentText: `<p>Observe the photograph below carefully before answering the question.</p>`,
        questionText: `<p>What is the person in the photograph primarily doing?</p>`,
        mediaType: 'IMAGE',
        buf: imgBuf,
        mime: 'image/png',
        ext: 'png',
        options: [
          { key: 'A', text: 'He is working on a laptop at his desk.', correct: true },
          { key: 'B', text: 'He is repairing a vehicle in the garage.', correct: false },
          { key: 'C', text: 'He is presenting a chart to the audience.', correct: false },
          { key: 'D', text: 'He is ordering food at a restaurant.', correct: false },
        ]
      },
      {
        skill: 'LISTENING',
        title: `[${MOCK_MARKER}] Q2 Listening - Short Dialogue Audio`,
        contentText: `<p>Listen to the spoken instruction and select the correct response.</p>`,
        questionText: `<p>When is the quarterly financial review scheduled to begin?</p>`,
        mediaType: 'AUDIO',
        buf: audioBuf,
        mime: 'audio/mpeg',
        ext: 'mp3',
        options: [
          { key: 'A', text: 'Tomorrow morning at 9:00 AM in Conference Room B.', correct: true },
          { key: 'B', text: 'Next month after the annual audit.', correct: false },
          { key: 'C', text: 'It has been canceled indefinitely.', correct: false },
          { key: 'D', text: 'At the main auditorium on Friday evening.', correct: false },
        ]
      },
      {
        skill: 'LISTENING',
        title: `[${MOCK_MARKER}] Q3 Listening - Video Presentation`,
        contentText: `<p>Watch the demonstration clip provided below.</p>`,
        questionText: `<p>What feature is being demonstrated in the clip?</p>`,
        mediaType: 'VIDEO',
        buf: videoBuf,
        mime: 'video/mp4',
        ext: 'mp4',
        options: [
          { key: 'A', text: 'Automated data visualization tool.', correct: true },
          { key: 'B', text: 'Manual spreadsheet cell alignment.', correct: false },
          { key: 'C', text: 'Hardware network cable replacement.', correct: false },
          { key: 'D', text: 'Printer toner installation procedure.', correct: false },
        ]
      },
      {
        skill: 'LISTENING',
        title: `[${MOCK_MARKER}] Q4 Listening - Conversation Location`,
        contentText: `<p>Listen to the audio recording between office staff.</p>`,
        questionText: `<p>Where does this conversation most likely take place?</p>`,
        mediaType: 'AUDIO',
        buf: audioBuf,
        mime: 'audio/mpeg',
        ext: 'mp3',
        options: [
          { key: 'A', text: 'In a corporate office cafeteria.', correct: false },
          { key: 'B', text: 'At an international shipping department.', correct: true },
          { key: 'C', text: 'Inside a public railway terminal.', correct: false },
          { key: 'D', text: 'At a customer service helpline clinic.', correct: false },
        ]
      },
      {
        skill: 'LISTENING',
        title: `[${MOCK_MARKER}] Q5 Listening - Schedule Action`,
        contentText: `<p>Listen to the voicemail announcement.</p>`,
        questionText: `<p>What action is the caller requested to take immediately?</p>`,
        mediaType: 'AUDIO',
        buf: audioBuf,
        mime: 'audio/mpeg',
        ext: 'mp3',
        options: [
          { key: 'A', text: 'Confirm arrival time via email reply.', correct: true },
          { key: 'B', text: 'Cancel the flight reservation online.', correct: false },
          { key: 'C', text: 'Submit a paper application in person.', correct: false },
          { key: 'D', text: 'Pay the penalty fee at the counter.', correct: false },
        ]
      },
      // 5 Reading Questions
      {
        skill: 'READING',
        title: `[${MOCK_MARKER}] Q6 Reading - Incomplete Sentence`,
        contentText: `<p><strong>Grammar Focus:</strong> Adverb Selection in Business Context</p>`,
        questionText: `<p>The project management team worked __________ to deliver the project ahead of deadline.</p>`,
        mediaType: null,
        options: [
          { key: 'A', text: 'diligently', correct: true },
          { key: 'B', text: 'diligence', correct: false },
          { key: 'C', text: 'diligent', correct: false },
          { key: 'D', text: 'most diligent', correct: false },
        ]
      },
      {
        skill: 'READING',
        title: `[${MOCK_MARKER}] Q7 Reading - Vocabulary Context`,
        contentText: `<p><strong>Memorandum:</strong> Office Facility Maintenance Notice</p>`,
        questionText: `<p>All employees are advised to __________ their vehicle parking permits by Friday.</p>`,
        mediaType: null,
        options: [
          { key: 'A', text: 'renew', correct: true },
          { key: 'B', text: 'postpone', correct: false },
          { key: 'C', text: 'demolish', correct: false },
          { key: 'D', text: 'subtract', correct: false },
        ]
      },
      {
        skill: 'READING',
        title: `[${MOCK_MARKER}] Q8 Reading - Text Passage Analysis`,
        contentText: `<div style="padding:10px; background:#f8fafc; border-left:4px solid #0284c7;">
          <h4>ANNUAL TECH INNOVATION CONFERENCE</h4>
          <p>We are delighted to announce that registration for the 2026 Tech Summit is officially open. Keynote speakers will address advancements in automated evaluation systems.</p>
        </div>`,
        questionText: `<p>What is the main purpose of the notice above?</p>`,
        mediaType: 'IMAGE',
        buf: imgBuf,
        mime: 'image/png',
        ext: 'png',
        options: [
          { key: 'A', text: 'To announce event registration opening.', correct: true },
          { key: 'B', text: 'To report budget deficits of the summit.', correct: false },
          { key: 'C', text: 'To advertise a software discount promotion.', correct: false },
          { key: 'D', text: 'To reschedule the keynote speeches.', correct: false },
        ]
      },
      {
        skill: 'READING',
        title: `[${MOCK_MARKER}] Q9 Reading - Email Reading Comprehension`,
        contentText: `<div style="padding:10px; background:#f8fafc; border-left:4px solid #0284c7;">
          <p><strong>To:</strong> All Department Heads<br/><strong>From:</strong> Logistics Director<br/><strong>Subject:</strong> Vendor Equipment Delivery</p>
          <p>Please ensure that all loading docks are clear by 8:00 AM on Monday for incoming shipment delivery.</p>
        </div>`,
        questionText: `<p>When must the loading docks be cleared?</p>`,
        mediaType: null,
        options: [
          { key: 'A', text: 'By 8:00 AM on Monday.', correct: true },
          { key: 'B', text: 'By the end of business on Tuesday.', correct: false },
          { key: 'C', text: 'Immediately after lunch today.', correct: false },
          { key: 'D', text: 'On Friday evening after shift end.', correct: false },
        ]
      },
      {
        skill: 'READING',
        title: `[${MOCK_MARKER}] Q10 Reading - Executive Summary Passage`,
        contentText: `<div style="padding:10px; background:#f8fafc; border-left:4px solid #0284c7;">
          <h4>STRATEGIC GROWTH PLAN 2026</h4>
          <p>Our organization plans to expand digital assessment services across South East Asia, targeting a 35% growth rate in student certifications.</p>
        </div>`,
        questionText: `<p>What is the target growth rate for student certifications?</p>`,
        mediaType: null,
        options: [
          { key: 'A', text: '35%', correct: true },
          { key: 'B', text: '15%', correct: false },
          { key: 'C', text: '50%', correct: false },
          { key: 'D', text: '100%', correct: false },
        ]
      },
    ];

    const mediaUploadResults = [];

    for (let i = 0; i < questionsData.length; i++) {
      const qData = questionsData[i];
      const displayOrder = i + 1;

      // Find or create question by title
      let qRes = await client.query('SELECT * FROM question_bank_questions WHERE title = $1', [qData.title]);
      let question = qRes.rows[0];

      if (!question) {
        const newQ = await client.query(
          `INSERT INTO question_bank_questions (skill, question_type, title, content_text, question_text, status)
           VALUES ($1, 'MULTIPLE_CHOICE', $2, $3, $4, 'ACTIVE')
           RETURNING *`,
          [qData.skill, qData.title, qData.contentText, qData.questionText]
        );
        question = newQ.rows[0];
      } else {
        await client.query(
          `UPDATE question_bank_questions
           SET skill = $1, content_text = $2, question_text = $3, status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [qData.skill, qData.contentText, qData.questionText, question.id]
        );
      }

      // Upsert Options (4 options)
      for (let oIdx = 0; oIdx < qData.options.length; oIdx++) {
        const opt = qData.options[oIdx];
        await client.query(
          `INSERT INTO question_bank_options (question_id, option_key, option_text, is_correct, display_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (question_id, option_key) DO UPDATE
           SET option_text = EXCLUDED.option_text, is_correct = EXCLUDED.is_correct, display_order = EXCLUDED.display_order`,
          [question.id, opt.key, opt.text, opt.correct, oIdx + 1]
        );
      }

      // Handle Media Upload if present
      if (qData.mediaType && qData.buf) {
        // Check existing media row
        const existingMediaRes = await client.query(
          'SELECT * FROM question_bank_media WHERE question_id = $1 AND media_type = $2',
          [question.id, qData.mediaType]
        );

        let storageKey = existingMediaRes.rows[0]?.storage_key;

        if (!storageKey) {
          const mediaId = crypto.randomUUID();
          const objectKey = `question-bank/${question.id}/${mediaId}-fixture.${qData.ext}`;

          // Upload buffer via storageService
          storageKey = await storageService.uploadBuffer(qData.buf, objectKey, qData.mime);

          await client.query(
            `INSERT INTO question_bank_media (id, question_id, media_type, original_name, storage_key, mime_type, file_size)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [mediaId, question.id, qData.mediaType, `fixture.${qData.ext}`, storageKey, qData.mime, qData.buf.length]
          );

          mediaUploadResults.push({ questionTitle: qData.title, type: qData.mediaType, storageKey, status: 'UPLOADED_NEW' });
        } else {
          mediaUploadResults.push({ questionTitle: qData.title, type: qData.mediaType, storageKey, status: 'REUSED_EXISTING' });
        }
      }

      // Link Question to Exam Part idempotently
      await client.query(
        `INSERT INTO exam_part_questions (part_id, question_id, display_order, points)
         VALUES ($1, $2, $3, 10)
         ON CONFLICT (part_id, question_id) DO UPDATE
         SET display_order = EXCLUDED.display_order, points = 10`,
        [part.id, question.id, displayOrder]
      );
    }

    console.log(`[DB] 10 Active Questions successfully created/linked to Part ${part.id}`);

    // D. Create or reuse PUBLISHED Exam Event
    let eventRes = await client.query('SELECT * FROM exam_events WHERE name = $1', [MOCK_EVENT_TITLE]);
    let event = eventRes.rows[0];

    const now = new Date();
    const startAt = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Started yesterday
    const endAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Valid for 30 days

    if (!event) {
      const newEvent = await client.query(
        `INSERT INTO exam_events (name, school_name, description, start_at, end_at, exam_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'PUBLISHED')
         RETURNING *`,
        [
          MOCK_EVENT_TITLE,
          MOCK_SCHOOL_NAME,
          `<p>Kỳ thi thử trực tuyến chẩn đoán trình độ Listening & Reading cho sinh viên. Đề thi gồm 10 câu hỏi chuẩn hóa.</p>`,
          startAt,
          endAt,
          exam.id,
        ]
      );
      event = newEvent.rows[0];
      console.log(`[DB] Created Exam Event: ${event.id}`);
    } else {
      await client.query(
        `UPDATE exam_events
         SET school_name = $1, start_at = $2, end_at = $3, exam_id = $4, status = 'PUBLISHED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [MOCK_SCHOOL_NAME, startAt, endAt, exam.id, event.id]
      );
      console.log(`[DB] Updated & Reused Exam Event: ${event.id}`);
    }

    await client.query('COMMIT');

    // 4. Construct Public URL and report
    const publicUrl = `${process.env.APP_URL || 'http://localhost:5173'}/public/exam-events/${event.id}`;

    console.log('\n================ SEED SUMMARY REPORT ================');
    console.log(`Mock Marker:       ${MOCK_MARKER}`);
    console.log(`Exam ID:           ${exam.id}`);
    console.log(`Exam Event ID:     ${event.id}`);
    console.log(`Public Exam Link:  ${publicUrl}`);
    console.log('\nMedia Upload Results:');
    console.table(mediaUploadResults);
    console.log('=====================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR: Seed transaction failed:', err);
    process.exit(1);
  } finally {
    client.release();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await db.pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error in seed script:', err);
  process.exit(1);
});
