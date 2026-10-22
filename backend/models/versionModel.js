const { exec, toISOString, toNumber } = require('./helpers');
const { newId } = require('../utils/id');
const { withTransaction } = require('../db/transaction');

function formatVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    file_id: row.file_id,
    version_number: toNumber(row.version_number),
    code: row.code,
    note: row.note || '',
    created_by: row.created_by,
    created_at: toISOString(row.created_at),
    creatorName: row.creator_name || 'Unknown'
  };
}

async function listByFile(fileId, conn = null) {
  const sql = `
    SELECT v.id, v.file_id, v.version_number, v.code, v.note, v.created_by, v.created_at, u.full_name AS creator_name
    FROM code_versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.file_id = ?
    ORDER BY v.version_number DESC
  `;
  const [rows] = await exec(sql, [fileId], conn);
  return rows.map(formatVersion);
}

async function findById(id, conn = null) {
  const sql = `
    SELECT v.id, v.file_id, v.version_number, v.code, v.note, v.created_by, v.created_at, u.full_name AS creator_name
    FROM code_versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [id], conn);
  if (!rows || rows.length === 0) return null;
  return formatVersion(rows[0]);
}

async function createWithTransaction(fileId, dataOrCode, ...args) {
  let code, note, userId, conn = null;
  if (typeof dataOrCode === 'object' && dataOrCode !== null) {
    code = dataOrCode.code;
    note = dataOrCode.note;
    userId = args[0];
    conn = args[1] || null;
  } else {
    // Positional: (fileId, code, note, userId, conn)
    code = dataOrCode;
    note = args[0];
    userId = args[1];
    conn = args[2] || null;
  }

  const runner = async (c) => {
    // 1. Pessimistic lock on the file row to prevent version concurrency races
    const [fileRows] = await c.query(
      'SELECT id, project_id, file_name FROM code_files WHERE id = ? FOR UPDATE',
      [fileId]
    );
    if (!fileRows || fileRows.length === 0) {
      const err = new Error('File not found');
      err.statusCode = 404;
      throw err;
    }
    const file = fileRows[0];

    // 2. Next version calculation
    const [verResult] = await c.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM code_versions WHERE file_id = ?',
      [fileId]
    );
    const nextVerNum = verResult[0].next_version;

    const versionId = newId('v');
    const versionNote = (note || '').trim();

    // 3. Insert immutable version record
    await c.query(`
      INSERT INTO code_versions (id, file_id, version_number, code, note, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
    `, [versionId, fileId, nextVerNum, code, versionNote, userId]);

    // 4. Update working draft in code_files
    await c.query(`
      UPDATE code_files
      SET current_code = ?, updated_by = ?, updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `, [code, userId, fileId]);

    // 5. Activity log
    const activityId = newId('a');
    await c.query(`
      INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
      VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
    `, [activityId, file.project_id, userId, `created Version ${nextVerNum} of ${file.file_name}.`]);

    // 6. Notifications for project owner and collaborators (excluding author)
    const [actorRows] = await c.query('SELECT full_name FROM users WHERE id = ?', [userId]);
    const actorName = actorRows[0]?.full_name || 'Someone';

    const [members] = await c.query(`
      SELECT user_id FROM project_members
      WHERE project_id = ? AND status = 'accepted' AND user_id <> ?
    `, [file.project_id, userId]);

    for (const m of members) {
      const notifId = newId('n');
      await c.query(`
        INSERT INTO notifications (id, user_id, actor_id, project_id, type, reference_id, message, is_read, created_at)
        VALUES (?, ?, ?, ?, 'version', ?, ?, 0, UTC_TIMESTAMP())
      `, [notifId, m.user_id, userId, file.project_id, versionId, `${actorName} created Version ${nextVerNum} of ${file.file_name}`]);
    }

    return findById(versionId, c);
  };

  if (conn) {
    return runner(conn);
  }
  return withTransaction(runner);
}

module.exports = {
  listByFile,
  findById,
  createWithTransaction
};
