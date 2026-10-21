const path = require('path');
const dotenv = require(path.join(__dirname, '../../backend/node_modules/dotenv'));
const mysql = require(path.join(__dirname, '../../backend/node_modules/mysql2/promise'));

// Load backend/.env
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

const isTest = process.argv.includes('--test') || process.env.DB_TARGET === 'test';
const dbName = isTest
  ? (process.env.DB_NAME_TEST || 'code_review_portal_test')
  : (process.env.DB_NAME || 'code_review_portal_dev');

if (!dbName.endsWith('_dev') && !dbName.endsWith('_test')) {
  console.error(`[db-config] Refusing database "${dbName}": name must end with _dev or _test.`);
  process.exit(1);
}

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: dbName,
  timezone: 'Z',
  dateStrings: ['DATE']
};

async function checkVersion(conn) {
  const [rows] = await conn.query('SELECT VERSION() AS version');
  const ver = rows[0]?.version || '';
  if (ver.toLowerCase().includes('mariadb')) {
    throw new Error(`MariaDB detected (${ver}). CodeReviewHub requires MySQL 8.0.16+ for CHECK constraints and utf8mb4_0900_ai_ci collation.`);
  }

  const match = ver.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Could not parse MySQL version: ${ver}`);
  }

  const [major, minor, patch] = [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
  if (major < 8 || (major === 8 && minor === 0 && patch < 16)) {
    throw new Error(`MySQL version ${ver} is below minimum required 8.0.16.`);
  }

  return ver;
}

async function getConnection(extraOptions = {}) {
  const conn = await mysql.createConnection({
    ...config,
    ...extraOptions
  });
  await checkVersion(conn);
  return conn;
}

function getPool(extraOptions = {}) {
  return mysql.createPool({
    ...config,
    ...extraOptions,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

module.exports = {
  config,
  checkVersion,
  getConnection,
  getPool
};
