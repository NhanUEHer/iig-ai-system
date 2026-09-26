require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const storage = require('../src/services/storageService');

const EVENT_CODE = 'EV-MOBILE-LR20-2026';
const VIDEO_MARKER = 'mobile-lr20-video-case.mp4';
const IMAGE_MARKER = 'mobile-lr20-image-case.jpg';
const VIDEO_FIXTURE = path.join(
  __dirname,
  '../public/question-bank-media/question-bank/53113b50-5473-4592-8bf3-d2d2ce087b04/content/172db624-9890-4963-a99b-f1bcec80d831/034e54ac-02c1-4aec-8bac-ed57280acc00-ta__o_fvideo_luo__n___i.mp4',
);
const IMAGE_FIXTURE = path.join(
  __dirname,
  '../public/question-bank-media/question-bank/53113b50-5473-4592-8bf3-d2d2ce087b04/content/172db624-9890-4963-a99b-f1bcec80d831/b30e73ac-a064-4d90-9d6b-52903ffb4dba-1789572452704_117016794891319974_299948681619392784_495a7248e8f0cec625c50e2f24b5568e.jpg',
);

const videoHtml = [
  '<article>',
  '<h3>Workshop Welcome Video</h3>',
  '<p>Watch the short introduction video, then answer the question below.</p>',
  '</article>',
].join('');

const readingHtml = [
  '<article>',
  '<h3>ENGLISH WORKSHOP REGISTRATION</h3>',
  '<p>Registration for the university English workshop closes on <strong>Friday at 5:00 PM</strong>.</p>',
  '<p>Students should complete the online form before the deadline. Late registrations cannot be accepted.</p>',
  '<ul>',
  '<li><strong>Format:</strong> In-person workshop</li>',
  '<li><strong>Registration deadline:</strong> Friday, 5:00 PM</li>',
  '<li><strong>Confirmation:</strong> Sent by email</li>',
  '</ul>',
  '</article>',
].join('');

async function main() {
  if (!fs.existsSync(VIDEO_FIXTURE)) throw new Error(`Không tìm thấy video fixture: ${VIDEO_FIXTURE}`);
  if (!fs.existsSync(IMAGE_FIXTURE)) throw new Error(`Không tìm thấy image fixture: ${IMAGE_FIXTURE}`);

  const result = await db.transaction(async client => {
    const event = (await client.query(
      `SELECT ee.id AS event_id,e.id AS exam_id,e.active_version_id
       FROM exam_events ee JOIN exams e ON e.id=ee.exam_id
       WHERE ee.event_code=$1 LIMIT 1`,
      [EVENT_CODE],
    )).rows[0];
    if (!event) throw new Error('Không tìm thấy đề LR20 hiện tại.');

    const version = (await client.query(
      'SELECT id,snapshot FROM exam_versions WHERE id=$1 LIMIT 1',
      [event.active_version_id],
    )).rows[0];
    if (!version) throw new Error('Đề LR20 chưa có phiên bản đang hoạt động.');

    const snapshot = structuredClone(version.snapshot);
    const listening = snapshot.parts.find(part => String(part.title).toLowerCase() === 'listening')?.questions?.[0];
    const readingQuestions = snapshot.parts.find(part => String(part.title).toLowerCase() === 'reading')?.questions || [];
    const reading = readingQuestions[0];
    const readingImage = readingQuestions[1];
    if (!listening?.contents?.[0] || !reading?.contents?.[0] || !readingImage?.contents?.[0]) throw new Error('Không tìm thấy đủ câu Listening/Reading mẫu.');

    const videoContent = listening.contents[0];
    const readingContent = reading.contents[0];
    const imageContent = readingImage.contents[0];
    await client.query(
      'UPDATE question_bank_contents SET title=$2,content_html=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1',
      [videoContent.id, 'Workshop welcome video', videoHtml],
    );
    await client.query(
      'UPDATE question_bank_contents SET title=$2,content_html=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1',
      [readingContent.id, 'English workshop registration notice', readingHtml],
    );
    await client.query(
      'UPDATE question_bank_contents SET title=$2,content_html=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1',
      [imageContent.id, 'Workshop information poster', '<p>Study the workshop poster, then answer the question below.</p>'],
    );

    const existingVideo = (await client.query(
      `SELECT id,storage_key FROM question_bank_media
       WHERE question_id=$1 AND content_id=$2 AND media_type='VIDEO' LIMIT 1`,
      [listening.id, videoContent.id],
    )).rows[0];
    let videoMediaId = existingVideo?.id;
    if (!existingVideo) {
      const buffer = fs.readFileSync(VIDEO_FIXTURE);
      const storageKey = await storage.uploadBuffer(
        buffer,
        `mobile-lr20/${listening.id}/${videoContent.id}/${VIDEO_MARKER}`,
        'video/mp4',
        { preferLocal: true },
      );
      videoMediaId = (await client.query(
        `INSERT INTO question_bank_media
          (question_id,content_id,media_type,media_role,original_name,storage_key,mime_type,file_size)
         VALUES($1,$2,'VIDEO','STIMULUS',$3,$4,'video/mp4',$5) RETURNING id`,
        [listening.id, videoContent.id, VIDEO_MARKER, storageKey, buffer.length],
      )).rows[0].id;
    }

    const existingImage = (await client.query(
      `SELECT id,storage_key FROM question_bank_media
       WHERE question_id=$1 AND content_id=$2 AND media_type='IMAGE' LIMIT 1`,
      [readingImage.id, imageContent.id],
    )).rows[0];
    let imageMediaId = existingImage?.id;
    if (!existingImage) {
      const buffer = fs.readFileSync(IMAGE_FIXTURE);
      const storageKey = await storage.uploadBuffer(
        buffer,
        `mobile-lr20/${readingImage.id}/${imageContent.id}/${IMAGE_MARKER}`,
        'image/jpeg',
        { preferLocal: true },
      );
      imageMediaId = (await client.query(
        `INSERT INTO question_bank_media
          (question_id,content_id,media_type,media_role,original_name,storage_key,mime_type,file_size)
         VALUES($1,$2,'IMAGE','STIMULUS',$3,$4,'image/jpeg',$5) RETURNING id`,
        [readingImage.id, imageContent.id, IMAGE_MARKER, storageKey, buffer.length],
      )).rows[0].id;
    }

    videoContent.title = 'Workshop welcome video';
    videoContent.content_html = videoHtml;
    readingContent.title = 'English workshop registration notice';
    readingContent.content_html = readingHtml;
    imageContent.title = 'Workshop information poster';
    imageContent.content_html = '<p>Study the workshop poster, then answer the question below.</p>';
    await client.query(
      'UPDATE exam_versions SET snapshot=$2 WHERE id=$1',
      [version.id, JSON.stringify(snapshot)],
    );

    return {
      eventId: event.event_id,
      examId: event.exam_id,
      versionId: version.id,
      video: { questionId: listening.id, contentId: videoContent.id, mediaId: videoMediaId },
      image: { questionId: readingImage.id, contentId: imageContent.id, mediaId: imageMediaId },
      text: { questionId: reading.id, contentId: readingContent.id },
    };
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  await db.close();
}

main().catch(async error => {
  console.error(error);
  await db.close();
  process.exitCode = 1;
});
