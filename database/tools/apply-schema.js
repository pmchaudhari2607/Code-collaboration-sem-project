const fs = require('fs');
const path = require('path');
const { getConnection, config } = require('./db-config');

async function applySchema() {
  const keep = process.argv.includes('--keep');
  const resetSqlPath = path.join(__dirname, '../reset_dev.sql');
  const schemaSqlPath = path.join(__dirname, '../schema.sql');

  const conn = await getConnection({ multipleStatements: true });

  try {
    if (!keep) {
      if (!config.database.endsWith('_test')) {
        // Guard: check if any table holds rows
        const [tables] = await conn.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`,
          [config.database]
        );
        for (const t of tables) {
          const tName = t.table_name || t.TABLE_NAME;
          const [cnt] = await conn.query(`SELECT COUNT(*) AS c FROM \`${config.database}\`.\`${tName}\``);
          if (cnt[0]?.c > 0) {
            throw new Error(`[apply-schema] SAFETY REFUSAL: Refusing to reset "${config.database}" because table "${tName}" contains ${cnt[0].c} rows and database name does not end in _test.`);
          }
        }
      }

      console.log(`[apply-schema] Executing reset_dev.sql on ${config.database}...`);
      const resetSql = fs.readFileSync(resetSqlPath, 'utf8');
      await conn.query(resetSql);
      console.log('[apply-schema] reset_dev.sql completed.');
    } else {
      console.log('[apply-schema] --keep flag provided; skipping reset_dev.sql.');
    }

    console.log(`[apply-schema] Executing schema.sql on ${config.database}...`);
    const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
    await conn.query(schemaSql);
    console.log('[apply-schema] schema.sql completed.');

    const [tables] = await conn.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = ? 
       ORDER BY table_name`,
      [config.database]
    );

    const tableNames = tables.map(t => t.table_name || t.TABLE_NAME);
    console.log(`[apply-schema] Successfully created ${tableNames.length} tables in ${config.database}:`);
    tableNames.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

    if (tableNames.length !== 12) {
      console.warn(`[apply-schema] Warning: Expected 12 tables, but found ${tableNames.length}.`);
    }

    return tableNames;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  applySchema()
    .then(() => {
      console.log('[apply-schema] Schema applied successfully.');
      process.exit(0);
    })
    .catch(err => {
      console.error('[apply-schema] Error applying schema:', err.message);
      process.exit(1);
    });
}

module.exports = applySchema;
