const mysql = require('mysql2/promise');
const config = require('../config/env');

let pool = null;

function getPool() {
  if (!pool) {
    if (!config.DB_ENABLED) {
      const err = new Error('Database is disabled (DB_ENABLED=false)');
      err.code = 'DB_DISABLED';
      throw err;
    }

    if (!config.activeDbName.endsWith('_dev') && !config.activeDbName.endsWith('_test')) {
      const err = new Error(`Refusing database "${config.activeDbName}": name must end with _dev or _test.`);
      err.code = 'INVALID_DB_NAME';
      throw err;
    }

    pool = mysql.createPool({
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.activeDbName,
      timezone: 'Z',
      dateStrings: ['DATE'],
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: config.DB_POOL_LIMIT || 10,
      queueLimit: 0
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const p = getPool();
  return p.query(sql, params);
}

async function getConnection() {
  const p = getPool();
  return p.getConnection();
}

async function ping() {
  if (!config.DB_ENABLED) return false;
  try {
    const [rows] = await query('SELECT 1 AS alive');
    return rows[0]?.alive === 1;
  } catch (err) {
    return false;
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  query,
  getConnection,
  ping,
  close
};
