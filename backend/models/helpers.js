const pool = require('../db/pool');

async function exec(sql, params = [], conn = null) {
  if (conn) {
    return conn.query(sql, params);
  }
  return pool.query(sql, params);
}

function toISOString(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString();
  }
  // If string from MySQL like "2026-09-10 10:00:00"
  if (typeof val === 'string') {
    if (val.endsWith('Z')) return val;
    // Replace space with T and append Z
    const formatted = val.replace(' ', 'T');
    return formatted.includes('Z') ? formatted : `${formatted}.000Z`;
  }
  return new Date(val).toISOString();
}

function toBool(val) {
  return val === true || val === 1 || val === '1';
}

function toNumber(val, defaultVal = 0) {
  if (val === null || val === undefined) return defaultVal;
  const n = Number(val);
  return isNaN(n) ? defaultVal : n;
}

module.exports = {
  exec,
  toISOString,
  toBool,
  toNumber
};
