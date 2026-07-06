const { Client } = require('pg');

async function run() {
  console.log('🔄 Starting data sync & recovery...');
  
  // Connect to source database (port 5432)
  const client5432 = new Client({
    connectionString: 'postgresql://postgres@localhost:5432/ai_scoring_admin'
  });
  
  // Connect to destination database (port 5433)
  const client5433 = new Client({
    connectionString: 'postgresql://minhtuanlestore@localhost:5433/ai_scoring_admin'
  });

  try {
    await client5432.connect();
    await client5433.connect();
    console.log('🐘 Connected to both databases successfully.');

    // 1. Fetch valid names from 5432
    const res = await client5432.query(
      "SELECT keycode, student_name, test_name FROM mocktest_submissions WHERE student_name != 'Unknown Student'"
    );
    console.log(`📋 Found ${res.rows.length} valid student name records in port 5432.`);

    // 2. Update to 5433
    for (const row of res.rows) {
      console.log(`   -> Updating ${row.keycode}: ${row.student_name}`);
      await client5433.query(
        "UPDATE mocktest_submissions SET student_name = $1, test_name = $2 WHERE keycode = $3",
        [row.student_name, row.test_name, row.keycode]
      );
      await client5433.query(
        "UPDATE keycode_mappings SET student_name = $1, test_name = $2 WHERE keycode = $3",
        [row.student_name, row.test_name, row.keycode]
      );
    }
    console.log('✅ Name recovery completed.');

  } catch (error) {
    console.error('❌ Error during sync:', error);
  } finally {
    await client5432.end();
    await client5433.end();
  }
}

run();
