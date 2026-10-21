const { exec, toISOString } = require('./helpers');
const { newId } = require('../utils/id');

/**
 * Find message by ID.
 */
exports.findById = async (id, conn = null) => {
  const [rows] = await exec(
    `SELECT m.id, m.project_id, m.sender_id, m.content, m.created_at,
            COALESCE(u.full_name, 'Unknown') AS senderName
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
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
 * List messages for a project in chronological order.
 * Optional limit parameter.
 */
exports.listByProject = async (projectId, limit = null, conn = null) => {
  let sql = `
    SELECT m.id, m.project_id, m.sender_id, m.content, m.created_at,
           COALESCE(u.full_name, 'Unknown') AS senderName
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.project_id = ?
    ORDER BY m.created_at ASC, m.id ASC
  `;
  const params = [projectId];

  if (limit !== null && limit !== undefined) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
    sql += ` LIMIT ${safeLimit}`;
  }

  const [rows] = await exec(sql, params, conn);
  return rows.map(r => ({
    ...r,
    created_at: toISOString(r.created_at)
  }));
};

/**
 * Create a message in a project.
 */
exports.create = async (projectId, senderId, content, conn = null) => {
  if (!content || !content.trim()) {
    const err = new Error('Message content is required');
    err.statusCode = 400;
    throw err;
  }

  const id = newId('msg');
  const trimmed = content.trim();

  await exec(
    `INSERT INTO messages (id, project_id, sender_id, content, created_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
    [id, projectId, senderId, trimmed],
    conn
  );

  return exports.findById(id, conn);
};
