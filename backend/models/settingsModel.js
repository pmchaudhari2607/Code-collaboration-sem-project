const { exec, toBool, toISOString } = require('./helpers');

function formatSettings(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    notify_invitations: toBool(row.notify_invitations),
    notify_reviews: toBool(row.notify_reviews),
    notify_tasks: toBool(row.notify_tasks),
    notify_versions: toBool(row.notify_versions),
    theme: row.theme || 'light',
    updated_at: toISOString(row.updated_at)
  };
}

async function findByUserId(userId, conn = null) {
  const sql = `
    SELECT user_id, notify_invitations, notify_reviews, notify_tasks, notify_versions, theme, updated_at
    FROM user_settings
    WHERE user_id = ?
    LIMIT 1
  `;
  const [rows] = await exec(sql, [userId], conn);
  if (!rows || rows.length === 0) return null;
  return formatSettings(rows[0]);
}

async function upsert(userId, patch = {}, conn = null) {
  const current = await findByUserId(userId, conn) || {
    notify_invitations: true,
    notify_reviews: true,
    notify_tasks: true,
    notify_versions: true,
    theme: 'light'
  };

  const notify_invitations = patch.notify_invitations !== undefined ? (patch.notify_invitations ? 1 : 0) : (current.notify_invitations ? 1 : 0);
  const notify_reviews = patch.notify_reviews !== undefined ? (patch.notify_reviews ? 1 : 0) : (current.notify_reviews ? 1 : 0);
  const notify_tasks = patch.notify_tasks !== undefined ? (patch.notify_tasks ? 1 : 0) : (current.notify_tasks ? 1 : 0);
  const notify_versions = patch.notify_versions !== undefined ? (patch.notify_versions ? 1 : 0) : (current.notify_versions ? 1 : 0);
  const theme = patch.theme !== undefined ? patch.theme : current.theme;

  const sql = `
    INSERT INTO user_settings (user_id, notify_invitations, notify_reviews, notify_tasks, notify_versions, theme, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE
      notify_invitations = VALUES(notify_invitations),
      notify_reviews = VALUES(notify_reviews),
      notify_tasks = VALUES(notify_tasks),
      notify_versions = VALUES(notify_versions),
      theme = VALUES(theme),
      updated_at = UTC_TIMESTAMP()
  `;
  await exec(sql, [userId, notify_invitations, notify_reviews, notify_tasks, notify_versions, theme], conn);
  return findByUserId(userId, conn);
}

module.exports = {
  findByUserId,
  upsert
};
