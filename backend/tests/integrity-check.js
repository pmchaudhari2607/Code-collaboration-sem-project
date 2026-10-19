const assert = require('assert');
const store = require('../data/store');
const { newId } = require('../utils/id');
const projectService = require('../services/projectService');
const fileService = require('../services/fileService');
const reviewService = require('../services/reviewService');
const taskService = require('../services/taskService');
const userService = require('../services/userService');

function assertNoOrphans(db) {
  const users = db.all('users');
  const projects = db.all('projects');
  const members = db.all('project_members');
  const files = db.all('code_files');
  const versions = db.all('code_versions');
  const reviews = db.all('reviews');
  const tasks = db.all('tasks');
  const notifs = db.all('notifications');
  const activity = db.all('activity');
  const messages = db.all('messages');

  const userIds = new Set(users.map(u => u.id));
  const projectIds = new Set(projects.map(p => p.id));
  const fileIds = new Set(files.map(f => f.id));
  const versionMap = new Map(versions.map(v => [v.id, v]));
  const reviewIds = new Set(reviews.map(r => r.id));

  // project_members
  for (const m of members) {
    assert(projectIds.has(m.project_id), `Orphan member: project ${m.project_id} not found`);
    assert(userIds.has(m.user_id), `Orphan member: user ${m.user_id} not found`);
  }

  // code_files
  for (const f of files) {
    assert(projectIds.has(f.project_id), `Orphan file: project ${f.project_id} not found`);
  }

  // code_versions
  for (const v of versions) {
    assert(fileIds.has(v.file_id), `Orphan version: file ${v.file_id} not found`);
  }

  // reviews
  for (const r of reviews) {
    assert(fileIds.has(r.file_id), `Orphan review: file ${r.file_id} not found`);
    assert(versionMap.has(r.version_id), `Orphan review: version ${r.version_id} not found`);
    assert(userIds.has(r.reviewer_id), `Orphan review: reviewer ${r.reviewer_id} not found`);
    const v = versionMap.get(r.version_id);
    assert.strictEqual(v.file_id, r.file_id, `Review version ${r.version_id} does not belong to review file ${r.file_id}`);
  }

  // tasks
  for (const t of tasks) {
    assert(projectIds.has(t.project_id), `Orphan task: project ${t.project_id} not found`);
    if (t.review_id !== null && t.review_id !== undefined) {
      assert(reviewIds.has(t.review_id), `Orphan task review_id: ${t.review_id} not found in reviews`);
    }
    if (t.assigned_to !== null && t.assigned_to !== undefined) {
      assert(userIds.has(t.assigned_to), `Orphan task assigned_to: ${t.assigned_to} not found in users`);
    }
  }

  // notifications
  for (const n of notifs) {
    assert(userIds.has(n.user_id), `Orphan notification user: ${n.user_id}`);
    if (n.project_id) {
      assert(projectIds.has(n.project_id), `Orphan notification project: ${n.project_id}`);
    }
  }

  // activity
  for (const a of activity) {
    assert(projectIds.has(a.project_id), `Orphan activity project: ${a.project_id}`);
  }

  // messages
  for (const m of messages) {
    assert(projectIds.has(m.project_id), `Orphan message project: ${m.project_id}`);
  }
}

function assertReviewInvariants(db) {
  const reviews = db.all('reviews');
  for (const r of reviews) {
    if (r.status === 'open') {
      assert.strictEqual(r.resolved_at, null, `Open review ${r.id} must have resolved_at null`);
      assert.strictEqual(r.closed_at, null, `Open review ${r.id} must have closed_at null`);
    } else if (r.status === 'resolved') {
      assert(r.resolved_at !== null && r.resolved_at !== undefined, `Resolved review ${r.id} must have resolved_at set`);
    } else if (r.status === 'closed') {
      assert(r.closed_at !== null && r.closed_at !== undefined, `Closed review ${r.id} must have closed_at set`);
    } else {
      assert.fail(`Invalid review status: ${r.status}`);
    }
  }
}

function runIntegrityChecks() {
  console.log('--- Starting CodeReviewHub In-Memory Integrity Checks ---');

  // 1. Fresh store assertions on Seed
  store.reset();
  console.log('[TEST] Checking seed data for orphans and invariants...');
  assertNoOrphans(store);
  assertReviewInvariants(store);
  console.log('[PASS] Seed data has no orphans and satisfies review invariants.');

  // 2. ID helper tests
  console.log('[TEST] Checking newId() helper (500 IDs, uniqueness, <= 40 chars, prefixes)...');
  const prefixes = ['u', 'p', 'm', 'f', 'v', 'r', 't', 'n', 'a', 'msg'];
  const generatedIds = new Set();
  for (let i = 0; i < 500; i++) {
    const prefix = prefixes[i % prefixes.length];
    const id = newId(prefix);
    assert(id.startsWith(`${prefix}_`), `ID ${id} must start with ${prefix}_`);
    assert(id.length <= 40, `ID ${id} exceeds 40 characters (length: ${id.length})`);
    assert(!generatedIds.has(id), `Duplicate ID generated: ${id}`);
    generatedIds.add(id);
  }
  console.log('[PASS] newId() generated 500 unique valid IDs <= 40 chars.');

  // 3. Partial updates keep other fields
  console.log('[TEST] Checking partial updates preserve unmentioned fields...');
  const testTask = taskService.create({
    project_id: 'p1',
    title: 'Original Title',
    description: 'Original Desc',
    priority: 'high',
    assigned_to: 'u2',
    due_date: '2026-11-01'
  }, 'u1');

  const updatedTask = taskService.update(testTask.id, { status: 'completed' }, 'u1');
  assert.strictEqual(updatedTask.status, 'completed');
  assert.strictEqual(updatedTask.title, 'Original Title');
  assert.strictEqual(updatedTask.description, 'Original Desc');
  assert.strictEqual(updatedTask.priority, 'high');
  assert.strictEqual(updatedTask.assigned_to, 'u2');
  assert.strictEqual(updatedTask.due_date, '2026-11-01');

  const testProject = projectService.create('u1', {
    name: 'Integrity Project',
    description: 'Keep me',
    visibility: 'public',
    category: 'Java'
  });
  const updatedProject = projectService.update(testProject.id, { visibility: 'private' });
  assert.strictEqual(updatedProject.visibility, 'private');
  assert.strictEqual(updatedProject.name, 'Integrity Project');
  assert.strictEqual(updatedProject.description, 'Keep me');
  assert.strictEqual(updatedProject.category, 'Java');

  const updatedUser = userService.updateMe('u1', { bio: 'A dedicated engineer' });
  assert.strictEqual(updatedUser.bio, 'A dedicated engineer');
  assert.strictEqual(updatedUser.full_name, 'Prasanna Chaudhari');
  assert.strictEqual(updatedUser.email, 'prasanna@example.com');
  console.log('[PASS] Partial updates verified: existing fields are preserved.');

  // 4. Review Lifecycle Invariants
  console.log('[TEST] Checking review lifecycle invariants across transitions...');
  const file = fileService.create(testProject.id, { file_name: 'Test.java', language: 'Java' }, 'u1');
  const review = reviewService.create(file.id, {
    version_id: file.versions[0].id,
    line_number: 1,
    review_type: 'bug',
    comment: 'Check invariant transition'
  }, 'u1');

  assert.strictEqual(review.status, 'open');
  assert.strictEqual(review.reopen_count, 0);
  assert.strictEqual(review.resolved_at, null);
  assert.strictEqual(review.closed_at, null);
  assertReviewInvariants(store);

  // Transition: open -> resolved
  const resolved = reviewService.updateStatus(review.id, 'resolved', 'u1');
  assert.strictEqual(resolved.status, 'resolved');
  assert(resolved.resolved_at !== null);
  assert.strictEqual(resolved.closed_at, null);
  assertReviewInvariants(store);

  // Transition: resolved -> closed
  const closed = reviewService.updateStatus(review.id, 'closed', 'u1');
  assert.strictEqual(closed.status, 'closed');
  assert(closed.closed_at !== null);
  assert(closed.resolved_at !== null);
  assertReviewInvariants(store);

  // Transition: closed -> open (reopen)
  const reopened = reviewService.updateStatus(review.id, 'open', 'u1');
  assert.strictEqual(reopened.status, 'open');
  assert.strictEqual(reopened.reopen_count, 1);
  assert.strictEqual(reopened.resolved_at, null);
  assert.strictEqual(reopened.closed_at, null);
  assert(reopened.reopened_at !== null);
  assertReviewInvariants(store);
  console.log('[PASS] Review lifecycle transitions and invariants verified.');

  // 5. Cascade deletes: File delete (task survives with review_id null)
  console.log('[TEST] Checking file cascade delete: task survives with review_id null...');
  const taskFromRev = taskService.create({
    project_id: testProject.id,
    review_id: review.id,
    title: 'Task from review',
    priority: 'medium'
  }, 'u1');
  assert.strictEqual(taskFromRev.review_id, review.id);

  fileService.remove(file.id, 'u1');

  // Verify file, version, review deleted
  assert.strictEqual(store.findById('code_files', file.id), undefined);
  assert.strictEqual(store.findById('code_versions', file.versions[0].id), undefined);
  assert.strictEqual(store.findById('reviews', review.id), undefined);

  // Verify task survived with review_id null
  const survivingTask = store.findById('tasks', taskFromRev.id);
  assert(survivingTask !== undefined, 'Task must survive file deletion');
  assert.strictEqual(survivingTask.review_id, null, 'Surviving task must have review_id set to null');

  assertNoOrphans(store);
  console.log('[PASS] File delete cascaded correctly and surviving task review_id nulled.');

  // 6. Cascade deletes: Project delete removes all owned entities
  console.log('[TEST] Checking project cascade delete removes all owned entities...');
  projectService.remove(testProject.id);

  assert.strictEqual(store.findById('projects', testProject.id), undefined);
  assert.strictEqual(store.findById('tasks', taskFromRev.id), undefined);
  assert.strictEqual(store.filter('activity', a => a.project_id === testProject.id).length, 0);
  assert.strictEqual(store.filter('project_members', m => m.project_id === testProject.id).length, 0);

  assertNoOrphans(store);
  console.log('[PASS] Project delete cascaded cleanly with no remaining orphans.');

  console.log('--- All In-Memory Integrity Checks PASSED ---');
}

if (require.main === module) {
  try {
    runIntegrityChecks();
    process.exit(0);
  } catch (err) {
    console.error('[FAIL] Integrity check failed:', err);
    process.exit(1);
  }
}

module.exports = {
  assertNoOrphans,
  assertReviewInvariants,
  runIntegrityChecks
};
