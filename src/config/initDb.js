const db = require('./db');
const runMigrations = require('../database/migrate');
const { hashPassword, validatePassword } = require('../modules/auth/passwordService');

async function seedUsers() {
  const usersCount = await db.query('SELECT COUNT(*) FROM users');
  if (parseInt(usersCount.rows[0].count, 10) > 0) return;

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('⚠️ No users found. Configure BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create the first admin.');
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(`Invalid BOOTSTRAP_ADMIN_PASSWORD: ${passwordError}`);
  const passwordHash = await hashPassword(password);
  const created = await db.query(
    `INSERT INTO users (name, email, username, password, password_hash, role)
     VALUES ($1, LOWER($2), LOWER($2), '', $3, 'admin') RETURNING id`,
    [process.env.BOOTSTRAP_ADMIN_NAME || 'System Administrator', email, passwordHash]
  );
  await db.query(`INSERT INTO user_roles(user_id,role_id,is_primary)
    SELECT $1,id,TRUE FROM roles WHERE slug='admin' ON CONFLICT DO NOTHING`, [created.rows[0].id]);
}

async function initDb() {
  try {
    console.log('🔄 Running database migrations...');
    await runMigrations();
    await seedUsers();
    console.log('✅ Database initialized successfully.');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

module.exports = initDb;
