const { exec, toISOString } = require('./helpers');
const { newId } = require('../utils/id');

function formatMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    role: row.role,
    status: row.status,
    invited_by: row.invited_by || null,
    joined_at: toISOString(row.joined_at),
    created_at: toISOString(row.created_at),
    updated_at: toISOString(row.updated_at),
    user_full_name: row.user_full_name || null,
    user_username: row.user_username || null
  };
}

async function getRole(projectId, userId, conn = null) {
  if (!projectId || !userId) return null;
  const sql = `
    SELECT
      p.id AS project_id,
      p.visibility,
      p.owner_id,
      CASE
        WHEN p.owner_id = ? THEN 'owner'
        WHEN pm.role = 'collaborator' AND pm.status = 'accepted' THEN 'collaborator'
        WHEN p.visibility = 'public' THEN 'viewer'
        ELSE NULL
      END AS role
    FROM projects p
    LEFT JOIN project_members pm
      ON p.id = pm.project_id AND pm.user_id = ?
    WHERE p.id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [userId, userId, projectId], conn);
  if (!rows || rows.length === 0) return null;
  return rows[0].role || null;
}

async function listByProject(projectId, includeAllStatuses = false, conn = null) {
  let statusCondition = '';
  if (!includeAllStatuses) {
    statusCondition = "AND pm.status = 'accepted'";
  }

  const sql = `
    SELECT
      pm.id,
      pm.project_id,
      pm.user_id,
      pm.role,
      pm.status,
      pm.invited_by,
      pm.joined_at,
      pm.created_at,
      pm.updated_at,
      u.full_name AS user_full_name,
      u.username AS user_username
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ? ${statusCondition}
    ORDER BY CASE WHEN pm.role = 'owner' THEN 0 ELSE 1 END, pm.created_at ASC
  `;
  const [rows] = await exec(sql, [projectId], conn);
  return rows.map(formatMember);
}

async function findByProjectAndUser(projectId, userId, conn = null) {
  const sql = `
    SELECT
      pm.id, pm.project_id, pm.user_id, pm.role, pm.status, pm.invited_by,
      pm.joined_at, pm.created_at, pm.updated_at,
      u.full_name AS user_full_name, u.username AS user_username
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ? AND pm.user_id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [projectId, userId], conn);
  if (!rows || rows.length === 0) return null;
  return formatMember(rows[0]);
}

async function findById(id, conn = null) {
  const sql = `
    SELECT
      pm.id, pm.project_id, pm.user_id, pm.role, pm.status, pm.invited_by,
      pm.joined_at, pm.created_at, pm.updated_at,
      u.full_name AS user_full_name, u.username AS user_username
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [id], conn);
  if (!rows || rows.length === 0) return null;
  return formatMember(rows[0]);
}

async function create(data, conn = null) {
  const id = data.id || newId('m');
  const role = data.role || 'collaborator';
  const status = data.status || 'pending';
  const joinedAt = status === 'accepted' ? (data.joined_at ? new Date(data.joined_at) : new Date()) : null;

  const sql = `
    INSERT INTO project_members (id, project_id, user_id, role, status, invited_by, joined_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
  `;
  await exec(sql, [
    id,
    data.project_id,
    data.user_id,
    role,
    status,
    data.invited_by || null,
    joinedAt
  ], conn);
  return findById(id, conn);
}

async function reInvite(memberId, inviterId, conn = null) {
  const sql = `
    UPDATE project_members
    SET status = 'pending',
        invited_by = ?,
        joined_at = NULL,
        updated_at = UTC_TIMESTAMP()
    WHERE id = ? AND status = 'rejected'
  `;
  const [result] = await exec(sql, [inviterId, memberId], conn);
  return result.affectedRows;
}

async function respondInvitation(memberId, userId, newStatus, conn = null) {
  const sql = `
    UPDATE project_members
    SET status = ?,
        joined_at = IF(? = 'accepted', UTC_TIMESTAMP(), NULL),
        updated_at = UTC_TIMESTAMP()
    WHERE id = ? AND user_id = ? AND status = 'pending'
  `;
  const [result] = await exec(sql, [newStatus, newStatus, memberId, userId], conn);
  return result.affectedRows;
}

async function remove(projectId, userId, conn = null) {
  // Enforce invariant: owner member row is never removable
  const [ownerRows] = await exec(
    'SELECT owner_id FROM projects WHERE id = ?',
    [projectId],
    conn
  );
  if (ownerRows.length > 0 && ownerRows[0].owner_id === userId) {
    const err = new Error('Cannot remove the project owner');
    err.statusCode = 400;
    throw err;
  }

  const sql = `
    DELETE FROM project_members
    WHERE project_id = ? AND user_id = ? AND role <> 'owner'
  `;
  const [result] = await exec(sql, [projectId, userId], conn);
  return result.affectedRows;
}

module.exports = {
  getRole,
  listByProject,
  findByProjectAndUser,
  findById,
  create,
  reInvite,
  respondInvitation,
  remove
};
