const { exec, toISOString } = require('./helpers');
const { newId } = require('../utils/id');

/**
 * Log an activity entry.
 */
exports.log = async (projectId, userId, actionText, conn = null) => {
  const id = newId('a');
  await exec(
    `INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
    [id, projectId, userId, actionText],
    conn
  );

  return exports.findById(id, conn);
};

/**
 * Find activity by ID.
 */
exports.findById = async (id, conn = null) => {
  const [rows] = await exec(
    `SELECT a.id, a.project_id, a.user_id, a.action_text, a.created_at,
            p.name AS projectName, u.full_name AS userName, u.full_name AS userFullName
     FROM activity_log a
     LEFT JOIN projects p ON p.id = a.project_id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.id = ?`,
    [id],
    conn
  );

  if (!rows.length) return null;
  return {
    ...rows[0],
    created_at: toISOString(rows[0].created_at)
  };
};

/**
 * List activities for a specific project.
 */
exports.listByProject = async (projectId, limit = 50, conn = null) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const [rows] = await exec(
    `SELECT a.id, a.project_id, a.user_id, a.action_text, a.created_at,
            p.name AS projectName, u.full_name AS userName, u.full_name AS userFullName
     FROM activity_log a
     JOIN projects p ON p.id = a.project_id
     JOIN users u ON u.id = a.user_id
     WHERE a.project_id = ?
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ${safeLimit}`,
    [projectId],
    conn
  );

  return rows.map(r => ({
    ...r,
    created_at: toISOString(r.created_at)
  }));
};

/**
 * List recent activities for all projects accessible to a user (dashboard activity feed).
 */
exports.listForDashboard = async (userId, limit = 10, conn = null) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
  const [rows] = await exec(
    `SELECT a.id, a.project_id, a.user_id, a.action_text, a.created_at,
            p.name AS projectName, u.full_name AS userName, u.full_name AS userFullName
     FROM activity_log a
     JOIN projects p ON p.id = a.project_id
     JOIN users u ON u.id = a.user_id
     WHERE (
       p.owner_id = ?
       OR p.visibility = 'public'
       OR EXISTS (
         SELECT 1 FROM project_members pm
         WHERE pm.project_id = p.id AND pm.user_id = ? AND pm.status = 'accepted'
       )
     )
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ${safeLimit}`,
    [userId, userId],
    conn
  );

  return rows.map(r => ({
    ...r,
    created_at: toISOString(r.created_at)
  }));
};
