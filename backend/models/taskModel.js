const { exec, toISOString } = require('./helpers');
const { newId } = require('../utils/id');

function formatTask(row, callerRole = null) {
  if (!row) return null;
  const canEdit = callerRole === 'owner' || callerRole === 'collaborator' || row.can_edit === 1;
  return {
    id: row.id,
    project_id: row.project_id,
    review_id: row.review_id || null,
    title: row.title,
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    assigned_to: row.assigned_to || null,
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : null,
    completed_at: toISOString(row.completed_at),
    created_by: row.created_by,
    created_at: toISOString(row.created_at),
    updated_at: toISOString(row.updated_at),
    projectName: row.project_name || 'Unknown',
    assigneeName: row.assignee_name || null,
    canEdit: Boolean(canEdit)
  };
}

async function getProjectId(taskId, conn = null) {
  const sql = 'SELECT project_id FROM tasks WHERE id = ? LIMIT 1';
  const [rows] = await exec(sql, [taskId], conn);
  return rows[0]?.project_id || null;
}

async function findById(id, conn = null) {
  const sql = `
    SELECT
      t.*,
      p.name AS project_name,
      u.full_name AS assignee_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [id], conn);
  if (!rows || rows.length === 0) return null;
  return formatTask(rows[0]);
}

async function list(arg1, arg2 = null, conn = null) {
  let userId, projectId;
  if (typeof arg1 === 'object' && arg1 !== null) {
    projectId = arg1.projectId || arg1.project_id || null;
    userId = arg2;
  } else {
    userId = arg1;
    projectId = arg2;
  }

  let projectFilter = '';
  const params = [userId, userId, userId];

  if (projectId) {
    projectFilter = 'AND p.id = ?';
    params.push(projectId);
  }

  const sql = `
    SELECT
      t.*,
      p.name AS project_name,
      u.full_name AS assignee_name,
      CASE
        WHEN p.owner_id = ? OR (pm.role = 'collaborator' AND pm.status = 'accepted') THEN 1
        ELSE 0
      END AS can_edit
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE (p.visibility = 'public' OR p.owner_id = ? OR pm.status = 'accepted')
      ${projectFilter}
    ORDER BY t.created_at DESC
  `;
  const [rows] = await exec(sql, params, conn);
  return rows.map(r => formatTask(r));
}

async function create(dataOrProjectId, ...args) {
  let projectId, reviewId, title, description, status, priority, assignedTo, dueDate, userId, conn = null, id = null;

  if (typeof dataOrProjectId === 'object' && dataOrProjectId !== null) {
    const data = dataOrProjectId;
    id = data.id || newId('t');
    projectId = data.project_id;
    reviewId = data.review_id || null;
    title = (data.title || '').trim();
    description = (data.description || '').trim();
    status = data.status || 'todo';
    priority = data.priority || 'medium';
    assignedTo = data.assigned_to || null;
    dueDate = data.due_date || null;
    userId = args[0];
    conn = args[1] || null;
  } else {
    // Positional: (projectId, title, userId, extra, conn)
    id = newId('t');
    projectId = dataOrProjectId;
    title = (args[0] || '').trim();
    userId = args[1];
    const extra = args[2] || {};
    reviewId = extra.review_id || null;
    description = (extra.description || '').trim();
    status = extra.status || 'todo';
    priority = extra.priority || 'medium';
    assignedTo = extra.assigned_to || null;
    dueDate = extra.due_date || null;
    conn = args[3] || null;
  }

  const sql = `
    INSERT INTO tasks (
      id, project_id, review_id, title, description, status, priority,
      assigned_to, due_date, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `;
  await exec(sql, [
    id,
    projectId,
    reviewId,
    title,
    description,
    status,
    priority,
    assignedTo,
    dueDate,
    userId
  ], conn);

  // Activity log
  const activityId = newId('a');
  await exec(`
    INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
    VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
  `, [activityId, projectId, userId, `created task: ${title}.`], conn);

  // Notification for assignee if assigned to another user
  if (assignedTo && assignedTo !== userId) {
    const [actorRows] = await exec('SELECT full_name FROM users WHERE id = ?', [userId], conn);
    const actorName = actorRows[0]?.full_name || 'Someone';
    const notifId = newId('n');
    await exec(`
      INSERT INTO notifications (id, user_id, actor_id, project_id, type, reference_id, message, is_read, created_at)
      VALUES (?, ?, ?, ?, 'task', ?, ?, 0, UTC_TIMESTAMP())
    `, [notifId, assignedTo, userId, projectId, id, `${actorName} assigned you a task: ${title}`], conn);
  }

  return findById(id, conn);
}

async function update(taskId, patch, userId, conn = null) {
  const allowed = ['title', 'description', 'status', 'priority', 'assigned_to', 'due_date'];
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

  if (patch.status === 'completed') {
    fields.push('completed_at = UTC_TIMESTAMP()');
  } else if (patch.status !== undefined) {
    fields.push('completed_at = NULL');
  }

  fields.push('updated_at = UTC_TIMESTAMP()');
  values.push(taskId);

  const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`;
  await exec(sql, values, conn);

  const updated = await findById(taskId, conn);

  if (updated) {
    const activityId = newId('a');
    await exec(`
      INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
      VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
    `, [activityId, updated.project_id, userId, `updated task: ${updated.title}.`], conn);
  }

  return updated;
}

async function remove(id, conn = null) {
  const [result] = await exec('DELETE FROM tasks WHERE id = ?', [id], conn);
  return result.affectedRows > 0;
}

module.exports = {
  getProjectId,
  findById,
  list,
  create,
  update,
  remove
};
