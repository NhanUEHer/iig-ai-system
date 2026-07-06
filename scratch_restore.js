const db = require('./src/config/db');
const fs = require('fs');

async function run() {
  console.log('🔄 Restoring names into DB 5433 from CSV...');
  try {
    const data = fs.readFileSync('/tmp/student_names.csv', 'utf8');
    const lines = data.split('\n').filter(Boolean);
    
    for (const line of lines) {
      const parts = line.split(',');
      const keycode = parts[0]?.trim();
      const name = parts[1]?.trim();
      const test = parts[2]?.trim();
      
      if (keycode && name && name !== 'Unknown Student') {
        console.log(`   -> Updating ${keycode} with name: ${name}`);
        
        // Update mocktest_submissions
        await db.query(
          "UPDATE mocktest_submissions SET student_name = $1, test_name = $2 WHERE keycode = $3",
          [name, test, keycode]
        );
        
        // Update keycode_mappings
        await db.query(
          "UPDATE keycode_mappings SET student_name = $1, test_name = $2 WHERE keycode = $3",
          [name, test, keycode]
        );
      }
    }
    console.log('✅ Name restoration to database port 5433 finished.');
  } catch (error) {
    console.error('❌ Error restoring names:', error);
  } finally {
    process.exit(0);
  }
}

run();
