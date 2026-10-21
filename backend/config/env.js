const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_ENABLED = process.env.DB_ENABLED === 'true';
const DB_TARGET = (process.env.DB_TARGET || 'dev').toLowerCase();
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || '';
const DB_NAME_TEST = process.env.DB_NAME_TEST || '';
const DB_POOL_LIMIT = parseInt(process.env.DB_POOL_LIMIT || '10', 10);

if (DB_ENABLED) {
  const checkRequired = (name, val) => {
    if (val === undefined || val === null || val === '') {
      console.error(`[config] Missing required environment variable: ${name}`);
      process.exit(1);
    }
  };

  checkRequired('DB_HOST', DB_HOST);
  if (isNaN(DB_PORT) || DB_PORT <= 0) {
    console.error('[config] Missing or invalid environment variable: DB_PORT');
    process.exit(1);
  }
  checkRequired('DB_USER', DB_USER);
  checkRequired('DB_PASSWORD', DB_PASSWORD);

  if (DB_TARGET === 'test') {
    checkRequired('DB_NAME_TEST', DB_NAME_TEST);
    if (!DB_NAME_TEST.endsWith('_test')) {
      console.error('[config] Refusing database: DB_NAME_TEST must end with _test');
      process.exit(1);
    }
  } else if (DB_TARGET === 'dev') {
    checkRequired('DB_NAME', DB_NAME);
    if (!DB_NAME.endsWith('_dev')) {
      console.error('[config] Refusing database: DB_NAME must end with _dev');
      process.exit(1);
    }
  } else {
    console.error('[config] Invalid DB_TARGET: must be "dev" or "test"');
    process.exit(1);
  }
}

const activeDbName = DB_TARGET === 'test' ? DB_NAME_TEST : DB_NAME;

module.exports = {
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  ENABLE_DEV_MODE: process.env.ENABLE_DEV_MODE === 'true',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://127.0.0.1:5500',
  DB_ENABLED,
  DB_TARGET,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_NAME_TEST,
  DB_POOL_LIMIT,
  activeDbName
};

