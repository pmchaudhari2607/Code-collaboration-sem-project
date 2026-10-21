const { getConnection } = require('./pool');

async function withTransaction(fn) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rbErr) {
      // rollback error suppressed to ensure original error is rethrown
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  withTransaction
};
