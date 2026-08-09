const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const storage = require('../src/services/storageService');

const apply = process.argv.includes('--apply');
const publicDir = path.join(__dirname, '../public');

function localPath(stored,folder){
  if(!stored||storage.isR2Key(stored))return null;
  let pathname=String(stored);try{pathname=new URL(pathname,'http://local').pathname;}catch{}
  const candidate=path.join(publicDir,folder,path.basename(pathname));
  return fs.existsSync(candidate)?candidate:null;
}

async function migrateRows({query,folder,kind,update}){
  const rows=(await db.query(query)).rows;let migrated=0,missing=0;
  for(const row of rows){
    const file=localPath(row.audio_path,folder);if(!file){missing++;continue;}
    if(!apply){console.log(`[dry-run] ${file}`);migrated++;continue;}
    const stored=await storage.uploadFile(file,storage.objectKey(kind,path.basename(file)));
    await db.query(update,[stored,row.id]);
    fs.rmSync(file,{force:true});migrated++;
  }
  return{found:rows.length,migrated,missing};
}

(async()=>{
  storage.requireR2();
  if(!storage.isR2Configured())throw new Error('R2 is not configured.');
  const generated=await migrateRows({
    query:"SELECT id,audio_path FROM local_tts_history WHERE audio_path IS NOT NULL AND audio_path NOT LIKE 'r2:%'",
    folder:'local_audio',kind:'generated',update:'UPDATE local_tts_history SET audio_path=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2'
  });
  const cleaned=await migrateRows({
    query:"SELECT answer_id id,cleaned_audio_url audio_path FROM ai_evaluation_results WHERE cleaned_audio_url IS NOT NULL AND cleaned_audio_url NOT LIKE 'r2:%'",
    folder:'cleaned-audio',kind:'cleaned',update:'UPDATE ai_evaluation_results SET cleaned_audio_url=$1,updated_at=CURRENT_TIMESTAMP WHERE answer_id=$2'
  });
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',generated,cleaned},null,2));
  await db.pool.end();
})().catch(async error=>{console.error(error);await db.pool.end();process.exit(1);});
