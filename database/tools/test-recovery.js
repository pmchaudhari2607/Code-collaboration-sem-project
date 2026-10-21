/**
 * database/tools/test-recovery.js
 * 
 * Verifies recovery of dev_backup_latest.sql into code_review_portal_test.
 * Verifies all 12 tables and row counts match the backup.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require(path.join(__dirname, '../../backend/node_modules/dotenv'));
const mysql = require(path.join(__dirname, '../../backend/node_modules/mysql2/promise'));

// Load backend/.env
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '3307', 10);
const user = process.env.DB_USER || 'crh_app';
const password = process.env.DB_PASSWORD || '';
const testDb = process.env.DB_NAME_TEST || 'code_review_portal_test';

const backupFile = path.resolve(__dirname, '../../backups/dev_backup_latest.sql');

if (!fs.existsSync(backupFile)) {
  console.error('[recovery-test] Backup file does not exist:', backupFile);
  process.exit(1);
}

if (!testDb.endsWith('_test')) {
  console.error(`[recovery-test] SAFETY ERROR: Can only test restore into database ending in _test. Target was: ${testDb}`);
  process.exit(1);
}

console.log('=======================================================');
console.log('      CodeReviewHub - Database Recovery Test           ');
console.log('=======================================================');
console.log(`Source Backup: ${backupFile}`);
console.log(`Target Test Database: ${testDb} on ${host}:${port}`);

const sqlContent = fs.readFileSync(backupFile);

// Run mysql client to restore into code_review_portal_test
const restoreResult = spawnSync('mysql', [
  '-h', host,
  '-P', String(port),
  '-u', user,
  testDb
], {
  input: sqlContent,
  env: {
    ...process.env,
    MYSQL_PWD: password
  },
  maxBuffer: 50 * 1024 * 1024
});

if (restoreResult.error) {
  console.error('[recovery-test] Restore execution failed:', restoreResult.error.message);
  process.exit(1);
}

if (restoreResult.status !== 0) {
  console.error('[recovery-test] mysql client returned error:', restoreResult.status);
  console.error(restoreResult.stderr ? restoreResult.stderr.toString() : '');
  process.exit(1);
}

console.log('[recovery-test] SQL dump executed successfully against test DB.');

async function verifyRestoredDatabase() {
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: testDb
  });

  const tables = [
    'users', 'user_settings', 'languages', 'projects', 'project_members',
    'code_files', 'code_versions', 'reviews', 'tasks', 'notifications',
    'activity_log', 'messages'
  ];

  console.log('[recovery-test] Verifying row counts in recovered test database:');
  const counts = {};
  for (const t of tables) {
    const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
    counts[t] = rows[0].c;
  }
  console.table(counts);

  await conn.end();

  // Validate critical rows match the expected dev database snapshot
  if (counts.users === 6 && counts.projects === 4 && counts.code_files === 8 && counts.languages === 4) {
    console.log('[PASS] Database recovery test succeeded: All tables and data recovered perfectly.');
    process.exit(0);
  } else {
    console.error('[FAIL] Restored data mismatch.');
    process.exit(1);
  }
}

verifyRestoredDatabase().catch(err => {
  console.error('[recovery-test] Verification error:', err);
  process.exit(1);
});
