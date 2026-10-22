const { exec, toNumber } = require('./helpers');
const activityModel = require('./activityModel');

/**
 * Get dashboard stats for a user.
 * Bounded query returning aggregate counts cast to JavaScript numbers.
 */
exports.getStats = async (userId, conn = null) => {
  const sql = `
    SELECT
      COUNT(DISTINCT p.id) AS totalProjects,
      COUNT(DISTINCT CASE WHEN p.owner_id = ? THEN p.id END) AS ownedProjects,
      (
        SELECT COUNT(*)
        FROM code_files cf
        JOIN projects p2 ON p2.id = cf.project_id
        WHERE (
          p2.owner_id = ?
          OR p2.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM project_members pm2
            WHERE pm2.project_id = p2.id AND pm2.user_id = ? AND pm2.status = 'accepted'
          )
        )
      ) AS totalFiles,
      (
        SELECT COUNT(*)
        FROM reviews r
        JOIN code_files cf2 ON cf2.id = r.file_id
        JOIN projects p3 ON p3.id = cf2.project_id
        WHERE r.status = 'open' AND (
          p3.owner_id = ?
          OR p3.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM project_members pm3
            WHERE pm3.project_id = p3.id AND pm3.user_id = ? AND pm3.status = 'accepted'
          )
        )
      ) AS openReviews,
      (
        SELECT COUNT(*)
        FROM tasks t
        JOIN projects p4 ON p4.id = t.project_id
        WHERE t.status != 'completed' AND (
          p4.owner_id = ?
          OR p4.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM project_members pm4
            WHERE pm4.project_id = p4.id AND pm4.user_id = ? AND pm4.status = 'accepted'
          )
        )
      ) AS pendingTasks
    FROM projects p
    WHERE (
      p.owner_id = ?
      OR p.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = ? AND pm.status = 'accepted'
      )
    )
  `;

  const params = [
    userId, // for ownedProjects CASE
    userId, userId, // for totalFiles subquery
    userId, userId, // for openReviews subquery
    userId, userId, // for pendingTasks subquery
    userId, userId  // for main FROM projects WHERE
  ];

  const [rows] = await exec(sql, params, conn);
  const row = rows[0] || {};

  const total = toNumber(row.totalProjects);
  const owned = toNumber(row.ownedProjects);
  const collab = Math.max(0, total - owned);

  return {
    totalProjects: total,
    ownedProjects: owned,
    collabProjects: collab,
    totalFiles: toNumber(row.totalFiles),
    openReviews: toNumber(row.openReviews),
    pendingTasks: toNumber(row.pendingTasks)
  };
};

/**
 * Get dashboard activity feed for a user.
 */
exports.getActivity = async (userId, limit = 10, conn = null) => {
  return activityModel.listForDashboard(userId, limit, conn);
};
