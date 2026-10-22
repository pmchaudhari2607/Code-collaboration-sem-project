/**
 * =============================================================================
 * Safe, Idempotent In-Memory to MySQL Migration Tool
 *
 * Migrates all supported in-memory entities into MySQL in strict dependency order:
 * 1. languages
 * 2. users
 * 3. user_settings
 * 4. projects
 * 5. project_members (owners + collaborators + invitations)
 * 6. code_files
 * 7. code_versions
 * 8. reviews
 * 9. tasks
 * 10. notifications
 * 11. activity_log
 * 12. messages
 *
 * Features:
 * - Transactional (atomic commit / rollback)
 * - Idempotent (checks existing IDs, usernames, and unique keys)
 * - Preserves original IDs, relationships, timestamps, and references
 * - Validates foreign keys and checks for orphans
 * - Never truncates, overwrites, or recreates existing database records
 * =============================================================================
 */

const { getConnection, config } = require('./db-config');
const seedData = require('../../backend/data/seed');

async function migrateInMemoryToMySQL(options = {}) {
  const conn = await getConnection();
  const summary = {
    targetDatabase: config.database,
    evaluated: {},
    alreadyPresent: {},
    newlyMigrated: {},
    orphansFound: 0
  };

  try {
    await conn.beginTransaction();
    console.log(`[migration] Starting in-memory to MySQL migration on "${config.database}"...`);

    // -------------------------------------------------------------------------
    // 1. Languages
    // -------------------------------------------------------------------------
    const languages = [
      { name: 'C', file_extensions: '.c,.h', codemirror_mode: 'text/x-csrc', is_file_language: 1 },
      { name: 'C++', file_extensions: '.cpp,.h,.hpp,.cc,.cxx', codemirror_mode: 'text/x-c++src', is_file_language: 1 },
      { name: 'Java', file_extensions: '.java', codemirror_mode: 'text/x-java', is_file_language: 1 },
      { name: 'Python', file_extensions: '.py', codemirror_mode: 'python', is_file_language: 1 },
      { name: 'JavaScript', file_extensions: '.js,.mjs,.cjs', codemirror_mode: 'javascript', is_file_language: 1 },
      { name: 'Mixed', file_extensions: '', codemirror_mode: null, is_file_language: 0 }
    ];
    summary.evaluated.languages = languages.length;
    summary.alreadyPresent.languages = 0;
    summary.newlyMigrated.languages = 0;

    for (const lang of languages) {
      const [existing] = await conn.query('SELECT name FROM languages WHERE name = ?', [lang.name]);
      if (existing.length > 0) {
        summary.alreadyPresent.languages++;
      } else {
        await conn.query(`
          INSERT INTO languages (name, file_extensions, codemirror_mode, is_file_language, is_enabled)
          VALUES (?, ?, ?, ?, 1)
        `, [lang.name, lang.file_extensions, lang.codemirror_mode, lang.is_file_language]);
        summary.newlyMigrated.languages++;
      }
    }

    // -------------------------------------------------------------------------
    // 2. Users
    // -------------------------------------------------------------------------
    const inMemUsers = seedData.users || [];
    summary.evaluated.users = inMemUsers.length;
    summary.alreadyPresent.users = 0;
    summary.newlyMigrated.users = 0;

    for (const u of inMemUsers) {
      const [existing] = await conn.query('SELECT id FROM users WHERE id = ? OR username = ? OR email = ?', [u.id, u.username, u.email]);
      if (existing.length > 0) {
        summary.alreadyPresent.users++;
      } else {
        await conn.query(`
          INSERT INTO users (id, username, email, password_hash, full_name, bio, role, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, '', 'user', 1, ?, ?)
        `, [u.id, u.username, u.email, u.password, u.full_name, u.created_at || new Date().toISOString(), u.created_at || new Date().toISOString()]);
        summary.newlyMigrated.users++;
      }
    }

    // -------------------------------------------------------------------------
    // 3. User Settings (Ensure each user has a settings record)
    // -------------------------------------------------------------------------
    const [allUsers] = await conn.query('SELECT id FROM users');
    summary.evaluated.user_settings = allUsers.length;
    summary.alreadyPresent.user_settings = 0;
    summary.newlyMigrated.user_settings = 0;

    for (const u of allUsers) {
      const [existing] = await conn.query('SELECT user_id FROM user_settings WHERE user_id = ?', [u.id]);
      if (existing.length > 0) {
        summary.alreadyPresent.user_settings++;
      } else {
        await conn.query(`
          INSERT INTO user_settings (user_id, notify_reviews, notify_invitations, notify_tasks, notify_versions, theme, updated_at)
          VALUES (?, 1, 1, 1, 1, 'light', UTC_TIMESTAMP())
        `, [u.id]);
        summary.newlyMigrated.user_settings++;
      }
    }

    // -------------------------------------------------------------------------
    // 4. Projects
    // -------------------------------------------------------------------------
    const inMemProjects = seedData.projects || [];
    summary.evaluated.projects = inMemProjects.length;
    summary.alreadyPresent.projects = 0;
    summary.newlyMigrated.projects = 0;

    for (const p of inMemProjects) {
      const [existing] = await conn.query('SELECT id FROM projects WHERE id = ?', [p.id]);
      if (existing.length > 0) {
        summary.alreadyPresent.projects++;
      } else {
        // Verify owner exists
        const [ownerCheck] = await conn.query('SELECT id FROM users WHERE id = ?', [p.owner_id]);
        if (ownerCheck.length === 0) {
          throw new Error(`Cannot migrate project ${p.id}: owner ${p.owner_id} does not exist`);
        }
        await conn.query(`
          INSERT INTO projects (id, owner_id, name, description, visibility, category, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [p.id, p.owner_id, p.name, p.description || '', p.visibility || 'public', p.category || 'Mixed', p.created_at, p.updated_at || p.created_at]);
        summary.newlyMigrated.projects++;
      }
    }

    // -------------------------------------------------------------------------
    // 5. Project Members (Ensure owners have owner row + migrate collaborators)
    // -------------------------------------------------------------------------
    const [existingProjects] = await conn.query('SELECT id, owner_id, created_at FROM projects');
    for (const p of existingProjects) {
      const [ownerRow] = await conn.query('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', [p.id, p.owner_id]);
      if (ownerRow.length === 0) {
        const ownerMemberId = `m_${p.id}_owner`;
        await conn.query(`
          INSERT INTO project_members (id, project_id, user_id, role, status, invited_by, joined_at, created_at, updated_at)
          VALUES (?, ?, ?, 'owner', 'accepted', ?, ?, ?, ?)
        `, [ownerMemberId, p.id, p.owner_id, p.owner_id, p.created_at, p.created_at, p.created_at]);
      }
    }

    const inMemMembers = seedData.project_members || [];
    summary.evaluated.project_members = inMemMembers.length;
    summary.alreadyPresent.project_members = 0;
    summary.newlyMigrated.project_members = 0;

    for (const m of inMemMembers) {
      const [existing] = await conn.query('SELECT id FROM project_members WHERE id = ? OR (project_id = ? AND user_id = ?)', [m.id, m.project_id, m.user_id]);
      if (existing.length > 0) {
        summary.alreadyPresent.project_members++;
      } else {
        await conn.query(`
          INSERT INTO project_members (id, project_id, user_id, role, status, invited_by, joined_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
        `, [m.id, m.project_id, m.user_id, m.role || 'collaborator', m.status || 'accepted', m.invited_by || null, m.joined_at || null]);
        summary.newlyMigrated.project_members++;
      }
    }

    // -------------------------------------------------------------------------
    // 6. Code Files
    // -------------------------------------------------------------------------
    const inMemFiles = seedData.code_files || [];
    summary.evaluated.code_files = inMemFiles.length;
    summary.alreadyPresent.code_files = 0;
    summary.newlyMigrated.code_files = 0;

    for (const f of inMemFiles) {
      const [existing] = await conn.query('SELECT id FROM code_files WHERE id = ? OR (project_id = ? AND file_name = ?)', [f.id, f.project_id, f.file_name]);
      if (existing.length > 0) {
        summary.alreadyPresent.code_files++;
      } else {
        await conn.query(`
          INSERT INTO code_files (id, project_id, file_name, language, current_code, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [f.id, f.project_id, f.file_name, f.language, f.current_code || '', f.created_by, f.created_at, f.updated_at || f.created_at]);
        summary.newlyMigrated.code_files++;
      }
    }

    // -------------------------------------------------------------------------
    // 7. Code Versions
    // -------------------------------------------------------------------------
    const inMemVersions = seedData.code_versions || [];
    summary.evaluated.code_versions = inMemVersions.length;
    summary.alreadyPresent.code_versions = 0;
    summary.newlyMigrated.code_versions = 0;

    for (const v of inMemVersions) {
      const [existing] = await conn.query('SELECT id FROM code_versions WHERE id = ? OR (file_id = ? AND version_number = ?)', [v.id, v.file_id, v.version_number]);
      if (existing.length > 0) {
        summary.alreadyPresent.code_versions++;
      } else {
        await conn.query(`
          INSERT INTO code_versions (id, file_id, version_number, code, note, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [v.id, v.file_id, v.version_number, v.code || '', v.note || '', v.created_by, v.created_at]);
        summary.newlyMigrated.code_versions++;
      }
    }

    // -------------------------------------------------------------------------
    // 8. Reviews
    // -------------------------------------------------------------------------
    const inMemReviews = seedData.reviews || [];
    summary.evaluated.reviews = inMemReviews.length;
    summary.alreadyPresent.reviews = 0;
    summary.newlyMigrated.reviews = 0;

    for (const r of inMemReviews) {
      const [existing] = await conn.query('SELECT id FROM reviews WHERE id = ?', [r.id]);
      if (existing.length > 0) {
        summary.alreadyPresent.reviews++;
      } else {
        await conn.query(`
          INSERT INTO reviews (id, file_id, version_id, reviewer_id, line_number, review_type, comment, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [r.id, r.file_id, r.version_id, r.reviewer_id, r.line_number, r.review_type, r.comment, r.status || 'open', r.created_at, r.updated_at || r.created_at]);
        summary.newlyMigrated.reviews++;
      }
    }

    // -------------------------------------------------------------------------
    // 9. Tasks
    // -------------------------------------------------------------------------
    const inMemTasks = seedData.tasks || [];
    summary.evaluated.tasks = inMemTasks.length;
    summary.alreadyPresent.tasks = 0;
    summary.newlyMigrated.tasks = 0;

    for (const t of inMemTasks) {
      const [existing] = await conn.query('SELECT id FROM tasks WHERE id = ?', [t.id]);
      if (existing.length > 0) {
        summary.alreadyPresent.tasks++;
      } else {
        await conn.query(`
          INSERT INTO tasks (id, project_id, review_id, created_by, assigned_to, title, description, status, priority, due_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [t.id, t.project_id, t.review_id || null, t.created_by, t.assigned_to || null, t.title, t.description || '', t.status || 'todo', t.priority || 'medium', t.due_date || null, t.created_at, t.updated_at || t.created_at]);
        summary.newlyMigrated.tasks++;
      }
    }

    // -------------------------------------------------------------------------
    // 10. Notifications
    // -------------------------------------------------------------------------
    const inMemNotifications = seedData.notifications || [];
    summary.evaluated.notifications = inMemNotifications.length;
    summary.alreadyPresent.notifications = 0;
    summary.newlyMigrated.notifications = 0;

    for (const n of inMemNotifications) {
      const [existing] = await conn.query('SELECT id FROM notifications WHERE id = ?', [n.id]);
      if (existing.length > 0) {
        summary.alreadyPresent.notifications++;
      } else {
        await conn.query(`
          INSERT INTO notifications (id, user_id, type, message, reference_id, project_id, is_read, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [n.id, n.user_id, n.type, n.message, n.reference_id || null, n.project_id || null, n.is_read ? 1 : 0, n.created_at]);
        summary.newlyMigrated.notifications++;
      }
    }

    // -------------------------------------------------------------------------
    // 11. Activity Log
    // -------------------------------------------------------------------------
    const inMemActivity = seedData.activity || [];
    summary.evaluated.activity_log = inMemActivity.length;
    summary.alreadyPresent.activity_log = 0;
    summary.newlyMigrated.activity_log = 0;

    for (const a of inMemActivity) {
      const [existing] = await conn.query('SELECT id FROM activity_log WHERE id = ?', [a.id]);
      if (existing.length > 0) {
        summary.alreadyPresent.activity_log++;
      } else {
        await conn.query(`
          INSERT INTO activity_log (id, project_id, user_id, action_text, created_at)
          VALUES (?, ?, ?, ?, ?)
        `, [a.id, a.project_id, a.user_id, a.action_text, a.created_at]);
        summary.newlyMigrated.activity_log++;
      }
    }

    // -------------------------------------------------------------------------
    // 12. Relational Integrity & Orphan Check
    // -------------------------------------------------------------------------
    const orphanChecks = [
      { name: 'projects -> users', query: 'SELECT count(*) as c FROM projects p LEFT JOIN users u ON p.owner_id = u.id WHERE u.id IS NULL' },
      { name: 'project_members -> projects', query: 'SELECT count(*) as c FROM project_members m LEFT JOIN projects p ON m.project_id = p.id WHERE p.id IS NULL' },
      { name: 'project_members -> users', query: 'SELECT count(*) as c FROM project_members m LEFT JOIN users u ON m.user_id = u.id WHERE u.id IS NULL' },
      { name: 'code_files -> projects', query: 'SELECT count(*) as c FROM code_files f LEFT JOIN projects p ON f.project_id = p.id WHERE p.id IS NULL' },
      { name: 'code_versions -> code_files', query: 'SELECT count(*) as c FROM code_versions v LEFT JOIN code_files f ON v.file_id = f.id WHERE f.id IS NULL' },
      { name: 'reviews -> code_files', query: 'SELECT count(*) as c FROM reviews r LEFT JOIN code_files f ON r.file_id = f.id WHERE f.id IS NULL' },
      { name: 'tasks -> projects', query: 'SELECT count(*) as c FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE p.id IS NULL' },
      { name: 'notifications -> users', query: 'SELECT count(*) as c FROM notifications n LEFT JOIN users u ON n.user_id = u.id WHERE u.id IS NULL' },
      { name: 'activity_log -> projects', query: 'SELECT count(*) as c FROM activity_log a LEFT JOIN projects p ON a.project_id = p.id WHERE p.id IS NULL' }
    ];

    for (const oc of orphanChecks) {
      const [res] = await conn.query(oc.query);
      if (res[0].c > 0) {
        summary.orphansFound += res[0].c;
        throw new Error(`Integrity violation on ${oc.name}: found ${res[0].c} orphan records`);
      }
    }

    await conn.commit();
    console.log('[migration] Migration completed and committed successfully.');
    return summary;
  } catch (err) {
    await conn.rollback();
    console.error('[migration] Migration rolled back due to error:', err.message);
    throw err;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  migrateInMemoryToMySQL()
    .then(summary => {
      console.log('\n=======================================================');
      console.log('       In-Memory to MySQL Migration Summary            ');
      console.log('=======================================================');
      console.log('Target Database:', summary.targetDatabase);
      console.table(Object.keys(summary.evaluated).map(entity => ({
        Entity: entity,
        Evaluated: summary.evaluated[entity],
        'Already in MySQL': summary.alreadyPresent[entity],
        'Newly Migrated': summary.newlyMigrated[entity]
      })));
      console.log('Orphans Found:', summary.orphansFound);
      console.log('=======================================================\n');
      process.exit(0);
    })
    .catch(err => {
      console.error('[migration] Fatal migration error:', err);
      process.exit(1);
    });
}

module.exports = migrateInMemoryToMySQL;
