const { exec, toISOString, toBool } = require('./helpers');
const { newId } = require('../utils/id');

function computeLink(type, referenceId, projectId) {
  if (!projectId) return '#';
  switch (type) {
    case 'invitation':
      return `/projects/${projectId}`;
    case 'review':
    case 'resolution':
    case 'version':
      return `/projects/${projectId}/code`;
    case 'task':
      return `/projects/${projectId}/tasks`;
    default:
      return `/projects/${projectId}`;
  }
}

function formatNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    actor_id: row.actor_id || null,
    project_id: row.project_id || null,
    type: row.type,
    reference_id: row.reference_id || null,
    message: row.message,
    is_read: toBool(row.is_read),
    created_at: toISOString(row.created_at),
    projectName: row.project_name || null,
    link: computeLink(row.type, row.reference_id, row.project_id),
    memberContext: typeof row.member_context === 'string' ? JSON.parse(row.member_context) : (row.member_context || null)
  };
}

async function findById(id, conn = null) {
  const sql = `
    SELECT
      n.*,
      p.name AS project_name
    FROM notifications n
    LEFT JOIN projects p ON n.project_id = p.id
    WHERE n.id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [id], conn);
  if (!rows || rows.length === 0) return null;
  return formatNotification(rows[0]);
}

async function listByUser(userId, conn = null) {
  const sql = `
    SELECT
      n.*,
      p.name AS project_name,
      CASE
        WHEN n.type = 'invitation' THEN (
          SELECT JSON_OBJECT(
            'id', pm.id,
            'project_id', pm.project_id,
            'user_id', pm.user_id,
            'role', pm.role,
            'status', pm.status
          )
          FROM project_members pm
          WHERE pm.id = n.reference_id
        )
        ELSE NULL
      END AS member_context
    FROM notifications n
    LEFT JOIN projects p ON n.project_id = p.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
  `;
  const [rows] = await exec(sql, [userId], conn);
  return rows.map(formatNotification);
}

async function markRead(id, userId, conn = null) {
  const sql = `
    UPDATE notifications
    SET is_read = 1
    WHERE id = ? AND user_id = ?
  `;
  const [result] = await exec(sql, [id, userId], conn);
  return result.affectedRows;
}

async function markAllRead(userId, conn = null) {
  const sql = `
    UPDATE notifications
    SET is_read = 1
    WHERE user_id = ? AND is_read = 0
  `;
  const [result] = await exec(sql, [userId], conn);
  return result.affectedRows;
}

async function create(arg1, arg2, arg3, arg4, arg5) {
  let data = {};
  let conn = null;

  if (typeof arg1 === 'object' && arg1 !== null) {
    data = arg1;
    conn = arg2 || null;
  } else {
    const userId = arg1;
    const type = arg2;
    const message = arg3;
    let opts = {};
    if (typeof arg4 === 'object' && arg4 !== null && !(arg4.query || arg4.execute)) {
      opts = arg4;
      conn = arg5 || null;
    } else if (arg4 && (arg4.query || arg4.execute)) {
      conn = arg4;
    }
    data = {
      user_id: userId,
      type,
      message,
      actor_id: opts.actor_id || opts.actorId || null,
      project_id: opts.project_id || opts.projectId || null,
      reference_id: opts.reference_id || opts.referenceId || null,
      is_read: opts.is_read || opts.isRead || false,
      id: opts.id
    };
  }

  const id = data.id || newId('n');
  const sql = `
    INSERT INTO notifications (
      id, user_id, actor_id, project_id, type, reference_id, message, is_read, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP()
    )
  `;
  await exec(sql, [
    id,
    data.user_id,
    data.actor_id || null,
    data.project_id || null,
    data.type,
    data.reference_id || null,
    data.message,
    data.is_read ? 1 : 0
  ], conn);
  return findById(id, conn);
}

module.exports = {
  findById,
  listByUser,
  markRead,
  markAllRead,
  create
};
