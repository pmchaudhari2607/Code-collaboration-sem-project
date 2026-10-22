const { exec, toISOString } = require('./helpers');
const { newId } = require('../utils/id');

function formatUser(row, includePassword = false) {
  if (!row) return null;
  const user = {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    email: row.email,
    bio: row.bio || null,
    created_at: toISOString(row.created_at)
  };
  if (row.updated_at) {
    user.updated_at = toISOString(row.updated_at);
  }
  if (includePassword) {
    user.password = row.password_hash;
    user.password_hash = row.password_hash;
  }
  return user;
}

async function findAuthByIdentifier(identifier, conn = null) {
  const sql = `
    SELECT id, full_name, username, email, password_hash, bio, created_at, updated_at
    FROM users
    WHERE username = ? OR email = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [identifier, identifier], conn);
  if (!rows || rows.length === 0) return null;
  return formatUser(rows[0], true);
}

async function findById(id, conn = null) {
  const sql = `
    SELECT id, full_name, username, email, bio, created_at, updated_at
    FROM users
    WHERE id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [id], conn);
  if (!rows || rows.length === 0) return null;
  return formatUser(rows[0], false);
}

async function findByUsernameOrEmail(username, email, excludeUserId = null, conn = null) {
  let sql = 'SELECT id, username, email FROM users WHERE (username = ? OR email = ?)';
  const params = [username, email];
  if (excludeUserId) {
    sql += ' AND id <> ?';
    params.push(excludeUserId);
  }
  sql += ' LIMIT 1';
  const [rows] = await exec(sql, params, conn);
  return rows[0] || null;
}

async function create(data, conn = null) {
  const id = data.id || newId('u');
  const sql = `
    INSERT INTO users (id, full_name, username, email, password_hash, bio, created_at)
    VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
  `;
  await exec(sql, [
    id,
    data.full_name,
    data.username,
    data.email,
    data.password_hash || data.password,
    data.bio || null
  ], conn);
  return findById(id, conn);
}

async function update(id, patch, conn = null) {
  const allowed = ['full_name', 'email', 'bio'];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(patch[key]);
    }
  }

  if (fields.length === 0) {
    const err = new Error('No valid fields provided for update');
    err.statusCode = 400;
    throw err;
  }

  fields.push('updated_at = UTC_TIMESTAMP()');
  values.push(id);

  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  await exec(sql, values, conn);
  return findById(id, conn);
}

async function list(conn = null) {
  const sql = `
    SELECT id, full_name, username, bio, created_at
    FROM users
    ORDER BY created_at ASC
  `;
  const [rows] = await exec(sql, [], conn);
  return rows.map(r => ({
    id: r.id,
    full_name: r.full_name,
    username: r.username,
    bio: r.bio || null,
    created_at: toISOString(r.created_at)
  }));
}

async function search(query, reqUserId, conn = null) {
  const term = `%${query.toLowerCase()}%`;
  const sql = `
    SELECT id, full_name, username, bio, created_at
    FROM users
    WHERE id <> ? AND (LOWER(username) LIKE ? OR LOWER(full_name) LIKE ?)
    ORDER BY full_name ASC
  `;
  const [rows] = await exec(sql, [reqUserId, term, term], conn);
  return rows.map(r => ({
    id: r.id,
    full_name: r.full_name,
    username: r.username,
    bio: r.bio || null,
    created_at: toISOString(r.created_at)
  }));
}

async function findAuthById(id, conn = null) {
  const sql = `
    SELECT id, full_name, username, email, password_hash, bio, created_at, updated_at
    FROM users
    WHERE id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [id], conn);
  if (!rows || rows.length === 0) return null;
  return formatUser(rows[0], true);
}

async function deleteAccount(userId, conn) {
  // Pre-checks for active contributions in other users' projects
  const [foreignFiles] = await conn.query(
    `SELECT COUNT(*) as count FROM code_files f
     JOIN projects p ON f.project_id = p.id
     WHERE f.created_by = ? AND p.owner_id <> ?`,
    [userId, userId]
  );
  if (foreignFiles[0].count > 0) {
    const err = new Error('Cannot delete account: You have contributed code files in projects owned by other users. Those contributions cannot be silently deleted to protect their projects.');
    err.statusCode = 409;
    throw err;
  }

  const [foreignVersions] = await conn.query(
    `SELECT COUNT(*) as count FROM code_versions v
     JOIN code_files f ON v.file_id = f.id
     JOIN projects p ON f.project_id = p.id
     WHERE v.created_by = ? AND p.owner_id <> ?`,
    [userId, userId]
  );
  if (foreignVersions[0].count > 0) {
    const err = new Error('Cannot delete account: You have committed code versions in projects owned by other users. Those contributions cannot be silently deleted to protect their projects.');
    err.statusCode = 409;
    throw err;
  }

  const [foreignReviews] = await conn.query(
    `SELECT COUNT(*) as count FROM reviews r
     JOIN code_files f ON r.file_id = f.id
     JOIN projects p ON f.project_id = p.id
     WHERE r.reviewer_id = ? AND p.owner_id <> ?`,
    [userId, userId]
  );
  if (foreignReviews[0].count > 0) {
    const err = new Error('Cannot delete account: You have written code reviews in projects owned by other users. To preserve review history, your account cannot be deleted while those reviews remain active.');
    err.statusCode = 409;
    throw err;
  }

  const [foreignTasks] = await conn.query(
    `SELECT COUNT(*) as count FROM tasks t
     JOIN projects p ON t.project_id = p.id
     WHERE t.created_by = ? AND p.owner_id <> ?`,
    [userId, userId]
  );
  if (foreignTasks[0].count > 0) {
    const err = new Error('Cannot delete account: You have created tasks in projects owned by other users. To preserve project tracking, your account cannot be deleted while those tasks remain active.');
    err.statusCode = 409;
    throw err;
  }

  // Delete all projects owned by the user (cascades to all files, versions, reviews, tasks, members, notifications, activity_log, messages in those projects)
  await conn.query('DELETE FROM projects WHERE owner_id = ?', [userId]);

  // Clean user activity records
  await conn.query('DELETE FROM activity_log WHERE user_id = ?', [userId]);

  // Clean messages sent by user in other projects
  await conn.query('DELETE FROM messages WHERE sender_id = ?', [userId]);

  // Clean notifications for this user
  await conn.query('DELETE FROM notifications WHERE user_id = ?', [userId]);

  // Clean remaining memberships in other projects
  await conn.query('DELETE FROM project_members WHERE user_id = ?', [userId]);

  // Clean user settings
  await conn.query('DELETE FROM user_settings WHERE user_id = ?', [userId]);

  // Delete the user record
  const [res] = await conn.query('DELETE FROM users WHERE id = ?', [userId]);
  return res.affectedRows > 0;
}

module.exports = {
  findAuthByIdentifier,
  findById,
  findAuthById,
  findByUsernameOrEmail,
  create,
  update,
  updateProfile: update,
  list,
  listAll: list,
  search,
  deleteAccount
};
