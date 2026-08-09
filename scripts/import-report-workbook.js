const fs=require('fs');
const path=require('path');
const db=require('../src/config/db');
const service=require('../src/modules/reports/reportService');

async function main(){
  const filePath=path.resolve(process.argv[2]||'');
  const year=Number(process.argv[3]);
  const month=Number(process.argv[4]);
  if(!filePath||!Number.isInteger(year)||!Number.isInteger(month))throw new Error('Usage: node scripts/import-report-workbook.js <file> <year> <month>');
  const user=await db.query("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1");
  if(!user.rows[0])throw new Error('Database dev chưa có tài khoản admin để ghi audit.');
  const buffer=fs.readFileSync(filePath);
  const inspected=await service.inspectUpload({body:{year,month,fileName:path.basename(filePath),mimeType:'application/vnd.ms-excel.sheet.macroEnabled.12',fileBase64:buffer.toString('base64')},userId:user.rows[0].id});
  const committed=await service.commit(inspected.importId,user.rows[0].id);
  console.log(JSON.stringify({inspection:inspected.summary,version:committed},null,2));
}

main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
