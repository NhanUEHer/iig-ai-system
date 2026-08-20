const db = require('../../config/db');

const clean=value=>String(value??'').trim();

async function history({page=1,limit=10,search=''}){
  const safePage=Math.max(1,Number(page)||1),safeLimit=Math.min(50,Math.max(1,Number(limit)||10));
  const term=`%${clean(search)}%`,offset=(safePage-1)*safeLimit;
  const base=`FROM content_passages passage
    LEFT JOIN LATERAL (
      SELECT generation.id,generation.target_score,generation.selection_mode,generation.created_at,
        COUNT(item.id)::int AS item_count
      FROM key_vocab_generations generation
      LEFT JOIN key_vocab_items item ON item.generation_id=generation.id
      WHERE generation.passage_id=passage.id
      GROUP BY generation.id ORDER BY generation.created_at DESC LIMIT 1
    ) key_vocab ON TRUE
    LEFT JOIN LATERAL (
      SELECT generation.id,generation.status,generation.created_at,
        COUNT(candidate.id)::int AS item_count,
        COUNT(candidate.id) FILTER(WHERE candidate.status='completed')::int AS completed_count,
        COUNT(candidate.id) FILTER(WHERE candidate.status='failed')::int AS failed_count
      FROM dictionary_generations generation
      LEFT JOIN dictionary_candidates candidate ON candidate.generation_id=generation.id
      WHERE generation.passage_id=passage.id
      GROUP BY generation.id ORDER BY generation.created_at DESC LIMIT 1
    ) dictionary ON TRUE
    WHERE (key_vocab.id IS NOT NULL OR dictionary.id IS NOT NULL) AND passage.content ILIKE $1`;
  const [rows,count]=await Promise.all([
    db.query(`SELECT passage.id AS "passageId",passage.content AS passage,
      key_vocab.id AS "keyVocabId",key_vocab.target_score AS "targetScore",key_vocab.selection_mode AS "selectionMode",
      key_vocab.item_count AS "keyVocabCount",key_vocab.created_at AS "keyVocabCreatedAt",
      dictionary.id AS "dictionaryId",dictionary.status AS "dictionaryStatus",dictionary.item_count AS "dictionaryCount",
      dictionary.completed_count AS "dictionaryCompletedCount",dictionary.failed_count AS "dictionaryFailedCount",
      dictionary.created_at AS "dictionaryCreatedAt",
      GREATEST(key_vocab.created_at,dictionary.created_at) AS "updatedAt" ${base}
      ORDER BY GREATEST(key_vocab.created_at,dictionary.created_at) DESC NULLS LAST LIMIT $2 OFFSET $3`,[term,safeLimit,offset]),
    db.query(`SELECT COUNT(*)::int AS total ${base}`,[term])
  ]);
  const total=count.rows[0]?.total||0;
  return {data:rows.rows,meta:{page:safePage,limit:safeLimit,total,totalPages:Math.max(1,Math.ceil(total/safeLimit))}};
}

module.exports={history};

