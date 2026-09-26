require('dotenv').config({ path: ['.env.r2.local', '.env'] });

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const examEventService = require('../src/modules/exam-events/examEventService');

const EVENT_CODE = 'EV-MOBILE-LRSW-2026';
const mediaFiles = {
  image: { path: path.join(__dirname, '../mobile-web/public/IIG_logo.webp'), mimetype: 'image/webp' },
  banner: { path: path.join(__dirname, '../mobile-web/public/workshop-hero-v2.png'), mimetype: 'image/png' },
};

async function main() {
  const event = (await db.query(
    'SELECT id,event_code,name FROM exam_events WHERE UPPER(event_code)=UPPER($1) LIMIT 1',
    [EVENT_CODE],
  )).rows[0];
  if (!event) throw new Error(`Không tìm thấy kỳ thi ${EVENT_CODE}.`);

  const result = {};
  for (const [kind, source] of Object.entries(mediaFiles)) {
    const buffer = fs.readFileSync(source.path);
    result[kind] = await examEventService.uploadMedia(event.id, kind, {
      buffer,
      mimetype: source.mimetype,
      size: buffer.length,
      originalname: path.basename(source.path),
    });
  }

  console.log(JSON.stringify({
    ok: true,
    event: { id: event.id, eventCode: event.event_code, name: event.name },
    imageUrl: result.image.imageUrl,
    bannerUrl: result.banner.bannerUrl,
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
