#!/usr/bin/env node
// One-off after migration 159: fingerprint existing generated content against its CURRENT source,
// so stale detection works for items created before fingerprints existed. Safe to re-run.
const db = require('../src/config/db');
const { passageHash, questionHash } = require('../src/modules/content-studio/sourceHash');

(async () => {
  const { rows: artifacts } = await db.query(`
    SELECT a.id, a.type, a.segment_id, a.question_id, a.item_id FROM cs_artifacts a
    WHERE a.source_hash IS NULL AND a.content IS NOT NULL`);
  let updated = 0;
  for (const artifact of artifacts) {
    let hash = null;
    if (artifact.type === 'question_pack') {
      const { rows: [question] } = await db.query(
        `SELECT q.stem, q.options, q.answer_key AS "answerKey", s.meta FROM cs_questions q JOIN cs_segments s ON s.id = q.segment_id WHERE q.id = $1`, [artifact.question_id]);
      if (!question) continue;
      const { rows: passages } = await db.query(
        `SELECT text, position FROM cs_segments WHERE item_id = $1 AND kind = 'passage' ORDER BY position`, [artifact.item_id]);
      const passage = passages.find(row => row.position === question.meta?.passageIndex) || passages[0];
      hash = questionHash(passage?.text || '', question);
    } else {
      const { rows: [segment] } = await db.query('SELECT text FROM cs_segments WHERE id = $1', [artifact.segment_id]);
      if (!segment) continue;
      hash = passageHash(segment.text);
    }
    await db.query('UPDATE cs_artifacts SET source_hash = $2 WHERE id = $1 AND source_hash IS NULL', [artifact.id, hash]);
    updated += 1;
  }
  console.log(`Fingerprinted ${updated} artifact(s).`);
  process.exit(0);
})().catch(error => { console.error(error.message); process.exit(1); });
