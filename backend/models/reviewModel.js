const { exec, toISOString, toNumber } = require('./helpers');
const { newId } = require('../utils/id');

function formatReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    file_id: row.file_id,
    version_id: row.version_id,
    reviewer_id: row.reviewer_id,
    line_number: toNumber(row.line_number),
    review_type: row.review_type,
    comment: row.comment,
    status: row.status,
    reopened_at: toISOString(row.reopened_at),
    reopen_count: toNumber(row.reopen_count),
    resolved_by: row.resolved_by || null,
    resolved_at: toISOString(row.resolved_at),
    closed_by: row.closed_by || null,
    closed_at: toISOString(row.closed_at),
    created_at: toISOString(row.created_at),
    updated_at: toISOString(row.updated_at),
    reviewerName: row.reviewer_name || 'Unknown',
    projectName: row.project_name,
    fileName: row.file_name
  };
}

async function getProjectId(reviewId, conn = null) {
  const sql = `
    SELECT f.project_id
    FROM reviews r
    JOIN code_files f ON r.file_id = f.id
    WHERE r.id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [reviewId], conn);
  return rows[0]?.project_id || null;
}

async function findById(id, conn = null) {
  const sql = `
    SELECT
      r.*,
      u.full_name AS reviewer_name,
      f.file_name,
      p.name AS project_name
    FROM reviews r
    LEFT JOIN users u ON r.reviewer_id = u.id
    LEFT JOIN code_files f ON r.file_id = f.id
    LEFT JOIN projects p ON f.project_id = p.id
    WHERE r.id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [id], conn);
  if (!rows || rows.length === 0) return null;
  return formatReview(rows[0]);
}

async function listByFile(fileId, versionId = null, conn = null) {
  let sql = `
    SELECT
      r.*,
      u.full_name AS reviewer_name
    FROM reviews r
    LEFT JOIN users u ON r.reviewer_id = u.id
    WHERE r.file_id = ?
  `;
  const params = [fileId];

  if (versionId) {
    sql += ' AND r.version_id = ?';
    params.push(versionId);
  }

  sql += ' ORDER BY r.created_at ASC';
  const [rows] = await exec(sql, params, conn);
  return rows.map(formatReview);
}

async function listAll(userId, projectId = null, conn = null) {
  let projectFilter = '';
  const params = [userId, userId, userId];

  if (projectId) {
    projectFilter = 'AND p.id = ?';
    params.push(projectId);
  }

  const sql = `
    SELECT
      r.*,
      u.full_name AS reviewer_name,
      f.file_name,
      p.name AS project_name
    FROM reviews r
    JOIN code_files f ON r.file_id = f.id
    JOIN projects p ON f.project_id = p.id
    LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
    LEFT JOIN users u ON r.reviewer_id = u.id
    WHERE (p.visibility = 'public' OR p.owner_id = ? OR pm.status = 'accepted')
      ${projectFilter}
    ORDER BY r.created_at DESC
  `;
  const [rows] = await exec(sql, params, conn);
  return rows.map(formatReview);
}

async function create(dataOrFileId, ...args) {
  let fileId, versionId, userId, lineNumber, reviewType, comment, conn = null, id = null;

  if (typeof dataOrFileId === 'object' && dataOrFileId !== null) {
    const data = dataOrFileId;
    id = data.id || newId('r');
    fileId = data.file_id;
    versionId = data.version_id;
    userId = args[0];
    lineNumber = data.line_number;
    reviewType = data.review_type;
    comment = data.comment;
    conn = args[1] || null;
  } else {
    fileId = dataOrFileId;
    versionId = args[0];
    userId = args[1];
    lineNumber = args[2];
    reviewType = args[3];
    comment = args[4];
    id = newId('r');
  }

  if (!versionId) {
    const [verRows] = await exec(
      'SELECT id FROM code_versions WHERE file_id = ? ORDER BY version_number DESC LIMIT 1',
      [fileId],
      conn
    );
    if (verRows && verRows.length > 0) {
      versionId = verRows[0].id;
    }
  }

  const sql = `
    INSERT INTO reviews (
      id, file_id, version_id, reviewer_id, line_number, review_type, comment,
      status, reopen_count, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      'open', 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `;
  await exec(sql, [
    id,
    fileId,
    versionId,
    userId,
    lineNumber,
    reviewType,
    (comment || '').trim()
  ], conn);

  // Activity log & notification
  const [fileRows] = await exec('SELECT project_id, file_name, created_by FROM code_files WHERE id = ?', [fileId], conn);
  if (fileRows && fileRows.length > 0) {
    const file = fileRows[0];
    const activityId = newId('a');
    await exec(`
      INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
      VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
    `, [activityId, file.project_id, userId, `added a review on ${file.file_name}.`], conn);

    if (file.created_by !== userId) {
      const [userRows] = await exec('SELECT full_name FROM users WHERE id = ?', [userId], conn);
      const actorName = userRows[0]?.full_name || 'Someone';
      const notifId = newId('n');
      await exec(`
        INSERT INTO notifications (id, user_id, actor_id, project_id, type, reference_id, message, is_read, created_at)
        VALUES (?, ?, ?, ?, 'review', ?, ?, 0, UTC_TIMESTAMP())
      `, [notifId, file.created_by, userId, file.project_id, id, `${actorName} left a review on your file ${file.file_name}`], conn);
    }
  }

  return findById(id, conn);
}

async function updateStatus(reviewId, currentStatus, targetStatus, userIdOrPayload, conn = null) {
  let userId = typeof userIdOrPayload === 'object' && userIdOrPayload !== null
    ? (userIdOrPayload.resolved_by || userIdOrPayload.closed_by || userIdOrPayload.user_id || userIdOrPayload.id || null)
    : (userIdOrPayload || null);

  let sql = '';
  let params = [];

  if (targetStatus === 'resolved') {
    sql = `
      UPDATE reviews
      SET status = 'resolved',
          resolved_by = ?,
          resolved_at = UTC_TIMESTAMP(),
          updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND status = ?
    `;
    params = [userId, reviewId, currentStatus];
  } else if (targetStatus === 'closed') {
    sql = `
      UPDATE reviews
      SET status = 'closed',
          closed_by = ?,
          closed_at = UTC_TIMESTAMP(),
          updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND status = ?
    `;
    params = [userId, reviewId, currentStatus];
  } else if (targetStatus === 'open') {
    // Reopen resets resolved/closed timestamps and increments reopen_count
    sql = `
      UPDATE reviews
      SET status = 'open',
          resolved_by = NULL,
          resolved_at = NULL,
          closed_by = NULL,
          closed_at = NULL,
          reopened_at = UTC_TIMESTAMP(),
          reopen_count = reopen_count + 1,
          updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND status = ?
    `;
    params = [reviewId, currentStatus];
  }

  const [result] = await exec(sql, params, conn);

  if (result.affectedRows > 0) {
    const projectId = await getProjectId(reviewId, conn);
    if (projectId && userId) {
      const activityId = newId('a');
      await exec(`
        INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
        VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
      `, [activityId, projectId, userId, `marked a review as ${targetStatus}.`], conn);
    }
  }

  return {
    affectedRows: result.affectedRows,
    outcome: result.affectedRows > 0 ? 'success' : 'conflict'
  };
}

module.exports = {
  getProjectId,
  findById,
  listByFile,
  listAll,
  create,
  updateStatus
};
