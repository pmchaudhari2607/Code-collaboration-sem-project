const path = require('path');
const dotenv = require(path.join(__dirname, '../../backend/node_modules/dotenv'));
const mysql = require(path.join(__dirname, '../../backend/node_modules/mysql2/promise'));

dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

const devDb = process.env.DB_NAME || 'code_review_portal_dev';
const testDb = process.env.DB_NAME_TEST || 'code_review_portal_test';

const connConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  timezone: 'Z',
  dateStrings: ['DATE']
};

async function getSchemaMetadata(conn, dbName) {
  // 1. Columns
  const [columns] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, DATA_TYPE, COLUMN_TYPE, EXTRA
     FROM information_schema.columns
     WHERE table_schema = ? AND TABLE_NAME != 'schema_migrations'
     ORDER BY TABLE_NAME, COLUMN_NAME`,
    [dbName]
  );

  // 2. Indexes
  const [indexes] = await conn.query(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
     FROM information_schema.statistics
     WHERE table_schema = ? AND TABLE_NAME != 'schema_migrations'
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    [dbName]
  );

  // 3. Constraints
  const [constraints] = await conn.query(
    `SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
     FROM information_schema.table_constraints
     WHERE table_schema = ? AND TABLE_NAME != 'schema_migrations'
     ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
    [dbName]
  );

  // 4. Check constraints (omit schema name so check clauses compare identically across DBs)
  const [checks] = await conn.query(
    `SELECT CONSTRAINT_NAME, CHECK_CLAUSE
     FROM information_schema.check_constraints
     WHERE CONSTRAINT_SCHEMA = ?
     ORDER BY CONSTRAINT_NAME`,
    [dbName]
  );

  return { columns, indexes, constraints, checks };
}

function diffList(label, devList, testList, keyFn) {
  const devMap = new Map(devList.map(item => [keyFn(item), item]));
  const testMap = new Map(testList.map(item => [keyFn(item), item]));
  const diffs = [];

  for (const [key, devItem] of devMap) {
    if (!testMap.has(key)) {
      diffs.push(`[-] In dev only (${label}): ${key}`);
    } else {
      const testItem = testMap.get(key);
      const devStr = JSON.stringify(devItem);
      const testStr = JSON.stringify(testItem);
      if (devStr !== testStr) {
        diffs.push(`[~] Differs in ${label} for ${key}:\n    Dev:  ${devStr}\n    Test: ${testStr}`);
      }
    }
  }

  for (const [key] of testMap) {
    if (!devMap.has(key)) {
      diffs.push(`[+] In test only (${label}): ${key}`);
    }
  }

  return diffs;
}

async function runSchemaDiff() {
  console.log(`[schema-diff] Comparing schema of "${devDb}" and "${testDb}" on port ${connConfig.port}...`);
  const conn = await mysql.createConnection(connConfig);

  try {
    const devMeta = await getSchemaMetadata(conn, devDb);
    const testMeta = await getSchemaMetadata(conn, testDb);

    const colDiffs = diffList('columns', devMeta.columns, testMeta.columns, c => `${c.TABLE_NAME}.${c.COLUMN_NAME}`);
    const idxDiffs = diffList('indexes', devMeta.indexes, testMeta.indexes, i => `${i.TABLE_NAME}.${i.INDEX_NAME}.${i.SEQ_IN_INDEX}`);
    const cstDiffs = diffList('constraints', devMeta.constraints, testMeta.constraints, c => `${c.TABLE_NAME}.${c.CONSTRAINT_NAME}`);
    const chkDiffs = diffList('check_constraints', devMeta.checks, testMeta.checks, c => c.CONSTRAINT_NAME);

    const allDiffs = [...colDiffs, ...idxDiffs, ...cstDiffs, ...chkDiffs];

    if (allDiffs.length > 0) {
      console.error(`[schema-diff] Found ${allDiffs.length} schema differences between ${devDb} and ${testDb}:`);
      allDiffs.forEach(d => console.error('  ' + d));
      return false;
    }

    console.log(`[schema-diff] SUCCESS: Dev ("${devDb}") and Test ("${testDb}") schemas match exactly.`);
    console.log(`  Columns verified:     ${devMeta.columns.length}`);
    console.log(`  Indexes verified:     ${devMeta.indexes.length}`);
    console.log(`  Constraints verified: ${devMeta.constraints.length}`);
    console.log(`  Check constraints:    ${devMeta.checks.length}`);
    return true;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  runSchemaDiff()
    .then(match => {
      process.exit(match ? 0 : 1);
    })
    .catch(err => {
      console.error('[schema-diff] Error comparing schemas:', err.message);
      process.exit(1);
    });
}

module.exports = runSchemaDiff;
