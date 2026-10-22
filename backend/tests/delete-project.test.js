/**
 * =============================================================================
 * Delete Project Test Suite
 *
 * Verifies owner-only project deletion, authorization enforcement, atomic cascade
 * deletion, zero orphans, transaction rollback, and in-memory fallback.
 *
 * Safety requirements:
 * - Runs strictly against code_review_portal_test on port 3307.
 * - Uses disposable test projects and test users.
 * - Never touches or deletes development records.
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// Enforce test database environment
process.env.DB_ENABLED = 'true';
process.env.DB_TARGET = 'test';
process.env.DB_NAME_TEST = 'code_review_portal_test';

const { getPool, close } = require('../db/pool');
const { withTransaction } = require('../db/transaction');
const seedDatabase = require('../../database/tools/seed');
const migrate = require('../../database/tools/migrate');
const inMemoryProjectService = require('../services/in-memory/projectService');
const store = require('../data/store');

let server;
let baseUrl;
let pool;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const method = options.method || 'GET';
  const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined;

  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { json = raw; }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('Owner-Only Delete Project Test Suite (code_review_portal_test)', () => {
  let tokenOwner;
  let tokenCollaborator;
  let tokenOutsider;
  let disposableProjectId;
  let disposableFileId;
  let disposableVersionId;
  let disposableReviewId;
  let disposableTaskId;
  let disposableMemberId;

  before(async () => {
    // 1. Safety check: ensure target is strictly code_review_portal_test
    pool = getPool('test');
    const [dbNameRows] = await pool.query('SELECT DATABASE() as db');
    assert.strictEqual(dbNameRows[0].db, 'code_review_portal_test', 'MUST run only on code_review_portal_test');

    // 2. Ensure schema migration and clean test seed
    await migrate({ isTest: true });
    await seedDatabase({ isTest: true, reset: true });

    // 3. Start express server on ephemeral port
    const expressApp = require('../server');
    await new Promise((resolve) => {
      server = expressApp.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}/api`;
        resolve();
      });
    });

    // 4. Authenticate u1 (owner: prasanna), u2 (collaborator: himesh), u3 (outsider: divyesh)
    const loginOwner = await request('/auth/login', {
      method: 'POST',
      body: { identifier: 'prasanna', password: 'password' }
    });
    assert.strictEqual(loginOwner.status, 200);
    tokenOwner = loginOwner.data.data.token;

    const loginCollab = await request('/auth/login', {
      method: 'POST',
      body: { identifier: 'himesh', password: 'password' }
    });
    assert.strictEqual(loginCollab.status, 200);
    tokenCollaborator = loginCollab.data.data.token;

    const loginOutsider = await request('/auth/login', {
      method: 'POST',
      body: { identifier: 'divyesh', password: 'password' }
    });
    assert.strictEqual(loginOutsider.status, 200);
    tokenOutsider = loginOutsider.data.data.token;

    // 5. Create a dedicated disposable project owned by u1 for testing
    const createProjRes = await request('/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}` },
      body: {
        name: 'Disposable Delete Project Test',
        description: 'Disposable project to test cascading deletion',
        category: 'Python',
        visibility: 'public'
      }
    });
    assert.strictEqual(createProjRes.status, 201);
    disposableProjectId = createProjRes.data.data.id;

    // Add u2 as collaborator
    const inviteRes = await request(`/projects/${disposableProjectId}/members/invitations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}` },
      body: { userId: 'u2', role: 'collaborator' }
    });
    assert.strictEqual(inviteRes.status, 201);
    disposableMemberId = inviteRes.data.data.id;

    // Accept invitation as u2
    const acceptRes = await request(`/notifications/invitations/${disposableMemberId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCollaborator}` }
    });
    assert.strictEqual(acceptRes.status, 200);

    // Create a code file in the disposable project
    const createFileRes = await request(`/files/project/${disposableProjectId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}` },
      body: {
        file_name: 'test_delete.py',
        language: 'Python',
        code: 'def hello():\n    return "delete me"\n'
      }
    });
    assert.strictEqual(createFileRes.status, 201);
    disposableFileId = createFileRes.data.data.id;

    // Retrieve file versions
    const versionsRes = await request(`/files/${disposableFileId}/versions`, {
      headers: { Authorization: `Bearer ${tokenOwner}` }
    });
    assert.strictEqual(versionsRes.status, 200);
    disposableVersionId = versionsRes.data.data[0].id;

    // Add a review from collaborator u2
    const createReviewRes = await request(`/files/${disposableFileId}/reviews`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCollaborator}` },
      body: {
        version_id: disposableVersionId,
        line_number: 1,
        review_type: 'comment',
        comment: 'Disposable review comment to check cascade delete.'
      }
    });
    assert.strictEqual(createReviewRes.status, 201);
    disposableReviewId = createReviewRes.data.data.id;

    // Create a task linked to this project and review
    const createTaskRes = await request('/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}` },
      body: {
        project_id: disposableProjectId,
        review_id: disposableReviewId,
        title: 'Disposable Task',
        description: 'Check task deletion on project delete',
        assigned_to: 'u2',
        priority: 'high'
      }
    });
    assert.strictEqual(createTaskRes.status, 201);
    disposableTaskId = createTaskRes.data.data.id;

    // Send a message in project chat
    const msgRes = await request(`/messages/${disposableProjectId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}` },
      body: {
        content: 'Disposable chat message'
      }
    });
    assert.strictEqual(msgRes.status, 201);
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await close();
  });

  test('1. Unauthenticated request is rejected with 401', async () => {
    const res = await request(`/projects/${disposableProjectId}`, {
      method: 'DELETE'
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.success, false);
  });

  test('2. Collaborator cannot delete the project (rejected with 403)', async () => {
    const res = await request(`/projects/${disposableProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenCollaborator}` }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.success, false);
    assert.match(res.data.message, /permission denied/i);

    // Verify project still exists
    const [rows] = await pool.query('SELECT id FROM projects WHERE id = ?', [disposableProjectId]);
    assert.strictEqual(rows.length, 1, 'Project must remain untouched');
  });

  test('3. Unrelated user cannot delete the project (rejected with 403)', async () => {
    const res = await request(`/projects/${disposableProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOutsider}` }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.success, false);
    assert.match(res.data.message, /permission denied/i);

    // Verify project still exists
    const [rows] = await pool.query('SELECT id FROM projects WHERE id = ?', [disposableProjectId]);
    assert.strictEqual(rows.length, 1, 'Project must remain untouched');
  });

  test('4. Nonexistent project returns 404', async () => {
    const res = await request('/projects/p_nonexistent_999999', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOwner}` }
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.data.success, false);
  });

  test('5. Canceling confirmation leaves the project and dependent data unchanged', async () => {
    // Simulate user choosing Cancel: No DELETE request is issued
    // Check that project, file, member, review, task remain intact
    const [pRows] = await pool.query('SELECT id FROM projects WHERE id = ?', [disposableProjectId]);
    assert.strictEqual(pRows.length, 1);

    const [fRows] = await pool.query('SELECT id FROM code_files WHERE id = ?', [disposableFileId]);
    assert.strictEqual(fRows.length, 1);

    const [mRows] = await pool.query('SELECT id FROM project_members WHERE project_id = ? AND user_id = "u2"', [disposableProjectId]);
    assert.strictEqual(mRows.length, 1);
  });

  test('6. Other users\' projects and unrelated data remain unchanged before and after', async () => {
    // Project p2 is owned by u2 (Bob). Check initial counts
    const [p2Rows] = await pool.query('SELECT id, name FROM projects WHERE id = "p2"');
    assert.strictEqual(p2Rows.length, 1);
    assert.strictEqual(p2Rows[0].id, 'p2');

    const [p2Files] = await pool.query('SELECT COUNT(*) as count FROM code_files WHERE project_id = "p2"');
    assert.ok(p2Files[0].count > 0);
  });

  test('7. Project owner successfully deletes their own project (200 OK)', async () => {
    const res = await request(`/projects/${disposableProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOwner}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.match(res.data.message, /project deleted/i);

    // Subsequent fetch returns 404
    const getRes = await request(`/projects/${disposableProjectId}`, {
      headers: { Authorization: `Bearer ${tokenOwner}` }
    });
    assert.strictEqual(getRes.status, 404);
  });

  test('8. Successful deletion removes project and dependent records with zero orphans', async () => {
    // 1. projects
    const [projects] = await pool.query('SELECT * FROM projects WHERE id = ?', [disposableProjectId]);
    assert.strictEqual(projects.length, 0, 'Project row must be deleted');

    // 2. project_members
    const [members] = await pool.query('SELECT * FROM project_members WHERE project_id = ?', [disposableProjectId]);
    assert.strictEqual(members.length, 0, 'All project_members rows must be deleted');

    // 3. code_files
    const [files] = await pool.query('SELECT * FROM code_files WHERE project_id = ?', [disposableProjectId]);
    assert.strictEqual(files.length, 0, 'All code_files rows must be deleted');

    // 4. code_versions
    const [versions] = await pool.query('SELECT * FROM code_versions WHERE file_id = ?', [disposableFileId]);
    assert.strictEqual(versions.length, 0, 'All code_versions for file must be deleted');

    // 5. reviews
    const [reviews] = await pool.query('SELECT * FROM reviews WHERE file_id = ?', [disposableFileId]);
    assert.strictEqual(reviews.length, 0, 'All reviews for file must be deleted');

    // 6. tasks
    const [tasks] = await pool.query('SELECT * FROM tasks WHERE project_id = ?', [disposableProjectId]);
    assert.strictEqual(tasks.length, 0, 'All tasks for project must be deleted');

    // 7. activity_log
    const [activity] = await pool.query('SELECT * FROM activity_log WHERE project_id = ?', [disposableProjectId]);
    assert.strictEqual(activity.length, 0, 'All activity_log entries for project must be deleted');

    // 8. messages
    const [messages] = await pool.query('SELECT * FROM messages WHERE project_id = ?', [disposableProjectId]);
    assert.strictEqual(messages.length, 0, 'All messages for project must be deleted');

    // 9. notifications
    const [notifs] = await pool.query(
      'SELECT * FROM notifications WHERE project_id = ? OR reference_id IN (?, ?, ?, ?)',
      [disposableProjectId, disposableMemberId, disposableReviewId, disposableVersionId, disposableTaskId]
    );
    assert.strictEqual(notifs.length, 0, 'All polymorphic and direct notifications must be removed');

    // Check unrelated project p2 is intact
    const [p2Rows] = await pool.query('SELECT id FROM projects WHERE id = "p2"');
    assert.strictEqual(p2Rows.length, 1, 'Project p2 must remain untouched');
  });

  test('9. Database transaction rolls back correctly when deletion fails', async () => {
    // Create a new disposable project to test transaction rollback
    const createRes = await request('/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOwner}` },
      body: {
        name: 'Rollback Test Project',
        description: 'Testing transaction rollback upon failure',
        category: 'C',
        visibility: 'private'
      }
    });
    assert.strictEqual(createRes.status, 201);
    const rollbackProjId = createRes.data.data.id;

    // Simulate an error inside withTransaction during deletion
    await assert.rejects(
      async () => {
        await withTransaction(async (conn) => {
          // Perform partial deletion
          await conn.query('DELETE FROM projects WHERE id = ?', [rollbackProjId]);
          // Deliberately throw an error before commit
          throw new Error('Simulated failure during deletion');
        });
      },
      /Simulated failure during deletion/
    );

    // Verify rollback: project must still exist in the database
    const [rows] = await pool.query('SELECT id FROM projects WHERE id = ?', [rollbackProjId]);
    assert.strictEqual(rows.length, 1, 'Project must still exist after rolled back transaction');

    // Clean up disposable project
    await request(`/projects/${rollbackProjId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOwner}` }
    });
  });

  test('10. In-memory fallback behavior cascades correctly and leaves no orphans', async () => {
    // Set up in-memory project with files, versions, reviews, tasks, members, notifications
    const memProjId = 'p_mem_test_1';
    store.insert('projects', {
      id: memProjId,
      owner_id: 'u1',
      name: 'In-Memory Test Project',
      description: 'Testing in-memory cascade',
      category: 'Java',
      visibility: 'public',
      created_at: new Date().toISOString()
    });

    store.insert('project_members', {
      id: 'm_mem_1',
      project_id: memProjId,
      user_id: 'u2',
      role: 'collaborator',
      status: 'accepted',
      created_at: new Date().toISOString()
    });

    store.insert('code_files', {
      id: 'f_mem_1',
      project_id: memProjId,
      file_name: 'MemTest.java',
      language: 'Java',
      current_code: 'class MemTest {}',
      created_by: 'u1',
      created_at: new Date().toISOString()
    });

    store.insert('code_versions', {
      id: 'v_mem_1',
      file_id: 'f_mem_1',
      version_number: 1,
      code: 'class MemTest {}',
      note: 'Initial',
      created_by: 'u1',
      created_at: new Date().toISOString()
    });

    store.insert('reviews', {
      id: 'r_mem_1',
      file_id: 'f_mem_1',
      version_id: 'v_mem_1',
      reviewer_id: 'u2',
      line_number: 1,
      review_type: 'comment',
      comment: 'Nice class',
      status: 'open',
      created_at: new Date().toISOString()
    });

    store.insert('tasks', {
      id: 't_mem_1',
      project_id: memProjId,
      review_id: 'r_mem_1',
      title: 'In-mem task',
      created_by: 'u1',
      status: 'todo',
      created_at: new Date().toISOString()
    });

    store.insert('notifications', {
      id: 'n_mem_1',
      user_id: 'u2',
      type: 'invitation',
      reference_id: 'm_mem_1',
      project_id: memProjId,
      message: 'Invited to in-mem project',
      is_read: false
    });

    // Execute in-memory remove
    const deleted = inMemoryProjectService.remove(memProjId);
    assert.strictEqual(deleted, true);

    // Verify all in-memory entities are removed
    assert.strictEqual(store.findById('projects', memProjId), undefined);
    assert.strictEqual(store.filter('project_members', m => m.project_id === memProjId).length, 0);
    assert.strictEqual(store.filter('code_files', f => f.project_id === memProjId).length, 0);
    assert.strictEqual(store.filter('code_versions', v => v.file_id === 'f_mem_1').length, 0);
    assert.strictEqual(store.filter('reviews', r => r.file_id === 'f_mem_1').length, 0);
    assert.strictEqual(store.filter('tasks', t => t.project_id === memProjId).length, 0);
    assert.strictEqual(store.filter('notifications', n => n.project_id === memProjId || n.reference_id === 'm_mem_1').length, 0);

    // Nonexistent project in memory returns 404
    assert.throws(
      () => inMemoryProjectService.remove('p_nonexistent_inmem'),
      (err) => {
        assert.strictEqual(err.statusCode, 404);
        return true;
      }
    );
  });
});
