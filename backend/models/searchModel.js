const { exec, toBool, toISOString } = require('./helpers');

/**
 * Global search across accessible projects, files, and other users.
 */
exports.globalSearch = async (q, userId, conn = null) => {
  const query = (q || '').trim().toLowerCase();
  if (!query) {
    return { projects: [], files: [], users: [] };
  }

  const likePattern = `%${query}%`;

  // 1. Accessible projects matching name
  const [projectRows] = await exec(
    `SELECT p.id, p.name, p.description, p.category, p.visibility,
            p.owner_id, p.created_at, p.updated_at
     FROM projects p
     WHERE (
       p.owner_id = ?
       OR p.visibility = 'public'
       OR EXISTS (
         SELECT 1 FROM project_members pm
         WHERE pm.project_id = p.id AND pm.user_id = ? AND pm.status = 'accepted'
       )
     )
     AND LOWER(p.name) LIKE ?
     ORDER BY p.name ASC`,
    [userId, userId, likePattern],
    conn
  );

  const projects = projectRows.map(p => ({
    ...p,
    created_at: toISOString(p.created_at),
    updated_at: toISOString(p.updated_at)
  }));

  // 2. Files in accessible projects matching file_name
  const [fileRows] = await exec(
    `SELECT cf.id, cf.project_id, cf.file_name, cf.language,
            cf.current_code, cf.created_by, cf.created_at, cf.updated_at,
            p.name AS projectName
     FROM code_files cf
     JOIN projects p ON p.id = cf.project_id
     WHERE (
       p.owner_id = ?
       OR p.visibility = 'public'
       OR EXISTS (
         SELECT 1 FROM project_members pm
         WHERE pm.project_id = p.id AND pm.user_id = ? AND pm.status = 'accepted'
       )
     )
     AND LOWER(cf.file_name) LIKE ?
     ORDER BY cf.file_name ASC`,
    [userId, userId, likePattern],
    conn
  );

  const files = fileRows.map(f => ({
    ...f,
    created_at: toISOString(f.created_at),
    updated_at: toISOString(f.updated_at)
  }));

  // 3. Other users matching username or full_name (excluding password & email)
  const [userRows] = await exec(
    `SELECT u.id, u.username, u.full_name, u.bio, u.created_at, u.updated_at
     FROM users u
     WHERE u.id != ?
       AND (LOWER(u.username) LIKE ? OR LOWER(u.full_name) LIKE ?)
     ORDER BY u.username ASC`,
    [userId, likePattern, likePattern],
    conn
  );

  const users = userRows.map(u => ({
    ...u,
    created_at: toISOString(u.created_at),
    updated_at: toISOString(u.updated_at)
  }));

  return { projects, files, users };
};
