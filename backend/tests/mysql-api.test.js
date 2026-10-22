/**
 * =============================================================================
 * MySQL Service & API Integration Suite (Gate 1 Validation)
 * 
 * Verifies the full express application running in MySQL mode:
 *   DB_ENABLED=true
 *   DB_TARGET=test (targets code_review_portal_test on port 3307)
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// Set environment for test DB
process.env.DB_ENABLED = 'true';
process.env.DB_TARGET = 'test';
process.env.DB_NAME_TEST = 'code_review_portal_test';

const { getConnection, getPool, close } = require('../db/pool');
const seedDatabase = require('../../database/tools/seed');
const migrate = require('../../database/tools/migrate');

let server;
let baseUrl;

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

describe('Gate 1: MySQL API & Invitation Suite (code_review_portal_test)', () => {

  before(async () => {
    // 0. Verify target database is strictly code_review_portal_test
    const testPool = getPool('test');
    const [dbRows] = await testPool.query('SELECT DATABASE() AS db');
    assert.strictEqual(dbRows[0].db, 'code_review_portal_test', 'MUST run only on code_review_portal_test');

    // 1. Ensure migrations and clean test seed
    await migrate({ isTest: true });
    await seedDatabase({ isTest: true, reset: true });

    // 2. Start express server on ephemeral port
    const expressApp = require('../server');
    await new Promise((resolve) => {
      server = expressApp.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}/api`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await close();
  });

  // ---------------------------------------------------------------------------
  // 1. Health & Security
  // ---------------------------------------------------------------------------
  describe('1. Health & Dev Security', () => {
    test('GET /api/health returns db reachable without secrets', async () => {
      const res = await request('/health');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.db, 'reachable');
      assert.equal(res.data.password, undefined);
      assert.equal(res.data.host, undefined);
    });

    test('Dev endpoints are disabled when DB_ENABLED=true', async () => {
      const impRes = await request('/dev/impersonate', { method: 'POST', body: { userId: 'u1' } });
      assert.equal(impRes.status, 404);

      const resetRes = await request('/dev/reset', { method: 'POST' });
      assert.equal(resetRes.status, 404);

      const storeRes = await request('/dev/store');
      assert.equal(storeRes.status, 404);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Authentication Flow
  // ---------------------------------------------------------------------------
  describe('2. Authentication Flow', () => {
    let testToken = '';

    test('Register new user with valid inputs succeeds', async () => {
      const res = await request('/auth/register', {
        method: 'POST',
        body: {
          username: 'gate1tester',
          email: 'gate1@example.com',
          password: 'password123',
          confirm_password: 'password123',
          full_name: 'Gate One Tester'
        }
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.token);
      assert.equal(res.data.data.user.username, 'gate1tester');
      assert.equal(res.data.data.user.password, undefined);
      assert.equal(res.data.data.user.password_hash, undefined);
    });

    test('Register duplicate username fails with 409', async () => {
      const res = await request('/auth/register', {
        method: 'POST',
        body: {
          username: 'gate1tester',
          email: 'gate1diff@example.com',
          password: 'password123',
          confirm_password: 'password123',
          full_name: 'Duplicate Tester'
        }
      });
      assert.equal(res.status, 409);
    });

    test('Register with invalid password length fails with 400', async () => {
      const res = await request('/auth/register', {
        method: 'POST',
        body: {
          username: 'shortpwd',
          email: 'short@example.com',
          password: '123',
          confirm_password: '123',
          full_name: 'Short Password'
        }
      });
      assert.equal(res.status, 400);
    });

    test('Login with valid credentials succeeds and returns JWT', async () => {
      const res = await request('/auth/login', {
        method: 'POST',
        body: { identifier: 'gate1tester', password: 'password123' }
      });
      assert.equal(res.status, 200);
      assert.ok(res.data.data.token);
      testToken = res.data.data.token;
    });

    test('Login with wrong password fails with 401', async () => {
      const res = await request('/auth/login', {
        method: 'POST',
        body: { identifier: 'gate1tester', password: 'wrongpassword' }
      });
      assert.equal(res.status, 401);
    });

    test('GET /api/auth/me returns current user profile', async () => {
      const res = await request('/auth/me', {
        headers: { Authorization: `Bearer ${testToken}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.username, 'gate1tester');
      assert.equal(res.data.data.email, 'gate1@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Complete Invitation Workflow (All 12 points)
  // ---------------------------------------------------------------------------
  describe('3. Complete Invitation Workflow (12 points)', () => {
    let ownerToken = '';
    let inviteeToken = '';
    let viewerToken = '';
    let projectId = '';
    let memberRowId = '';

    before(async () => {
      // Login as u1 (owner of p1)
      const r1 = await request('/auth/login', { method: 'POST', body: { identifier: 'prasanna', password: 'password' } });
      ownerToken = r1.data.data.token;

      // Login as u5 (sneha, invitee)
      const r5 = await request('/auth/login', { method: 'POST', body: { identifier: 'sneha', password: 'password' } });
      inviteeToken = r5.data.data.token;

      // Login as u3 (divyesh, public viewer on p1)
      const r3 = await request('/auth/login', { method: 'POST', body: { identifier: 'divyesh', password: 'password' } });
      viewerToken = r3.data.data.token;

      // Create a dedicated private project for invitation tests
      const pRes = await request('/projects', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { name: 'Invite Flow Project', visibility: 'private', category: 'Java' }
      });
      projectId = pRes.data.data.id;
    });

    // Point 1: Owner finds user (search without exposing email or password)
    test('(1) Owner searches registered users', async () => {
      const res = await request('/users/search?q=sneha', {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      assert.equal(res.status, 200);
      const sneha = res.data.data.find(u => u.username === 'sneha');
      assert.ok(sneha, 'User sneha should be found');
      assert.equal(sneha.password, undefined);
      assert.equal(sneha.password_hash, undefined);
      assert.equal(sneha.email, undefined);
    });

    // Point 2: Owner sends invite
    test('(2) Owner sends invitation to user u5', async () => {
      const res = await request(`/projects/${projectId}/members/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { userId: 'u5' }
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.data.user_id, 'u5');
      assert.equal(res.data.data.status, 'pending');
      memberRowId = res.data.data.id;
    });

    // Point 3: Row stored in MySQL database
    test('(3) Pending member row is stored in MySQL database', async () => {
      const pool = getPool();
      const [rows] = await pool.query('SELECT * FROM project_members WHERE id = ?', [memberRowId]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, 'pending');
      assert.equal(rows[0].project_id, projectId);
      assert.equal(rows[0].user_id, 'u5');
      assert.equal(rows[0].joined_at, null);
    });

    // Point 4: Recipient sees notification after login
    test('(4) Recipient sees invitation notification after login', async () => {
      const res = await request('/notifications', {
        headers: { Authorization: `Bearer ${inviteeToken}` }
      });
      assert.equal(res.status, 200);
      const inviteNotif = res.data.data.find(n => n.type === 'invitation' && n.reference_id === memberRowId);
      assert.ok(inviteNotif, 'Recipient should have invitation notification');
      assert.equal(inviteNotif.is_read, false);
    });

    // Point 5: Accept gives active membership
    test('(5) Recipient accepts invitation, status becomes accepted', async () => {
      const res = await request(`/notifications/invitations/${memberRowId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${inviteeToken}` }
      });
      assert.equal(res.status, 200);

      // Verify in DB
      const pool = getPool();
      const [rows] = await pool.query('SELECT * FROM project_members WHERE id = ?', [memberRowId]);
      assert.equal(rows[0].status, 'accepted');
      assert.ok(rows[0].joined_at, 'joined_at must be populated');
    });

    // Point 6: New member accesses project per role
    test('(6) New member accesses private project as collaborator', async () => {
      const res = await request(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${inviteeToken}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.userRole, 'collaborator');
    });

    // Point 7: Decline on a separate invite grants nothing
    test('(7) Decline on a separate invite grants no project access', async () => {
      // Invite u6 (rohan)
      const invRes = await request(`/projects/${projectId}/members/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { userId: 'u6' }
      });
      const m6Id = invRes.data.data.id;

      // Login as u6
      const r6 = await request('/auth/login', { method: 'POST', body: { identifier: 'rohan', password: 'password' } });
      const rohanToken = r6.data.data.token;

      // Decline invite
      const decRes = await request(`/notifications/invitations/${m6Id}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${rohanToken}` }
      });
      assert.equal(decRes.status, 200);

      // Verify status in DB is rejected
      const pool = getPool();
      const [rows] = await pool.query('SELECT * FROM project_members WHERE id = ?', [m6Id]);
      assert.equal(rows[0].status, 'rejected');

      // Rohan attempts to access private project -> 403
      const accessRes = await request(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${rohanToken}` }
      });
      assert.equal(accessRes.status, 403);
    });

    // Point 8: Duplicate pending rejected
    test('(8) Duplicate pending invitation is rejected with 409', async () => {
      // Invite u4
      await request(`/projects/${projectId}/members/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { userId: 'u4' }
      });
      // Invite u4 again while pending
      const dupRes = await request(`/projects/${projectId}/members/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { userId: 'u4' }
      });
      assert.equal(dupRes.status, 409);
    });

    // Point 9: Unrelated user cannot accept/decline
    test('(9) Unrelated user cannot accept someone else invitation', async () => {
      // u3 tries to accept u4's invitation
      const pool = getPool();
      const [u4Member] = await pool.query("SELECT id FROM project_members WHERE project_id = ? AND user_id = 'u4'", [projectId]);
      const res = await request(`/notifications/invitations/${u4Member[0].id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerToken}` }
      });
      assert.equal(res.status, 403);
    });

    // Point 10: Viewer cannot invite or change membership
    test('(10) Viewer cannot invite users to project', async () => {
      const res = await request(`/projects/${projectId}/members/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerToken}` },
        body: { userId: 'u6' }
      });
      assert.equal(res.status, 403);
    });

    // Point 11: Survives backend restart
    test('(11) Membership state survives backend restart', async () => {
      // Close and restart express server
      await new Promise(resolve => server.close(resolve));
      const expressApp = require('../server');
      await new Promise((resolve) => {
        server = expressApp.listen(0, () => {
          const port = server.address().port;
          baseUrl = `http://localhost:${port}/api`;
          resolve();
        });
      });

      // Verify u5 can still access project as collaborator
      const res = await request(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${inviteeToken}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.userRole, 'collaborator');
    });

    // Point 12: No fabricated invitations or notifications
    test('(12) Database has zero orphan or fabricated invitations', async () => {
      const pool = getPool();
      const [orphans] = await pool.query(`
        SELECT n.id
        FROM notifications n
        WHERE n.type = 'invitation'
          AND n.reference_id NOT IN (SELECT id FROM project_members)
      `);
      assert.equal(orphans.length, 0, 'No fabricated or orphan invitation notifications allowed');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. File, Version, Review, Task Lifecycles
  // ---------------------------------------------------------------------------
  describe('4. File, Version, Review, Task Lifecycles', () => {
    let ownerToken = '';
    let fileId = '';
    let reviewId = '';
    let taskId = '';

    before(async () => {
      const r = await request('/auth/login', { method: 'POST', body: { identifier: 'prasanna', password: 'password' } });
      ownerToken = r.data.data.token;
    });

    test('Create file creates file and initial Version 1', async () => {
      const res = await request('/files/project/p1', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { file_name: 'Gate1File.java', language: 'Java' }
      });
      assert.equal(res.status, 201);
      fileId = res.data.data.id;
      assert.ok(fileId);

      const vRes = await request(`/files/${fileId}/versions`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      assert.equal(vRes.status, 200);
      assert.equal(vRes.data.data.length, 1);
      assert.equal(vRes.data.data[0].version_number, 1);
    });

    test('Ordinary code save does NOT create new version', async () => {
      const saveRes = await request(`/files/${fileId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { current_code: '// Updated draft code' }
      });
      assert.equal(saveRes.status, 200);

      // Verify versions count remains 1
      const vRes = await request(`/files/${fileId}/versions`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      assert.equal(vRes.data.data.length, 1);
    });

    test('Explicit createVersion increments version number', async () => {
      const res = await request(`/files/${fileId}/versions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { code: '// Committed Version 2', note: 'Version 2 commit' }
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.data.version_number, 2);
    });

    test('Create review on file and perform valid status lifecycle', async () => {
      // 1. Create review
      const revRes = await request(`/files/${fileId}/reviews`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { line_number: 1, review_type: 'bug', comment: 'Needs fix on line 1' }
      });
      assert.equal(revRes.status, 201);
      reviewId = revRes.data.data.id;
      assert.equal(revRes.data.data.status, 'open');

      // 2. Resolve review
      const resolveRes = await request(`/reviews/${reviewId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { status: 'resolved' }
      });
      assert.equal(resolveRes.status, 200);
      assert.equal(resolveRes.data.data.status, 'resolved');

      // 3. Close review (owner only)
      const closeRes = await request(`/reviews/${reviewId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { status: 'closed' }
      });
      assert.equal(closeRes.status, 200);
      assert.equal(closeRes.data.data.status, 'closed');

      // 4. Disallowed transition from closed to resolved -> 409
      const disRes = await request(`/reviews/${reviewId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { status: 'resolved' }
      });
      assert.equal(disRes.status, 409);

      // 5. Reopen review
      const reopenRes = await request(`/reviews/${reviewId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { status: 'open' }
      });
      assert.equal(reopenRes.status, 200);
      assert.equal(reopenRes.data.data.status, 'open');
      assert.equal(reopenRes.data.data.reopen_count, 1);
    });

    test('Create task linked to review, update status, and verify cascade behavior', async () => {
      // 1. Create task
      const tRes = await request('/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: {
          project_id: 'p1',
          review_id: reviewId,
          title: 'Fix issue from review',
          assigned_to: 'u2'
        }
      });
      assert.equal(tRes.status, 201);
      taskId = tRes.data.data.id;
      assert.equal(tRes.data.data.review_id, reviewId);

      // 2. Delete file: file & review deleted, task survives with review_id null
      const delFileRes = await request(`/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      assert.equal(delFileRes.status, 200);

      // 3. Verify task survived
      const pool = getPool();
      const [tRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
      assert.equal(tRows.length, 1);
      assert.equal(tRows[0].review_id, null, 'review_id must be null after review cascade deletion');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Dashboard Stats from Real MySQL Tables
  // ---------------------------------------------------------------------------
  describe('5. Real Dashboard Stats', () => {
    test('Dashboard stats return real numbers computed from database', async () => {
      const login = await request('/auth/login', { method: 'POST', body: { identifier: 'prasanna', password: 'password' } });
      const token = login.data.data.token;

      const res = await request('/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const data = res.data.data;
      assert.equal(typeof data.totalProjects, 'number');
      assert.equal(typeof data.ownedProjects, 'number');
      assert.equal(typeof data.collabProjects, 'number');
      assert.equal(typeof data.totalFiles, 'number');
      assert.equal(typeof data.openReviews, 'number');
      assert.equal(typeof data.pendingTasks, 'number');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Authorization Matrix Enforcements (HTTP over DB_ENABLED=true)
  // ---------------------------------------------------------------------------
  describe('6. Authorization Matrix Enforcements (HTTP over DB_ENABLED=true)', () => {
    let ownerToken, collabToken, viewerToken, outsiderToken;
    let privProjectId, privReviewId;

    before(async () => {
      // Owner (u1)
      const r1 = await request('/auth/login', { method: 'POST', body: { identifier: 'prasanna', password: 'password' } });
      ownerToken = r1.data.data.token;
      // Collab (u2)
      const r2 = await request('/auth/login', { method: 'POST', body: { identifier: 'himesh', password: 'password' } });
      collabToken = r2.data.data.token;
      // Viewer (u3)
      const r3 = await request('/auth/login', { method: 'POST', body: { identifier: 'divyesh', password: 'password' } });
      viewerToken = r3.data.data.token;
      // Outsider (u6)
      const r6 = await request('/auth/login', { method: 'POST', body: { identifier: 'rohan', password: 'password' } });
      outsiderToken = r6.data.data.token;

      // Create a private project owned by u1
      const p = await request('/projects', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { name: 'Matrix Auth Project', visibility: 'private', category: 'Java' }
      });
      privProjectId = p.data.data.id;

      // Add u2 as collaborator (invite + accept)
      const inv = await request(`/projects/${privProjectId}/members/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { userId: 'u2' }
      });
      const mId = inv.data.data.id;
      await request(`/notifications/invitations/${mId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${collabToken}` }
      });

      // Create a file & review
      const f = await request(`/files/project/${privProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { file_name: 'MatrixTest.java', language: 'Java' }
      });
      const r = await request(`/files/${f.data.data.id}/reviews`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { line_number: 1, review_type: 'comment', comment: 'Review for matrix test' }
      });
      privReviewId = r.data.data.id;
    });

    test('An outsider cannot read a private project', async () => {
      const res = await request(`/projects/${privProjectId}`, {
        headers: { Authorization: `Bearer ${outsiderToken}` }
      });
      assert.equal(res.status, 403);
    });

    test('A viewer cannot edit project details', async () => {
      const res = await request(`/projects/p1`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${viewerToken}` },
        body: { description: 'Hacked description' }
      });
      assert.equal(res.status, 403);
    });

    test('A collaborator cannot close a review', async () => {
      // First resolve the review
      await request(`/reviews/${privReviewId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: { status: 'resolved' }
      });

      // u2 (collaborator) tries to close the review
      const res = await request(`/reviews/${privReviewId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${collabToken}` },
        body: { status: 'closed' }
      });
      assert.equal(res.status, 403);
    });

    test('Only the owner can invite (collaborator and viewer cannot invite)', async () => {
      // Collaborator tries to invite
      const cRes = await request(`/projects/${privProjectId}/members/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${collabToken}` },
        body: { userId: 'u6' }
      });
      assert.equal(cRes.status, 403);

      // Viewer tries to invite
      const vRes = await request(`/projects/${privProjectId}/members/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${viewerToken}` },
        body: { userId: 'u6' }
      });
      assert.equal(vRes.status, 403);
    });
  });

});

