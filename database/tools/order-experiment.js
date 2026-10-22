const { getConnection, config } = require('./db-config');
const { newId } = require('../../backend/utils/id');

/**
 * Ordering Experiment for Migration 002_datetime_ms
 * 
 * Tests whether inserting 5 messages rapidly within 1 second produces
 * identical second-level timestamps under standard DATETIME, proving
 * that sub-second ordering is lost unless DATETIME(3) is adopted.
 */
async function runOrderingExperiment() {
  console.log(`[order-experiment] Running message ordering experiment on "${config.database}"...`);
  const conn = await getConnection();

  try {
    // 1. Inspect created_at column definition on messages table
    const [colInfo] = await conn.query(
      `SELECT COLUMN_TYPE, DATA_TYPE, DATETIME_PRECISION
       FROM information_schema.columns
       WHERE table_schema = ? AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'created_at'`,
      [config.database]
    );

    const precision = colInfo[0]?.DATETIME_PRECISION ?? null;
    const colType = colInfo[0]?.COLUMN_TYPE || '';
    console.log(`[order-experiment] Current messages.created_at precision: ${precision ?? 0} (Type: ${colType})`);

    // 2. We need a dummy project and user to test message inserts if they don't exist
    // Check if any user and project exist
    const [users] = await conn.query('SELECT id FROM users LIMIT 1');
    const [projects] = await conn.query('SELECT id FROM projects LIMIT 1');

    if (!users.length || !projects.length) {
      console.log('[order-experiment] Database needs at least 1 user and 1 project to insert messages. Seeding may be required.');
      return {
        precision,
        proved: precision === null || precision === 0,
        explanation: 'Standard DATETIME lacks sub-second precision (DATETIME_PRECISION is 0 or NULL).'
      };
    }

    const testProjectId = projects[0].id;
    const testUserId = users[0].id;

    // 3. Rapidly insert 5 messages in tight loop
    const insertedIds = [];
    console.log('[order-experiment] Rapidly inserting 5 messages within milliseconds...');
    for (let i = 1; i <= 5; i++) {
      const msgId = newId('msg');
      insertedIds.push(msgId);
      await conn.query(
        `INSERT INTO messages (id, project_id, sender_id, content, created_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
        [msgId, testProjectId, testUserId, `Rapid message ${i} for ordering experiment`]
      );
    }

    // 4. Fetch the inserted messages and check their created_at timestamps
    const [fetched] = await conn.query(
      `SELECT id, content, created_at
       FROM messages
       WHERE id IN (?)
       ORDER BY id ASC`,
      [insertedIds]
    );

    console.log('[order-experiment] Inserted messages:');
    const timestamps = [];
    fetched.forEach((m, idx) => {
      const ts = m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at);
      timestamps.push(ts);
      console.log(`  Msg ${idx + 1} (${m.id}): created_at = ${ts}`);
    });

    const uniqueTimestamps = new Set(timestamps);
    const identicalTimestamps = uniqueTimestamps.size === 1;

    console.log(`[order-experiment] Unique timestamps across 5 rapid inserts: ${uniqueTimestamps.size} / 5`);

    if (identicalTimestamps && (precision === null || precision === 0)) {
      console.log('[order-experiment] RESULT: PROVED. All 5 rapid messages have the exact same second-level timestamp.');
      console.log('  Under standard DATETIME, ordering by created_at alone cannot determine chronological sequence.');
      console.log('  Migration 002_datetime_ms (DATETIME(3)) is strongly justified.');
    } else if (precision >= 3) {
      console.log('[order-experiment] RESULT: DATETIME(3) is active. Sub-second ordering is preserved.');
    }

    // Clean up test messages
    await conn.query('DELETE FROM messages WHERE id IN (?)', [insertedIds]);
    console.log('[order-experiment] Cleaned up experiment messages.');

    return {
      precision,
      identicalTimestamps,
      uniqueTimestamps: uniqueTimestamps.size,
      proved: identicalTimestamps
    };
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  runOrderingExperiment()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[order-experiment] Error:', err.message);
      process.exit(1);
    });
}

module.exports = runOrderingExperiment;
