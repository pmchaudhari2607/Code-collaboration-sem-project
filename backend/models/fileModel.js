const { exec, toISOString, toNumber } = require('./helpers');
const { newId } = require('../utils/id');
const { withTransaction } = require('../db/transaction');

function formatFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    file_name: row.file_name,
    language: row.language,
    current_code: row.current_code,
    created_by: row.created_by,
    updated_by: row.updated_by || null,
    created_at: toISOString(row.created_at),
    updated_at: toISOString(row.updated_at)
  };
}

const { detectLanguage, getDefaultCode } = require('../utils/language');

async function validateLanguage(language, conn = null) {
  if (!language) return;
  const sql = 'SELECT name FROM languages WHERE name = ? AND is_file_language = 1 AND is_enabled = 1 LIMIT 1';
  const [rows] = await exec(sql, [language], conn);
  if (!rows || rows.length === 0) {
    const err = new Error('Invalid language');
    err.statusCode = 400;
    throw err;
  }
}

async function getProjectId(fileId, conn = null) {
  const sql = 'SELECT project_id FROM code_files WHERE id = ? LIMIT 1';
  const [rows] = await exec(sql, [fileId], conn);
  return rows[0]?.project_id || null;
}

async function listByProject(projectId, conn = null) {
  const sql = `
    SELECT
      f.id, f.project_id, f.file_name, f.language, f.current_code, f.created_by, f.updated_by, f.created_at, f.updated_at,
      u.full_name AS creator_name,
      COALESCE((SELECT MAX(version_number) FROM code_versions v WHERE v.file_id = f.id), 0) AS current_version_number,
      (SELECT COUNT(*) FROM reviews r WHERE r.file_id = f.id AND r.status = 'open') AS open_reviews_count
    FROM code_files f
    LEFT JOIN users u ON f.created_by = u.id
    WHERE f.project_id = ?
    ORDER BY f.created_at ASC
  `;
  const [rows] = await exec(sql, [projectId], conn);
  return rows.map(f => ({
    id: f.id,
    project_id: f.project_id,
    file_name: f.file_name,
    language: f.language,
    current_code: f.current_code,
    created_by: f.created_by,
    updated_by: f.updated_by || null,
    created_at: toISOString(f.created_at),
    updated_at: toISOString(f.updated_at),
    currentVersionNumber: toNumber(f.current_version_number),
    openReviewsCount: toNumber(f.open_reviews_count),
    creatorName: f.creator_name || 'Unknown'
  }));
}

async function findById(fileId, role = null, conn = null) {
  const sql = `
    SELECT
      f.id, f.project_id, f.file_name, f.language, f.current_code, f.created_by, f.updated_by, f.created_at, f.updated_at,
      u.full_name AS creator_name,
      p.name AS project_name
    FROM code_files f
    LEFT JOIN users u ON f.created_by = u.id
    LEFT JOIN projects p ON f.project_id = p.id
    WHERE f.id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [fileId], conn);
  if (!rows || rows.length === 0) return null;

  const f = rows[0];

  // Versions query
  const versionsSql = `
    SELECT v.id, v.file_id, v.version_number, v.code, v.note, v.created_by, v.created_at, u.full_name AS creator_name
    FROM code_versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.file_id = ?
    ORDER BY v.version_number DESC
  `;
  const [versionRows] = await exec(versionsSql, [fileId], conn);

  const versions = versionRows.map(v => ({
    id: v.id,
    file_id: v.file_id,
    version_number: toNumber(v.version_number),
    code: v.code,
    note: v.note || '',
    created_by: v.created_by,
    created_at: toISOString(v.created_at),
    creatorName: v.creator_name || 'Unknown'
  }));

  return {
    id: f.id,
    project_id: f.project_id,
    file_name: f.file_name,
    language: f.language,
    current_code: f.current_code,
    created_by: f.created_by,
    updated_by: f.updated_by || null,
    created_at: toISOString(f.created_at),
    updated_at: toISOString(f.updated_at),
    versions,
    userRole: role,
    creatorName: f.creator_name || 'Unknown',
    projectName: f.project_name || 'Unknown'
  };
}

async function createWithTransaction(projectId, dataOrName, ...args) {
  let data, userId, conn = null;
  if (typeof dataOrName === 'object' && dataOrName !== null) {
    data = dataOrName;
    userId = args[0];
    conn = args[1] || null;
  } else {
    // Positional: (projectId, fileName, language, code, userId, conn)
    data = {
      file_name: dataOrName,
      language: args[0],
      current_code: args[1]
    };
    userId = args[2];
    conn = args[3] || null;
  }

  const runner = async (c) => {
    if (!data.language) {
      data.language = detectLanguage(data.file_name);
    }
    await validateLanguage(data.language, c);

    // Duplicate check within project
    const [existing] = await c.query('SELECT id FROM code_files WHERE project_id = ? AND file_name = ? LIMIT 1', [projectId, data.file_name]);
    if (existing && existing.length > 0) {
      const err = new Error('File name already exists in this project');
      err.statusCode = 409;
      throw err;
    }

    let currentCode = data.current_code || '';
    if (!currentCode && data.language) {
      currentCode = getDefaultCode(data.language, data.file_name);
    }

    const fileId = data.id || newId('f');
    const versionId = newId('v');
    const activityId = newId('a');

    // 1. Insert code_files
    await c.query(`
      INSERT INTO code_files (id, project_id, file_name, language, current_code, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `, [fileId, projectId, data.file_name, data.language, currentCode, userId]);

    // 2. Insert initial Version 1
    await c.query(`
      INSERT INTO code_versions (id, file_id, version_number, code, note, created_by, created_at)
      VALUES (?, ?, 1, ?, 'Initial version', ?, UTC_TIMESTAMP())
    `, [versionId, fileId, currentCode, userId]);

    // 3. Log activity
    await c.query(`
      INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
      VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
    `, [activityId, projectId, userId, `created file ${data.file_name}.`]);

    const file = await findById(fileId, 'owner', c);
    return file;
  };

  if (conn) {
    return runner(conn);
  }
  return withTransaction(runner);
}

async function updateDraftCode(fileId, code, updatedBy = null, conn = null) {
  const sql = `
    UPDATE code_files
    SET current_code = ?, updated_by = ?, updated_at = UTC_TIMESTAMP()
    WHERE id = ?
  `;
  await exec(sql, [code, updatedBy, fileId], conn);
  const [rows] = await exec('SELECT * FROM code_files WHERE id = ?', [fileId], conn);
  return formatFile(rows[0]);
}

async function deleteWithTransaction(fileId, userId, conn = null) {
  const runner = async (c) => {
    const [fileRows] = await c.query('SELECT project_id, file_name, created_by FROM code_files WHERE id = ?', [fileId]);
    if (!fileRows || fileRows.length === 0) {
      const err = new Error('File not found');
      err.statusCode = 404;
      throw err;
    }
    const file = fileRows[0];

    // 1. Collect review and version ids
    const [reviews] = await c.query('SELECT id FROM reviews WHERE file_id = ?', [fileId]);
    const reviewIds = reviews.map(r => r.id);

    const [versions] = await c.query('SELECT id FROM code_versions WHERE file_id = ?', [fileId]);
    const versionIds = versions.map(v => v.id);

    // 2. Nullify tasks.review_id so tasks survive
    if (reviewIds.length > 0) {
      const placeholders = reviewIds.map(() => '?').join(',');
      await c.query(`UPDATE tasks SET review_id = NULL WHERE review_id IN (${placeholders})`, reviewIds);
    }

    // 3. Remove polymorphic notifications referencing reviews or versions
    if (reviewIds.length > 0) {
      const rPlaceholders = reviewIds.map(() => '?').join(',');
      await c.query(`DELETE FROM notifications WHERE type IN ('review', 'resolution') AND reference_id IN (${rPlaceholders})`, reviewIds);
    }
    if (versionIds.length > 0) {
      const vPlaceholders = versionIds.map(() => '?').join(',');
      await c.query(`DELETE FROM notifications WHERE type = 'version' AND reference_id IN (${vPlaceholders})`, versionIds);
    }

    // 4. Delete code_files (InnoDB cascades to code_versions and reviews)
    await c.query('DELETE FROM code_files WHERE id = ?', [fileId]);

    // 5. Log activity
    const activityId = newId('a');
    await c.query(`
      INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
      VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
    `, [activityId, file.project_id, userId || file.created_by, `deleted file ${file.file_name}.`]);

    return true;
  };

  if (conn) {
    return runner(conn);
  }
  return withTransaction(runner);
}

module.exports = {
  getProjectId,
  listByProject,
  findById,
  createWithTransaction,
  updateDraftCode,
  deleteWithTransaction,
  detectLanguage,
  getDefaultCode
};
