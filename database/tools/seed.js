const path = require('path');
const { getConnection, config } = require('./db-config');
const seed = require('../../backend/data/seed');

function toSqlDatetime(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function cleanTestDatabase(conn) {
  if (!config.database.endsWith('_test')) {
    throw new Error(`[seed] SAFETY REFUSAL: Resetting or cleaning tables is allowed only on databases ending in _test. Target was: ${config.database}`);
  }

  console.log(`[seed] Cleaning test database "${config.database}"...`);
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  const tables = [
    'messages',
    'activity_log',
    'notifications',
    'tasks',
    'reviews',
    'code_versions',
    'code_files',
    'project_members',
    'projects',
    'user_settings',
    'users'
  ];
  for (const t of tables) {
    await conn.query(`DELETE FROM \`${t}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('[seed] Clean complete.');
}

async function seedDatabase(options = {}) {
  const isReset = options.reset || process.argv.includes('--reset');
  const force = options.force || process.argv.includes('--force');
  const conn = await getConnection();

  try {
    if (isReset) {
      await cleanTestDatabase(conn);
    }

    // Check existing users count
    const [userCountRows] = await conn.query('SELECT COUNT(*) AS c FROM users');
    const existingUsers = userCountRows[0]?.c || 0;

    if (existingUsers > 0 && !force && !isReset) {
      console.log(`[seed] Database "${config.database}" is already populated, skipped.`);
      return { skipped: true, database: config.database };
    }

    console.log(`[seed] Seeding database "${config.database}" with standard seed dataset...`);
    await conn.beginTransaction();

    // 1. Users
    for (const u of seed.users) {
      await conn.query(
        `INSERT INTO users (id, full_name, username, email, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [u.id, u.full_name, u.username, u.email, u.password, toSqlDatetime(u.created_at)]
      );
    }

    // 2. Projects
    for (const p of seed.projects) {
      await conn.query(
        `INSERT INTO projects (id, owner_id, name, description, visibility, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.owner_id, p.name, p.description, p.visibility, p.category, toSqlDatetime(p.created_at), toSqlDatetime(p.updated_at)]
      );
    }

    // 3. Project Members (Owner rows first, then collaborator rows)
    for (const p of seed.projects) {
      const ownerMemberId = `m_${p.id}_owner`;
      await conn.query(
        `INSERT INTO project_members (id, project_id, user_id, role, status, invited_by, joined_at, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 'accepted', NULL, ?, ?, ?)`,
        [ownerMemberId, p.id, p.owner_id, toSqlDatetime(p.created_at), toSqlDatetime(p.created_at), toSqlDatetime(p.updated_at || p.created_at)]
      );
    }

    for (const m of seed.project_members) {
      await conn.query(
        `INSERT INTO project_members (id, project_id, user_id, role, status, invited_by, joined_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [m.id, m.project_id, m.user_id, m.role, m.status, m.invited_by || null, toSqlDatetime(m.joined_at)]
      );
    }

    // 4. Code Files
    for (const f of seed.code_files) {
      await conn.query(
        `INSERT INTO code_files (id, project_id, file_name, language, current_code, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [f.id, f.project_id, f.file_name, f.language, f.current_code, f.created_by, toSqlDatetime(f.created_at), toSqlDatetime(f.updated_at)]
      );
    }

    // 5. Code Versions
    for (const v of seed.code_versions) {
      await conn.query(
        `INSERT INTO code_versions (id, file_id, version_number, code, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [v.id, v.file_id, v.version_number, v.code, v.note || 'Snapshot', v.created_by, toSqlDatetime(v.created_at)]
      );
    }

    // 6. Reviews
    for (const r of seed.reviews) {
      const versionId = r.version_id || 'v_f5_1';
      await conn.query(
        `INSERT INTO reviews (id, file_id, version_id, reviewer_id, line_number, review_type, comment, status,
                              resolved_by, resolved_at, closed_by, closed_at, reopened_at, reopen_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id, r.file_id, versionId, r.reviewer_id, r.line_number, r.review_type, r.comment, r.status,
          r.resolved_by || null, toSqlDatetime(r.resolved_at),
          r.closed_by || null, toSqlDatetime(r.closed_at),
          toSqlDatetime(r.reopened_at), r.reopen_count || 0,
          toSqlDatetime(r.created_at), toSqlDatetime(r.updated_at)
        ]
      );
    }

    // 7. Tasks
    for (const t of seed.tasks) {
      await conn.query(
        `INSERT INTO tasks (id, project_id, review_id, created_by, assigned_to, title, description, status, priority, due_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id, t.project_id, t.review_id || null, t.created_by, t.assigned_to || null,
          t.title, t.description || null, t.status, t.priority, t.due_date || null,
          toSqlDatetime(t.created_at), toSqlDatetime(t.updated_at)
        ]
      );
    }

    // 8. Notifications
    for (const n of seed.notifications) {
      await conn.query(
        `INSERT INTO notifications (id, user_id, project_id, type, reference_id, message, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          n.id, n.user_id, n.project_id || null, n.type, n.reference_id || null,
          n.message, n.is_read ? 1 : 0, toSqlDatetime(n.created_at)
        ]
      );
    }

    // 9. Activity Log
    for (const a of seed.activity) {
      await conn.query(
        `INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [a.id, a.project_id, a.user_id, a.action_text || a.action, toSqlDatetime(a.created_at)]
      );
    }

    await conn.commit();
    console.log(`[seed] Successfully seeded database "${config.database}".`);
    return { skipped: false, database: config.database };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[seed] Seed error:', err.message);
      process.exit(1);
    });
}

module.exports = seedDatabase;
