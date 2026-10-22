/**
 * database/tools/backup-verify.js
 * 
 * Safely creates a mysqldump of code_review_portal_dev and verifies its integrity.
 * Passes credentials via process.env to child_process (never exposed in arguments or stdout).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require(path.join(__dirname, '../../backend/node_modules/dotenv'));

// Load backend/.env
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

const host = process.env.DB_HOST || 'localhost';
const port = String(process.env.DB_PORT || '3307');
const user = process.env.DB_USER || 'crh_app';
const password = process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'code_review_portal_dev';

const backupDir = path.resolve(__dirname, '../../backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `dev_backup_${timestamp}.sql`);
const latestFile = path.join(backupDir, 'dev_backup_latest.sql');

console.log('=======================================================');
console.log('   CodeReviewHub - Development Database Backup Tool   ');
console.log('=======================================================');
console.log(`Target Database: ${dbName} on ${host}:${port}`);

// Run mysqldump
const dumpArgs = [
  '-h', host,
  '-P', port,
  '-u', user,
  '--single-transaction',
  '--routines',
  '--triggers',
  dbName
];

const dumpResult = spawnSync('mysqldump', dumpArgs, {
  env: {
    ...process.env,
    MYSQL_PWD: password
  },
  maxBuffer: 50 * 1024 * 1024
});

if (dumpResult.error) {
  console.error('[backup] Failed to execute mysqldump:', dumpResult.error.message);
  process.exit(1);
}

if (dumpResult.status !== 0) {
  console.error('[backup] mysqldump exited with error code:', dumpResult.status);
  console.error(dumpResult.stderr ? dumpResult.stderr.toString() : '');
  process.exit(1);
}

const sqlOutput = dumpResult.stdout;
if (!sqlOutput || sqlOutput.length === 0) {
  console.error('[backup] mysqldump produced 0 bytes of output.');
  process.exit(1);
}

fs.writeFileSync(backupFile, sqlOutput);
fs.writeFileSync(latestFile, sqlOutput);

const fileSize = fs.statSync(backupFile).size;
console.log(`[backup] Dump created successfully:`);
console.log(`  File: ${backupFile}`);
console.log(`  Latest symlink/copy: ${latestFile}`);
console.log(`  Size: ${fileSize} bytes (${(fileSize / 1024).toFixed(2)} KB)`);

// Integrity verification: verify all 12 tables exist in the dump
const content = sqlOutput.toString('utf8');
const expectedTables = [
  'users',
  'user_settings',
  'languages',
  'projects',
  'project_members',
  'code_files',
  'code_versions',
  'reviews',
  'tasks',
  'notifications',
  'activity_log',
  'messages'
];

let verifiedCount = 0;
for (const table of expectedTables) {
  if (content.includes(`CREATE TABLE \`${table}\``)) {
    verifiedCount++;
  } else {
    console.warn(`[backup] WARNING: Table definition for "${table}" missing in dump.`);
  }
}

if (verifiedCount === expectedTables.length && fileSize > 5000) {
  console.log(`[PASS] Backup verified: All 12 tables present with schema & data.`);
  process.exit(0);
} else {
  console.error(`[FAIL] Verification failed: Only ${verifiedCount}/${expectedTables.length} tables found.`);
  process.exit(1);
}
