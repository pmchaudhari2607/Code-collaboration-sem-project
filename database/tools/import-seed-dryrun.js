const path = require('path');
const bcrypt = require(path.join(__dirname, '../../backend/node_modules/bcryptjs'));
const { getConnection, config } = require('./db-config');
const applySchema = require('./apply-schema');
const seed = require('../../backend/data/seed');

function toSqlDatetime(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function runImport() {
  const isRollback = process.argv.includes('--rollback');
  console.log(`[import-seed-dryrun] Starting import (Mode: ${isRollback ? 'ROLLBACK' : 'COMMIT'})...`);

  // Ensure clean schema state
  await applySchema();

  const conn = await getConnection();

  try {
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

    // 3. Project Members (Synthesize owner rows + seed rows)
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

    // 6. Reviews (r3 backfill included)
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

    console.log('[import-seed-dryrun] All seed entities inserted into transaction.');

    // -------------------------------------------------------------------------
    // Verification: Row counts vs seed counts
    // -------------------------------------------------------------------------
    const tableChecks = [
      { table: 'users', expected: seed.users.length },
      { table: 'projects', expected: seed.projects.length },
      { table: 'project_members', expected: seed.project_members.length + seed.projects.length }, // includes 4 owner rows
      { table: 'code_files', expected: seed.code_files.length },
      { table: 'code_versions', expected: seed.code_versions.length },
      { table: 'reviews', expected: seed.reviews.length },
      { table: 'tasks', expected: seed.tasks.length },
      { table: 'notifications', expected: seed.notifications.length },
      { table: 'activity_log', expected: seed.activity.length },
      { table: 'messages', expected: 0 }
    ];

    console.log('\n--- Row Count Verification ---');
    for (const tc of tableChecks) {
      const [rows] = await conn.query(`SELECT COUNT(*) AS cnt FROM ${tc.table}`);
      const actual = rows[0].cnt;
      const match = actual === tc.expected;
      console.log(`Table: ${tc.table.padEnd(16)} | DB Rows: ${actual.toString().padEnd(4)} | Expected: ${tc.expected.toString().padEnd(4)} | [${match ? 'PASS' : 'FAIL'}]`);
      if (!match) throw new Error(`Count mismatch in table ${tc.table}: expected ${tc.expected}, got ${actual}`);
    }

    // -------------------------------------------------------------------------
    // Verification: Confirm no orphans
    // -------------------------------------------------------------------------
    console.log('\n--- Foreign-Key Orphan Checks ---');
    const orphanQueries = [
      { name: 'members -> projects', sql: 'SELECT COUNT(*) AS c FROM project_members m LEFT JOIN projects p ON m.project_id = p.id WHERE p.id IS NULL' },
      { name: 'members -> users', sql: 'SELECT COUNT(*) AS c FROM project_members m LEFT JOIN users u ON m.user_id = u.id WHERE u.id IS NULL' },
      { name: 'files -> projects', sql: 'SELECT COUNT(*) AS c FROM code_files f LEFT JOIN projects p ON f.project_id = p.id WHERE p.id IS NULL' },
      { name: 'versions -> files', sql: 'SELECT COUNT(*) AS c FROM code_versions v LEFT JOIN code_files f ON v.file_id = f.id WHERE f.id IS NULL' },
      { name: 'reviews -> files', sql: 'SELECT COUNT(*) AS c FROM reviews r LEFT JOIN code_files f ON r.file_id = f.id WHERE f.id IS NULL' },
      { name: 'reviews -> versions (same file)', sql: 'SELECT COUNT(*) AS c FROM reviews r LEFT JOIN code_versions v ON r.version_id = v.id AND r.file_id = v.file_id WHERE v.id IS NULL' },
      { name: 'tasks -> projects', sql: 'SELECT COUNT(*) AS c FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE p.id IS NULL' },
      { name: 'tasks -> reviews (if set)', sql: 'SELECT COUNT(*) AS c FROM tasks t LEFT JOIN reviews r ON t.review_id = r.id WHERE t.review_id IS NOT NULL AND r.id IS NULL' },
      { name: 'notifications -> users', sql: 'SELECT COUNT(*) AS c FROM notifications n LEFT JOIN users u ON n.user_id = u.id WHERE u.id IS NULL' },
      { name: 'activity -> projects', sql: 'SELECT COUNT(*) AS c FROM activity_log a LEFT JOIN projects p ON a.project_id = p.id WHERE p.id IS NULL' }
    ];

    for (const oq of orphanQueries) {
      const [rows] = await conn.query(oq.sql);
      const orphans = rows[0].c;
      console.log(`Relation: ${oq.name.padEnd(32)} | Orphans: ${orphans} | [${orphans === 0 ? 'PASS' : 'FAIL'}]`);
      if (orphans !== 0) throw new Error(`Orphaned records detected for ${oq.name}`);
    }

    // -------------------------------------------------------------------------
    // Verification: bcrypt.compare on seeded users
    // -------------------------------------------------------------------------
    console.log('\n--- Bcrypt Password Verification ---');
    const [userRows] = await conn.query('SELECT id, username, password_hash FROM users');
    for (const u of userRows) {
      const valid = bcrypt.compareSync('password', u.password_hash);
      console.log(`User: ${u.username.padEnd(12)} (id: ${u.id}) | bcrypt.compare with 'password': [${valid ? 'PASS' : 'FAIL'}]`);
      if (!valid) throw new Error(`Password check failed for user ${u.username}`);
    }

    // -------------------------------------------------------------------------
    // Verification: Run Reference Queries from DESIGN.md Section 10
    // -------------------------------------------------------------------------
    console.log('\n================================================================================');
    console.log('REFERENCE SQL QUERIES EXECUTION (DESIGN.md Section 10)');
    console.log('================================================================================');

    // 10.1 Role Resolution Query
    console.log('\n[10.1 Role Resolution]:');
    const roleQuery = `
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
      WHERE p.id = ?;
    `;
    const [u1RoleOnP1] = await conn.query(roleQuery, ['u1', 'u1', 'p1']);
    console.log(`  u1 on p1: role = ${u1RoleOnP1[0]?.role} (expected: owner)`);

    const [u2RoleOnP1] = await conn.query(roleQuery, ['u2', 'u2', 'p1']);
    console.log(`  u2 on p1: role = ${u2RoleOnP1[0]?.role} (expected: collaborator)`);

    const [u3RoleOnP1] = await conn.query(roleQuery, ['u3', 'u3', 'p1']);
    console.log(`  u3 on p1: role = ${u3RoleOnP1[0]?.role} (expected: viewer)`);

    // 10.2 Accessible Projects with Counts
    console.log('\n[10.2 Accessible Projects with Aggregate Counts for u1]:');
    const accessibleQuery = `
      SELECT
        p.id,
        p.name,
        p.visibility,
        CASE
          WHEN p.owner_id = ? THEN 'owner'
          WHEN pm.role = 'collaborator' AND pm.status = 'accepted' THEN 'collaborator'
          ELSE 'viewer'
        END AS role,
        (SELECT COUNT(*) FROM code_files f WHERE f.project_id = p.id) AS files_count,
        (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id AND m.status = 'accepted') AS members_count,
        (SELECT COUNT(*) FROM reviews r JOIN code_files f ON r.file_id = f.id WHERE f.project_id = p.id AND r.status = 'open') AS open_reviews_count
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
      WHERE p.visibility = 'public'
         OR p.owner_id = ?
         OR (pm.status = 'accepted')
      ORDER BY p.updated_at DESC;
    `;
    const [projectsForU1] = await conn.query(accessibleQuery, ['u1', 'u1', 'u1']);
    projectsForU1.forEach(p => {
      console.log(`  Project: ${p.id} (${p.name}) | role: ${p.role} | files: ${p.files_count} | members: ${p.members_count} | openReviews: ${p.open_reviews_count}`);
    });

    // 10.3 KPI Stats Query for u1
    console.log('\n[10.3 Dashboard KPI Stats Query for u1]:');
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM projects WHERE owner_id = ?) AS my_projects,
        (SELECT COUNT(*) FROM reviews WHERE reviewer_id = ?) AS reviews_given,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status <> 'completed') AS tasks_pending,
        (SELECT COUNT(DISTINCT user_id)
         FROM project_members
         WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)
           AND user_id <> ?
           AND status = 'accepted') AS total_collaborators;
    `;
    const [statsU1] = await conn.query(statsQuery, ['u1', 'u1', 'u1', 'u1', 'u1']);
    console.log('  Stats for u1:', statsU1[0]);

    // 10.4 Next Version Allocation for f1
    console.log('\n[10.4 Next Version Allocation on file f1]:');
    const nextVerQuery = `
      SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
      FROM code_versions
      WHERE file_id = ?;
    `;
    const [verResult] = await conn.query(nextVerQuery, ['f1']);
    console.log(`  Next version for f1: ${verResult[0].next_version} (expected: 3, since v1 and v2 exist)`);

    // 10.5 Global Search Query for 'Banking' and 'Student'
    console.log('\n[10.5 Global Search for "Banking" (caller u1)]:');
    const searchQuery = `
      SELECT 'project' AS entity_type, p.id, p.name AS title, p.description AS snippet
      FROM projects p
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
      WHERE (p.visibility = 'public' OR p.owner_id = ? OR pm.status = 'accepted')
        AND (p.name LIKE CONCAT('%', ?, '%') OR p.description LIKE CONCAT('%', ?, '%'))
      UNION ALL
      SELECT 'file' AS entity_type, f.id, f.file_name AS title, f.project_id AS snippet
      FROM code_files f
      JOIN projects p ON f.project_id = p.id
      LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
      WHERE (p.visibility = 'public' OR p.owner_id = ? OR pm.status = 'accepted')
        AND f.file_name LIKE CONCAT('%', ?, '%');
    `;
    const searchTerm = 'Banking';
    const [searchResults] = await conn.query(searchQuery, ['u1', 'u1', searchTerm, searchTerm, 'u1', 'u1', searchTerm]);
    searchResults.forEach(sr => console.log(`  Found [${sr.entity_type}] ${sr.id}: ${sr.title} (${sr.snippet})`));

    // 10.6 Dynamic Notification Navigation Link Lookup
    console.log('\n[10.6 Dynamic Notification Navigation Link Lookup]:');
    const notifLinkQuery = `
      SELECT
        n.id,
        n.type,
        n.reference_id,
        CASE n.type
          WHEN 'invitation' THEN '/projects.html'
          WHEN 'review' THEN (SELECT CONCAT('/editor.html?fileId=', r.file_id, '&reviewId=', r.id) FROM reviews r WHERE r.id = n.reference_id)
          WHEN 'resolution' THEN (SELECT CONCAT('/editor.html?fileId=', r.file_id, '&reviewId=', r.id) FROM reviews r WHERE r.id = n.reference_id)
          WHEN 'task' THEN (SELECT CONCAT('/project-details.html?id=', t.project_id, '&tab=tasks&taskId=', t.id) FROM tasks t WHERE t.id = n.reference_id)
          WHEN 'version' THEN (SELECT CONCAT('/editor.html?fileId=', v.file_id, '&versionId=', v.id) FROM code_versions v WHERE v.id = n.reference_id)
          ELSE '/dashboard.html'
        END AS link
      FROM notifications n;
    `;
    const [notifLinks] = await conn.query(notifLinkQuery);
    notifLinks.forEach(nl => console.log(`  Notification ${nl.id} (${nl.type}): link -> ${nl.link}`));

    // Finalize transaction
    if (isRollback) {
      await conn.rollback();
      console.log('\n[import-seed-dryrun] --rollback flag active: Transaction rolled back successfully.');
    } else {
      await conn.commit();
      console.log('\n[import-seed-dryrun] Transaction committed successfully to database.');
    }

  } catch (err) {
    await conn.rollback();
    console.error('\n[import-seed-dryrun] Error during seed import dry-run:', err);
    throw err;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  runImport()
    .then(() => {
      console.log('\n[import-seed-dryrun] Verification completed successfully with ZERO errors.');
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = runImport;
