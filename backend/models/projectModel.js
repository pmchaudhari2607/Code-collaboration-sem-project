const { exec, toISOString, toNumber } = require('./helpers');
const { newId } = require('../utils/id');
const { withTransaction } = require('../db/transaction');
const memberModel = require('./memberModel');

function formatProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    visibility: row.visibility,
    category: row.category,
    owner_id: row.owner_id,
    created_at: toISOString(row.created_at),
    updated_at: toISOString(row.updated_at)
  };
}

async function validateCategory(category, conn = null) {
  if (!category) return;
  const sql = 'SELECT name FROM languages WHERE name = ? AND is_enabled = 1 LIMIT 1';
  const [rows] = await exec(sql, [category], conn);
  if (!rows || rows.length === 0) {
    const err = new Error('Invalid category');
    err.statusCode = 400;
    throw err;
  }
}

async function listAccessible(userId, conn = null) {
  // DESIGN.md Section 10.2: Accessible projects with aggregate counts
  const sql = `
    SELECT
      p.id,
      p.owner_id,
      p.name,
      p.description,
      p.visibility,
      p.category,
      p.created_at,
      p.updated_at,
      CASE
        WHEN p.owner_id = ? THEN 'owner'
        WHEN pm.role = 'collaborator' AND pm.status = 'accepted' THEN 'collaborator'
        WHEN p.visibility = 'public' THEN 'viewer'
        ELSE NULL
      END AS user_role,
      (SELECT COUNT(*) FROM code_files f WHERE f.project_id = p.id) AS files_count,
      (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id AND m.status = 'accepted') AS members_count,
      (SELECT COUNT(*) FROM reviews r JOIN code_files f ON r.file_id = f.id WHERE f.project_id = p.id AND r.status = 'open') AS open_reviews_count
    FROM projects p
    LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
    WHERE p.visibility = 'public'
       OR p.owner_id = ?
       OR (pm.status = 'accepted')
    ORDER BY p.updated_at DESC
  `;
  const [rows] = await exec(sql, [userId, userId, userId], conn);

  const projects = [];
  for (const r of rows) {
    const isOwner = r.owner_id === userId;
    const members = await memberModel.listByProject(r.id, isOwner, conn);
    projects.push({
      id: r.id,
      name: r.name,
      description: r.description || '',
      visibility: r.visibility,
      category: r.category,
      owner_id: r.owner_id,
      created_at: toISOString(r.created_at),
      updated_at: toISOString(r.updated_at),
      filesCount: toNumber(r.files_count),
      files_count: toNumber(r.files_count),
      membersCount: toNumber(r.members_count),
      members_count: toNumber(r.members_count),
      openReviewsCount: toNumber(r.open_reviews_count),
      open_reviews_count: toNumber(r.open_reviews_count),
      userRole: r.user_role,
      user_role: r.user_role,
      members
    });
  }

  return projects;
}

async function findById(id, userId, conn = null) {
  const sql = `
    SELECT
      p.id, p.owner_id, p.name, p.description, p.visibility, p.category, p.created_at, p.updated_at
    FROM projects p
    WHERE p.id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [id], conn);
  if (!rows || rows.length === 0) return null;

  const project = formatProject(rows[0]);
  const userRole = await memberModel.getRole(id, userId, conn);
  const isOwner = project.owner_id === userId;
  const members = await memberModel.listByProject(id, isOwner, conn);

  // Files query
  const filesSql = `
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
  const [fileRows] = await exec(filesSql, [id], conn);

  const files = fileRows.map(f => ({
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

  return {
    ...project,
    userRole,
    files,
    members
  };
}

async function createWithTransaction(projectData, userId, conn = null) {
  const runner = async (c) => {
    await validateCategory(projectData.category, c);

    const projectId = projectData.id || newId('p');
    const memberId = newId('m');
    const activityId = newId('a');

    const insertProjectSql = `
      INSERT INTO projects (id, owner_id, name, description, visibility, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `;
    await c.query(insertProjectSql, [
      projectId,
      userId,
      projectData.name.trim(),
      (projectData.description || '').trim(),
      projectData.visibility || 'public',
      projectData.category || 'Mixed'
    ]);

    // Insert owner member row (PRD BR-002 & Locked Decision 4)
    const insertMemberSql = `
      INSERT INTO project_members (id, project_id, user_id, role, status, joined_at, created_at, updated_at)
      VALUES (?, ?, ?, 'owner', 'accepted', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `;
    await c.query(insertMemberSql, [memberId, projectId, userId]);

    // Insert activity log
    const insertActivitySql = `
      INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
      VALUES (?, ?, ?, 'created the project.', UTC_TIMESTAMP())
    `;
    await c.query(insertActivitySql, [activityId, projectId, userId]);

    const [rows] = await c.query('SELECT * FROM projects WHERE id = ?', [projectId]);
    return formatProject(rows[0]);
  };

  if (conn) {
    return runner(conn);
  }
  return withTransaction(runner);
}

async function update(id, patch, conn = null) {
  if (patch.category !== undefined) {
    await validateCategory(patch.category, conn);
  }

  const allowed = ['name', 'description', 'visibility', 'category'];
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

  const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;
  await exec(sql, values, conn);

  const [rows] = await exec('SELECT * FROM projects WHERE id = ?', [id], conn);
  return formatProject(rows[0]);
}

async function deleteWithTransaction(id, conn = null) {
  const runner = async (c) => {
    const [result] = await c.query('DELETE FROM projects WHERE id = ?', [id]);
    return result.affectedRows > 0;
  };

  if (conn) {
    return runner(conn);
  }
  return withTransaction(runner);
}

module.exports = {
  validateCategory,
  listAccessible,
  findById,
  createWithTransaction,
  update,
  deleteWithTransaction
};
