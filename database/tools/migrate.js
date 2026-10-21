const fs = require('fs');
const path = require('path');
const { getConnection, config } = require('./db-config');

/**
 * Pre-checks registry for migrations.
 * If a migration has a pre-check rule, it must return true or throw an error.
 */
const PRE_CHECKS = {
  '001_username_check.sql': async (conn) => {
    const [rows] = await conn.query(
      'SELECT id, username FROM users WHERE CHAR_LENGTH(username) > 15'
    );
    if (rows.length > 0) {
      const offending = rows.map(r => `${r.username} (${r.id})`).join(', ');
      throw new Error(`Pre-check failed for 001_username_check: found ${rows.length} username(s) exceeding 15 characters: ${offending}`);
    }
  }
};

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
  `);
}

async function migrate(options = {}) {
  const conn = await getConnection({ multipleStatements: true });
  const migrationsDir = path.join(__dirname, '../migrations');

  try {
    await ensureMigrationsTable(conn);

    const [appliedRows] = await conn.query('SELECT name FROM schema_migrations ORDER BY name');
    const appliedSet = new Set(appliedRows.map(r => r.name));

    if (!fs.existsSync(migrationsDir)) {
      console.log('[migrate] No migrations directory found.');
      return [];
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.includes('proposal'))
      .sort();

    const newlyApplied = [];

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      console.log(`[migrate] Preparing migration: ${file} on ${config.database}...`);

      // Run pre-check if registered
      if (PRE_CHECKS[file]) {
        console.log(`[migrate] Running pre-check for ${file}...`);
        await PRE_CHECKS[file](conn);
        console.log(`[migrate] Pre-check passed for ${file}.`);
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute migration
      await conn.query(sql);

      // Record in schema_migrations
      await conn.query(
        'INSERT INTO schema_migrations (name, applied_at) VALUES (?, UTC_TIMESTAMP())',
        [file]
      );

      console.log(`[migrate] Successfully applied: ${file}`);
      newlyApplied.push(file);
    }

    if (newlyApplied.length === 0) {
      console.log(`[migrate] Database "${config.database}" is up to date. No pending migrations.`);
    } else {
      console.log(`[migrate] Applied ${newlyApplied.length} migration(s) successfully.`);
    }

    return newlyApplied;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  migrate()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('[migrate] Migration error:', err.message);
      process.exit(1);
    });
}

module.exports = migrate;
