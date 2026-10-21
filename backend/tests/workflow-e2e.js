/**
 * backend/tests/workflow-e2e.js
 * 
 * Gate 3 Real MySQL Workflow Verification Runner
 * Verifies end-to-end API workflows using two test accounts on code_review_portal_test (port 3307):
 * - Authentication (Registration, Login, Profile)
 * - Project Creation & Privacy Gates
 * - Code File Creation, Draft Saves, and Version Increments
 * - Real User Search & Collaboration Invitation
 * - Notification Receipt & Accept Flow
 * - Role-Based Project Access (Owner vs Collaborator vs Outsider)
 * - Review Status Transitions & Owner-only Close Enforcement
 * - Decline Workflow & Rejection Privacy
 * - Server Restart Persistence
 */

const http = require('http');
const path = require('path');
const assert = require('assert');

// Enforce MySQL Test environment
process.env.DB_ENABLED = 'true';
process.env.DB_TARGET = 'test';
process.env.DB_NAME_TEST = 'code_review_portal_test';

const seedDatabase = require('../../database/tools/seed');
const migrate = require('../../database/tools/migrate');
const { getPool, close } = require('../db/pool');

let server;
let baseUrl;

function request(path, options = {}) {
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

async function startServer() {
  const expressApp = require('../server');
  return new Promise((resolve) => {
    server = expressApp.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}/api`;
      resolve();
    });
  });
}

async function stopServer() {
  if (server) {
    await new Promise(resolve => server.close(resolve));
    server = null;
  }
}

async function runWorkflow() {
  console.log('================================================================');
  console.log('   GATE 3: Real MySQL End-to-End Workflow Verification Runner  ');
  console.log('================================================================');
  console.log('Database: code_review_portal_test on port 3307');
  
  // 1. Reset test DB with clean seed
  console.log('\n[1/8] Initializing test database with clean schema & seed...');
  await migrate({ isTest: true });
  await seedDatabase({ isTest: true, reset: true });
  await startServer();
  console.log(`Backend server mounted on ${baseUrl}`);

  // Test account details
  const uniqueId = Date.now().toString().slice(-4);
  const user1 = {
    username: `alice_${uniqueId}`,
    email: `alice_${uniqueId}@example.com`,
    password: 'password123',
    confirm_password: 'password123',
    full_name: 'Alice Developer'
  };
  const user2 = {
    username: `bob_${uniqueId}`,
    email: `bob_${uniqueId}@example.com`,
    password: 'password123',
    confirm_password: 'password123',
    full_name: 'Bob Collaborator'
  };
  const user3 = {
    username: `charlie_${uniqueId}`,
    email: `charlie_${uniqueId}@example.com`,
    password: 'password123',
    confirm_password: 'password123',
    full_name: 'Charlie Declined'
  };

  let token1, user1Id;
  let token2, user2Id;
  let token3, user3Id;
  let projectId;
  let fileId;
  let reviewId;
  let inviteMemberId;

  // Step 1: Authentication & User Profiles
  console.log('\n[2/8] Step 1: Testing Registration & Authentication for test accounts...');
  const reg1 = await request('/auth/register', { method: 'POST', body: user1 });
  assert.strictEqual(reg1.status, 201, `Alice registration failed: ${JSON.stringify(reg1.data)}`);
  token1 = reg1.data.data.token;
  user1Id = reg1.data.data.user.id;
  console.log(`  ✔ Account 1 created: ${user1.username} (${user1Id})`);

  const reg2 = await request('/auth/register', { method: 'POST', body: user2 });
  assert.strictEqual(reg2.status, 201, `Bob registration failed: ${JSON.stringify(reg2.data)}`);
  token2 = reg2.data.data.token;
  user2Id = reg2.data.data.user.id;
  console.log(`  ✔ Account 2 created: ${user2.username} (${user2Id})`);

  const reg3 = await request('/auth/register', { method: 'POST', body: user3 });
  assert.strictEqual(reg3.status, 201);
  token3 = reg3.data.data.token;
  user3Id = reg3.data.data.user.id;
  console.log(`  ✔ Account 3 created: ${user3.username} (${user3Id})`);

  // Verify GET /auth/me
  const me1 = await request('/auth/me', { headers: { Authorization: `Bearer ${token1}` } });
  assert.strictEqual(me1.status, 200);
  assert.strictEqual(me1.data.data.username, user1.username);
  console.log(`  ✔ Verified token & profile lookup for ${user1.username}`);

  // Step 2: Project Creation & Privacy
  console.log('\n[3/8] Step 2: Testing Project Creation & Privacy Boundaries...');
  const projRes = await request('/projects', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: {
      name: `Secure Platform ${uniqueId}`,
      description: 'Private core banking services in Java',
      visibility: 'private',
      category: 'Java'
    }
  });
  assert.strictEqual(projRes.status, 201, `Project creation failed: ${JSON.stringify(projRes.data)}`);
  projectId = projRes.data.data.id;
  console.log(`  ✔ Alice created private project: ${projRes.data.data.name} (${projectId})`);

  // Alice fetches project details
  const pAlice = await request(`/projects/${projectId}`, { headers: { Authorization: `Bearer ${token1}` } });
  assert.strictEqual(pAlice.status, 200);
  assert.strictEqual(pAlice.data.data.userRole, 'owner');
  console.log(`  ✔ Alice confirmed as 'owner' in project metadata`);

  // Bob (outsider) attempts access to Alice's private project -> must receive 403
  const pBobOutsider = await request(`/projects/${projectId}`, { headers: { Authorization: `Bearer ${token2}` } });
  assert.strictEqual(pBobOutsider.status, 403);
  console.log(`  ✔ Privacy check: Bob (outsider) received HTTP 403 on private project`);

  // Step 3: Code File Creation & Versioning Lifecycle
  console.log('\n[4/8] Step 3: Testing Code File Creation, Draft Saves, and Versioning...');
  const fileRes = await request(`/files/project/${projectId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: { file_name: 'AppConfig.java', language: 'Java' }
  });
  assert.strictEqual(fileRes.status, 201, `File creation failed: ${JSON.stringify(fileRes.data)}`);
  fileId = fileRes.data.data.id;
  console.log(`  ✔ Created file AppConfig.java (${fileId}) with auto Version 1`);

  // Verify initial version count = 1
  const vList1 = await request(`/files/${fileId}/versions`, { headers: { Authorization: `Bearer ${token1}` } });
  assert.strictEqual(vList1.data.data.length, 1);
  assert.strictEqual(vList1.data.data[0].version_number, 1);

  // Ordinary draft save (should NOT create a new version)
  const saveDraft = await request(`/files/${fileId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token1}` },
    body: { current_code: '// Updated draft code in working copy' }
  });
  assert.strictEqual(saveDraft.status, 200);

  const vList2 = await request(`/files/${fileId}/versions`, { headers: { Authorization: `Bearer ${token1}` } });
  assert.strictEqual(vList2.data.data.length, 1, 'Draft save must not create a new version');
  console.log(`  ✔ Verified ordinary draft save updates current_code without creating a new version`);

  // Explicit commit: Save as New Version
  const commitV2 = await request(`/files/${fileId}/versions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: { code: '// Production release v2.0', note: 'Milestone 2.0 commit' }
  });
  assert.strictEqual(commitV2.status, 201);
  assert.strictEqual(commitV2.data.data.version_number, 2);

  const vList3 = await request(`/files/${fileId}/versions`, { headers: { Authorization: `Bearer ${token1}` } });
  assert.strictEqual(vList3.data.data.length, 2);
  console.log(`  ✔ Verified explicit commit created Version 2 with note`);

  // Step 4: Real Member Search & Invitation
  console.log('\n[5/8] Step 4: Testing Member Search & Collaboration Invitation Flow...');
  const searchRes = await request(`/users/search?q=${user2.username}`, { headers: { Authorization: `Bearer ${token1}` } });
  assert.strictEqual(searchRes.status, 200);
  const foundUser = searchRes.data.data.find(u => u.username === user2.username);
  assert.ok(foundUser);
  assert.strictEqual(foundUser.password, undefined, 'Password must never leak in search');
  assert.strictEqual(foundUser.email, undefined, 'Email must never leak in member search');
  console.log(`  ✔ User search found ${user2.username} without password/email exposure`);

  // Alice invites Bob
  const inviteRes = await request(`/projects/${projectId}/members/invitations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: { userId: user2Id }
  });
  assert.strictEqual(inviteRes.status, 201);
  inviteMemberId = inviteRes.data.data.id;
  console.log(`  ✔ Alice invited Bob: member record ${inviteMemberId} (status: pending)`);

  // Duplicate invite rejection
  const dupInvite = await request(`/projects/${projectId}/members/invitations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: { userId: user2Id }
  });
  assert.strictEqual(dupInvite.status, 409);
  console.log(`  ✔ Duplicate invitation correctly rejected with HTTP 409 Conflict`);

  // Step 5: Notification Receipt & Acceptance
  console.log('\n[6/8] Step 5: Testing Notification Delivery & Acceptance...');
  const notifsBob = await request('/notifications', { headers: { Authorization: `Bearer ${token2}` } });
  assert.strictEqual(notifsBob.status, 200);
  const inviteNotif = notifsBob.data.data.find(n => n.reference_id === inviteMemberId && n.type === 'invitation');
  assert.ok(inviteNotif, 'Bob must have received the invitation notification');
  assert.strictEqual(inviteNotif.is_read, false);
  console.log(`  ✔ Bob received unread invitation notification: "${inviteNotif.message}"`);

  // Bob accepts the invitation
  const acceptRes = await request(`/notifications/invitations/${inviteMemberId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.strictEqual(acceptRes.status, 200);
  console.log(`  ✔ Bob accepted invitation`);

  // Verify in MySQL
  const pool = getPool();
  const [memberRows] = await pool.query('SELECT * FROM project_members WHERE id = ?', [inviteMemberId]);
  assert.strictEqual(memberRows[0].status, 'accepted');
  assert.ok(memberRows[0].joined_at, 'joined_at timestamp must be set in MySQL');
  console.log(`  ✔ MySQL verified: status='accepted', joined_at=${memberRows[0].joined_at.toISOString()}`);

  // Bob now accesses private project as collaborator
  const pBobCollab = await request(`/projects/${projectId}`, { headers: { Authorization: `Bearer ${token2}` } });
  assert.strictEqual(pBobCollab.status, 200);
  assert.strictEqual(pBobCollab.data.data.userRole, 'collaborator');
  console.log(`  ✔ Bob granted active 'collaborator' access to private project`);

  // Step 6: Review & Task Collaboration Interactions
  console.log('\n[7/8] Step 6: Testing Code Review Lifecycle & Permission Enforcements...');
  // Bob creates review
  const revRes = await request(`/files/${fileId}/reviews`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` },
    body: { line_number: 1, review_type: 'bug', comment: 'Needs null validation on argument' }
  });
  assert.strictEqual(revRes.status, 201);
  reviewId = revRes.data.data.id;
  console.log(`  ✔ Bob created review ${reviewId} (status: open)`);

  // Alice resolves review
  const resolveRes = await request(`/reviews/${reviewId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token1}` },
    body: { status: 'resolved' }
  });
  assert.strictEqual(resolveRes.status, 200);
  assert.strictEqual(resolveRes.data.data.status, 'resolved');
  console.log(`  ✔ Alice marked review as resolved`);

  // Bob (collaborator) attempts to close review -> 403 (Owner only)
  const bobCloseAttempt = await request(`/reviews/${reviewId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token2}` },
    body: { status: 'closed' }
  });
  assert.strictEqual(bobCloseAttempt.status, 403);
  console.log(`  ✔ Permission gate verified: Collaborator cannot close a review (HTTP 403)`);

  // Alice (owner) closes review -> 200
  const aliceClose = await request(`/reviews/${reviewId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token1}` },
    body: { status: 'closed' }
  });
  assert.strictEqual(aliceClose.status, 200);
  assert.strictEqual(aliceClose.data.data.status, 'closed');
  console.log(`  ✔ Project owner successfully closed the review`);

  // Step 7: Decline Workflow on Separate Invite
  console.log('\n[8/8] Step 7: Testing Invitation Decline Workflow with Charlie...');
  const invCharlie = await request(`/projects/${projectId}/members/invitations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: { userId: user3Id }
  });
  assert.strictEqual(invCharlie.status, 201);
  const charlieMemberId = invCharlie.data.data.id;

  // Charlie declines
  const declineRes = await request(`/notifications/invitations/${charlieMemberId}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token3}` }
  });
  assert.strictEqual(declineRes.status, 200);

  const [charlieRows] = await pool.query('SELECT * FROM project_members WHERE id = ?', [charlieMemberId]);
  assert.strictEqual(charlieRows[0].status, 'rejected');
  assert.strictEqual(charlieRows[0].joined_at, null);

  // Charlie accesses private project -> 403
  const charlieAccess = await request(`/projects/${projectId}`, { headers: { Authorization: `Bearer ${token3}` } });
  assert.strictEqual(charlieAccess.status, 403);
  console.log(`  ✔ Charlie declined: status='rejected', zero access to private project (HTTP 403)`);

  // Step 8: Persistence across Server Restart
  console.log('\n[+] Verifying persistence across backend server restart...');
  await stopServer();
  await startServer();
  console.log(`Backend restarted on new ephemeral port: ${baseUrl}`);

  const pBobAfterRestart = await request(`/projects/${projectId}`, { headers: { Authorization: `Bearer ${token2}` } });
  assert.strictEqual(pBobAfterRestart.status, 200);
  assert.strictEqual(pBobAfterRestart.data.data.userRole, 'collaborator');
  console.log(`  ✔ Persistence verified: Bob retains collaborator access after restart`);

  await stopServer();
  await close();

  console.log('\n================================================================');
  console.log('   ALL REAL MYSQL API WORKFLOW TESTS PASSED WITHOUT ERRORS      ');
  console.log('================================================================\n');
}

runWorkflow().catch(err => {
  console.error('\n[FATAL ERROR in workflow test]:', err);
  process.exit(1);
});
