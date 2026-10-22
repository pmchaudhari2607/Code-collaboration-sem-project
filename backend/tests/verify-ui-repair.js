const assert = require('assert');

const BASE_URL = 'http://localhost:5000/api';

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('=== VERIFYING UI + BACKEND FUNCTIONALITY REPAIR ===\n');

  // 1. Health check
  console.log('1. Checking backend health...');
  const health = await req('/health');
  assert.strictEqual(health.status, 200, 'Health endpoint must return 200');
  console.log('   ✔ Health status:', health.data);

  // 2. Auth: Login as existing user 'prasanna'
  console.log('\n2. Testing authentication with existing account...');
  const loginRes = await req('/auth/login', {
    method: 'POST',
    body: { identifier: 'prasanna', password: 'password' }
  });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const user1 = loginRes.data.data.user;
  const token1 = loginRes.data.data.token;
  console.log(`   ✔ Logged in as: ${user1.full_name} (@${user1.username})`);

  // 3. User search (must NOT expose passwords or password_hash)
  console.log('\n3. Testing user search privacy...');
  const searchRes = await req('/users/search?q=himesh', {
    headers: { Authorization: `Bearer ${token1}` }
  });
  assert.strictEqual(searchRes.status, 200);
  const foundUsers = searchRes.data.data;
  assert.ok(foundUsers.length > 0, 'Should find user himesh');
  const targetUser = foundUsers[0];
  assert.strictEqual(targetUser.password_hash, undefined, 'Must not leak password_hash');
  assert.strictEqual(targetUser.password, undefined, 'Must not leak password');
  console.log(`   ✔ User search safe: found @${targetUser.username} (${targetUser.full_name}) without sensitive fields`);

  // 4. Create Project
  console.log('\n4. Testing project creation...');
  const projRes = await req('/projects', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: {
      name: `UI Repair Project ${Date.now()}`,
      description: 'Project created during verification',
      category: 'Java',
      visibility: 'private'
    }
  });
  assert.strictEqual(projRes.status, 201);
  const project = projRes.data.data;
  console.log(`   ✔ Created private project: ${project.name} (${project.id})`);

  // 5. Create Code File & Version 1
  console.log('\n5. Testing file creation and version 1...');
  const fileRes = await req(`/files/project/${project.id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: {
      file_name: 'App.java',
      language: 'Java',
      current_code: 'public class App {\n    public static void main(String[] args) {\n        System.out.println("Hello V1");\n    }\n}\n'
    }
  });
  assert.strictEqual(fileRes.status, 201);
  const file = fileRes.data.data;
  assert.ok(file.id, 'File must have id');
  const versionsRes = await req(`/files/${file.id}/versions`, {
    headers: { Authorization: `Bearer ${token1}` }
  });
  assert.strictEqual(versionsRes.status, 200);
  assert.strictEqual(versionsRes.data.data.length, 1);
  assert.strictEqual(versionsRes.data.data[0].version_number, 1);
  console.log(`   ✔ Created file ${file.file_name} with initial Version 1`);

  // 6. Save as New Version (Version 2)
  console.log('\n6. Testing Save as New Version (Version 2)...');
  const v2Res = await req(`/files/${file.id}/versions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: {
      code: 'public class App {\n    public static void main(String[] args) {\n        System.out.println("Hello V2 - Updated");\n    }\n}\n',
      note: 'Updated print statement'
    }
  });
  assert.strictEqual(v2Res.status, 201);
  assert.strictEqual(v2Res.data.data.version_number, 2);
  console.log(`   ✔ Created Version 2 with note: "${v2Res.data.data.note}"`);

  // 7. Add Review Comment
  console.log('\n7. Testing code review comment creation...');
  const revRes = await req(`/files/${file.id}/reviews`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: {
      version_id: v2Res.data.data.id,
      line_number: 3,
      review_type: 'suggestion',
      comment: 'Consider logging via Logger rather than System.out'
    }
  });
  assert.strictEqual(revRes.status, 201);
  const review = revRes.data.data;
  console.log(`   ✔ Added line review at line ${review.line_number}: "${review.comment}"`);

  // 8. Member Invitation Flow (Prasanna -> Himesh)
  console.log('\n8. Testing invitation workflow (Owner -> Collaborator)...');
  const inviteRes = await req(`/projects/${project.id}/members/invitations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: { userId: targetUser.id, role: 'collaborator' }
  });
  assert.strictEqual(inviteRes.status, 201);
  const memberRecord = inviteRes.data.data;
  assert.strictEqual(memberRecord.status, 'pending');
  console.log(`   ✔ Invitation created with status 'pending' (member record ${memberRecord.id})`);

  // 9. Prevent Duplicate Invitation
  console.log('\n9. Testing duplicate invitation prevention...');
  const dupRes = await req(`/projects/${project.id}/members/invitations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: { userId: targetUser.id, role: 'collaborator' }
  });
  assert.strictEqual(dupRes.status, 409, 'Duplicate invitation must return 409 Conflict');
  console.log('   ✔ Duplicate invitation rejected with 409 Conflict');

  // 10. Login as Recipient (Himesh) and Verify Notification
  console.log('\n10. Testing recipient notification and acceptance...');
  const login2Res = await req('/auth/login', {
    method: 'POST',
    body: { identifier: 'himesh', password: 'password' }
  });
  assert.strictEqual(login2Res.status, 200);
  const token2 = login2Res.data.data.token;

  // Before accept: Himesh tries to access private project -> 403 Forbidden
  const preAccess = await req(`/projects/${project.id}`, {
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.strictEqual(preAccess.status, 403, 'Pending invitee cannot access private project before accepting');
  console.log('   ✔ Pre-acceptance security gate verified: 403 Forbidden for private project');

  // Recipient checks notifications
  const notifsRes = await req('/notifications', {
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.strictEqual(notifsRes.status, 200);
  const inviteNotif = notifsRes.data.data.find(n => n.type === 'invitation' && n.reference_id === memberRecord.id);
  assert.ok(inviteNotif, 'Recipient must have received invitation notification');
  assert.strictEqual(inviteNotif.memberContext.status, 'pending');
  console.log(`   ✔ Recipient received invitation notification: "${inviteNotif.message}"`);

  // Recipient accepts invitation
  const acceptRes = await req(`/notifications/invitations/${memberRecord.id}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.strictEqual(acceptRes.status, 200);
  console.log('   ✔ Recipient accepted invitation');

  // After accept: Himesh accesses private project -> 200 OK with collaborator role
  const postAccess = await req(`/projects/${project.id}`, {
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.strictEqual(postAccess.status, 200);
  assert.strictEqual(postAccess.data.data.userRole, 'collaborator');
  console.log(`   ✔ Post-acceptance verified: userRole is now '${postAccess.data.data.userRole}'`);

  // 11. Dashboard Stats
  console.log('\n11. Testing dashboard stats accuracy...');
  const statsRes = await req('/dashboard/stats', {
    headers: { Authorization: `Bearer ${token1}` }
  });
  assert.strictEqual(statsRes.status, 200);
  assert.ok(statsRes.data.data.totalProjects >= 1);
  assert.ok(statsRes.data.data.totalFiles >= 1);
  console.log('   ✔ Dashboard stats returned accurate database counts:', statsRes.data.data);

  // 12. Testing Decline Invitation Workflow
  console.log('\n12. Testing decline invitation workflow...');
  const proj2Res = await req('/projects', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: {
      name: `Decline Test Project ${Date.now()}`,
      description: 'Project to test decline workflow',
      category: 'C',
      visibility: 'private'
    }
  });
  const proj2 = proj2Res.data.data;
  
  const invite2Res = await req(`/projects/${proj2.id}/members/invitations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token1}` },
    body: { userId: targetUser.id, role: 'collaborator' }
  });
  assert.strictEqual(invite2Res.status, 201);
  const member2Record = invite2Res.data.data;

  // Himesh declines
  const declineRes = await req(`/notifications/invitations/${member2Record.id}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.strictEqual(declineRes.status, 200);
  console.log('   ✔ Recipient declined invitation');

  // Verify Himesh cannot access project 2
  const noAccessRes = await req(`/projects/${proj2.id}`, {
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.strictEqual(noAccessRes.status, 403, 'Declined invitee must not have access to private project');
  console.log('   ✔ Declined invitee access correctly blocked (403 Forbidden)');

  // Verify double response is rejected with 409
  const doubleRes = await req(`/notifications/invitations/${member2Record.id}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token2}` }
  });
  assert.strictEqual(doubleRes.status, 409, 'Double response must be rejected with 409 Conflict');
  console.log('   ✔ Double response correctly rejected with 409 Conflict');

  // 13. Testing Delete Account HTTP Workflow
  console.log('\n13. Testing Delete Account HTTP workflow...');
  const tempUsername = `temp_${Date.now().toString().slice(-6)}`;
  const regDelRes = await req('/auth/register', {
    method: 'POST',
    body: {
      full_name: 'Temporary User',
      username: tempUsername,
      email: `${tempUsername}@example.com`,
      password: 'TempPassword123!',
      confirm_password: 'TempPassword123!'
    }
  });
  assert.strictEqual(regDelRes.status, 201);
  const delUserToken = regDelRes.data.data.token;
  const delUserId = regDelRes.data.data.user.id;

  // Disposable user creates private project
  const delProjRes = await req('/projects', {
    method: 'POST',
    headers: { Authorization: `Bearer ${delUserToken}` },
    body: {
      name: `Temp Project ${Date.now()}`,
      description: 'Will be deleted with user',
      category: 'Java',
      visibility: 'private'
    }
  });
  assert.strictEqual(delProjRes.status, 201);
  const delProjId = delProjRes.data.data.id;

  // Missing password -> 400
  const noPwRes = await req('/users/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${delUserToken}` },
    body: {}
  });
  assert.strictEqual(noPwRes.status, 400);
  console.log('   ✔ Missing password rejected with 400');

  // Wrong password -> 401
  const wrongPwRes = await req('/users/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${delUserToken}` },
    body: { password: 'WrongPassword' }
  });
  assert.strictEqual(wrongPwRes.status, 401);
  console.log('   ✔ Wrong password rejected with 401');

  // Correct password -> 200
  const delSuccessRes = await req('/users/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${delUserToken}` },
    body: { password: 'TempPassword123!' }
  });
  assert.strictEqual(delSuccessRes.status, 200);
  console.log('   ✔ Account successfully deleted with 200 OK');

  // Trying to log in as deleted user -> 401
  const reLoginRes = await req('/auth/login', {
    method: 'POST',
    body: { identifier: tempUsername, password: 'TempPassword123!' }
  });
  assert.strictEqual(reLoginRes.status, 401);
  console.log('   ✔ Deleted user cannot log in (401)');

  console.log('\n=== ALL UI & FUNCTIONALITY CHECKS PASSED SUCCESSFULLY ===\n');
}

run().catch(err => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
