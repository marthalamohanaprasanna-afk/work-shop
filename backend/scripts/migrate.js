/**
 * Automated Supabase Migration Runner
 * Single command execution: npm run db:migrate
 * Reads and applies the SQL migration against your Supabase PostgreSQL instance.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  console.log('\n======================================================');
  console.log('🚀 SUPABASE MIGRATION RUNNER');
  console.log('======================================================\n');

  // 1. Locate SQL Migration File
  const migrationPaths = [
    path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261014000001_create_chatbot_tables.sql'),
    path.join(__dirname, '..', 'supabase_schema.sql')
  ];

  let sqlFilePath = null;
  for (const p of migrationPaths) {
    if (fs.existsSync(p)) {
      sqlFilePath = p;
      break;
    }
  }

  if (!sqlFilePath) {
    console.error('❌ Could not find migration SQL file.');
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
  console.log(`📄 Found migration file: ${path.basename(sqlFilePath)}`);

  // 2. Resolve Database Connection String
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    console.log('\n⚠️  DATABASE_URL is not set in backend/.env.');
    console.log('------------------------------------------------------');
    console.log('To run this migration automatically in one command:');
    console.log('1. Go to your Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard -> Project Settings -> Database');
    console.log('2. Copy your "Connection string" (URI / Pooled or Direct).');
    console.log('3. Add it to backend/.env:');
    console.log('   DATABASE_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres');
    console.log('4. Re-run: npm run db:migrate');
    console.log('------------------------------------------------------');
    console.log('\n💡 Alternatively, you can copy the contents of:');
    console.log(`   ${sqlFilePath}`);
    console.log('   and paste it directly into the Supabase Dashboard -> SQL Editor.\n');
    process.exit(1);
  }

  // 3. Connect to Supabase PostgreSQL
  console.log('🔌 Connecting to Supabase database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database successfully.');

    // 4. Execute Migration
    console.log('⚙️  Applying tables, indexes, RLS policies, and triggers...');
    await client.query('BEGIN');
    await client.query(sqlContent);
    await client.query('COMMIT');

    // 5. Verify Table Creation
    const verifyRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('chat_sessions', 'chat_messages')
      ORDER BY table_name;
    `);

    console.log('\n======================================================');
    console.log('🎉 ALL TABLES CREATED & VERIFIED SUCCESSFULLY!');
    console.log('======================================================');
    verifyRes.rows.forEach(r => {
      console.log(`   ✅ Table: public.${r.table_name}`);
    });
    console.log('   ✅ Trigger: trigger_update_chat_sessions_timestamp');
    console.log('   ✅ Row Level Security: Enabled with public access policies');
    console.log('======================================================\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Migration failed:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.error('👉 Please check your database password in DATABASE_URL inside backend/.env');
    }
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

runMigration();
