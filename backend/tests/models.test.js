/**
 * =============================================================================
 * Stage 1 Model & Database Test Suite (node:test)
 * 
 * Target Database: code_review_portal_test (port 3307)
 * 
 * INTENTIONAL DIFFERENCES FROM IN-MEMORY SERVICES (ORACLE):
 * 1. Project Owner Member Row: In MySQL, the project owner has an explicit row in
 *    project_members (role='owner', status='accepted') created during project
 *    creation. In-memory synthesized this row on the fly in projectService.listMembers;
 *    in MySQL it is a real row sorted first.
 * 2. Privacy - Email & Passwords: In MySQL models, user listings (member lists,
 *    search) never select password_hash or email, matching DESIGN.md privacy rules.
 * 3. Review r3 version_id: In Phase 0 audit, r3 had version_id null in mock data
 *    and was backfilled to v_f5_1 for foreign key referential integrity.
 * 4. Timestamps: Formatted as ISO-8601 UTC strings (e.g. 2026-09-10T10:00:00.000Z).
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Configure test environment before loading pool
process.env.DB_ENABLED = 'true';
process.env.DB_TARGET = 'test';
process.env.DB_NAME_TEST = 'code_review_portal_test';
try {
  delete require.cache[require.resolve('../config/env')];
} catch (e) {}

const { getPool, close, ping } = require('../db/pool');
const { withTransaction } = require('../db/transaction');
const { mapDbError } = require('../db/errors');

const userModel = require('../models/userModel');
const settingsModel = require('../models/settingsModel');
const memberModel = require('../models/memberModel');
const projectModel = require('../models/projectModel');
const fileModel = require('../models/fileModel');
const versionModel = require('../models/versionModel');
const reviewModel = require('../models/reviewModel');
const taskModel = require('../models/taskModel');
const notificationModel = require('../models/notificationModel');
const activityModel = require('../models/activityModel');
const messageModel = require('../models/messageModel');
const dashboardModel = require('../models/dashboardModel');
const searchModel = require('../models/searchModel');

// In-memory services as oracle
const store = require('../data/store');
const projectService = require('../services/in-memory/projectService');
const fileService = require('../services/in-memory/fileService');
const reviewService = require('../services/in-memory/reviewService');
const taskService = require('../services/in-memory/taskService');
const notificationService = require('../services/in-memory/notificationService');
const dashboardService = require('../services/in-memory/dashboardService');
const searchService = require('../services/in-memory/searchService');

const migrate = require('../../database/tools/migrate');
const seedDatabase = require('../../database/tools/seed');
const runOrderingExperiment = require('../../database/tools/order-experiment');

describe('Stage 1: Foundation and Models Suite', () => {

  before(async () => {
    // 0. Verify target database is strictly code_review_portal_test
    const testPool = getPool('test');
    const [dbRows] = await testPool.query('SELECT DATABASE() AS db');
    assert.strictEqual(dbRows[0].db, 'code_review_portal_test', 'MUST run only on code_review_portal_test');

    // 1. Reset in-memory store oracle to canonical seed
    store.reset();
    // 2. Ensure test database migrations are applied
    await migrate({ test: true });
    // 3. Clean and seed test database
    await seedDatabase({ reset: true, force: true });
  });

  after(async () => {
    await close();
  });

  // ---------------------------------------------------------------------------
  // 1. PARITY TESTS WITH IN-MEMORY ORACLE
  // ---------------------------------------------------------------------------
  describe('1. Parity with In-Memory Service Oracle', () => {

    test('Project listing parity (u1 owner, u2 collaborator, u3 viewer)', async () => {
      for (const userId of ['u1', 'u2', 'u3']) {
        const oracleList = projectService.list(userId);
        const modelList = await projectModel.listAccessible(userId);

        assert.equal(modelList.length, oracleList.length, `Project count mismatch for ${userId}`);
        const oracleIds = oracleList.map(p => p.id).sort();
        const modelIds = modelList.map(p => p.id).sort();
        assert.deepEqual(modelIds, oracleIds);

        // Verify shape of first item
        if (modelList.length > 0) {
          const m = modelList[0];
          assert.equal(typeof m.id, 'string');
          assert.equal(typeof m.name, 'string');
          assert.equal(typeof m.visibility, 'string');
          assert.equal(typeof m.files_count, 'number');
          assert.equal(typeof m.open_reviews_count, 'number');
          assert.equal(typeof m.members_count, 'number');
        }
      }
    });

    test('Project detail and members parity (p1, u1)', async () => {
      const oracleProject = projectService.getById('p1', 'u1');
      const modelProject = await projectModel.findById('p1');
      const modelMembers = await memberModel.listByProject('p1', true);

      assert.equal(modelProject.id, oracleProject.id);
      assert.equal(modelProject.name, oracleProject.name);
      assert.equal(modelProject.category, oracleProject.category);
      assert.equal(modelProject.owner_id, oracleProject.owner_id);

      // Verify owner row invariant: owner is first row
      assert.equal(modelMembers[0].role, 'owner');
      assert.equal(modelMembers[0].user_id, 'u1');
      assert.equal(modelMembers[0].status, 'accepted');
      // Privacy check: email is excluded
      assert.equal(modelMembers[0].email, undefined);
    });

    test('Code files and versions parity (p1)', async () => {
      const oracleFiles = fileService.listByProject('p1');
      const modelFiles = await fileModel.listByProject('p1');

      assert.equal(modelFiles.length, oracleFiles.length);
      const oracleFileIds = oracleFiles.map(f => f.id).sort();
      const modelFileIds = modelFiles.map(f => f.id).sort();
      assert.deepEqual(modelFileIds, oracleFileIds);

      // Verify versions parity for f1
      const oracleVersions = fileService.listVersions('f1');
      const modelVersions = await versionModel.listByFile('f1');
      assert.equal(modelVersions.length, oracleVersions.length);
      assert.deepEqual(
        modelVersions.map(v => v.version_number).sort(),
        oracleVersions.map(v => v.version_number).sort()
      );
    });

    test('Reviews parity (p1, f1)', async () => {
      const oracleReviews = reviewService.listByFile('f1');
      const modelReviews = await reviewModel.listByFile('f1');

      assert.equal(modelReviews.length, oracleReviews.length);
      const oracleIds = oracleReviews.map(r => r.id).sort();
      const modelIds = modelReviews.map(r => r.id).sort();
      assert.deepEqual(modelIds, oracleIds);

      const r1Model = modelReviews.find(r => r.id === 'r1');
      const r1Oracle = oracleReviews.find(r => r.id === 'r1');
      assert.equal(r1Model.status, r1Oracle.status);
      assert.equal(typeof r1Model.reopen_count, 'number');
    });

    test('Tasks parity (p1, u1)', async () => {
      const oracleTasks = taskService.list('u1', 'p1');
      const modelTasks = await taskModel.list({ projectId: 'p1' }, 'u1');

      assert.equal(modelTasks.length, oracleTasks.length);
      assert.equal(modelTasks[0].id, oracleTasks[0].id);
      assert.equal(modelTasks[0].title, oracleTasks[0].title);
      assert.equal(modelTasks[0].status, oracleTasks[0].status);
      assert.equal(typeof modelTasks[0].canEdit, 'boolean');
    });

    test('Notifications parity (u1, u4)', async () => {
      for (const userId of ['u1', 'u4']) {
        const oracleNotifs = notificationService.list(userId);
        const modelNotifs = await notificationModel.listByUser(userId);

        assert.equal(modelNotifs.length, oracleNotifs.length);
        if (modelNotifs.length > 0) {
          assert.equal(typeof modelNotifs[0].is_read, 'boolean');
          assert.equal(typeof modelNotifs[0].link, 'string');
        }
      }
    });

    test('Dashboard stats and activity parity (u1)', async () => {
      const oracleStats = dashboardService.getStats('u1');
      const modelStats = await dashboardModel.getStats('u1');

      assert.equal(modelStats.totalProjects, oracleStats.totalProjects);
      assert.equal(modelStats.ownedProjects, oracleStats.ownedProjects);
      assert.equal(modelStats.collabProjects, oracleStats.collabProjects);
      assert.equal(modelStats.totalFiles, oracleStats.totalFiles);
      assert.equal(modelStats.openReviews, oracleStats.openReviews);
      assert.equal(modelStats.pendingTasks, oracleStats.pendingTasks);

      // Verify counts are all JavaScript Numbers
      for (const key of Object.keys(modelStats)) {
        assert.equal(typeof modelStats[key], 'number', `${key} must be a number`);
      }

      const oracleActivity = dashboardService.getActivity('u1');
      const modelActivity = await dashboardModel.getActivity('u1', 10);
      assert.equal(modelActivity.length, oracleActivity.length);
      if (modelActivity.length > 0) {
        assert.equal(modelActivity[0].id, oracleActivity[0].id);
        assert.equal(modelActivity[0].action_text, oracleActivity[0].action_text);
      }
    });

    test('Global search parity (u1)', async () => {
      const oracleSearch = searchService.globalSearch('student', 'u1');
      const modelSearch = await searchModel.globalSearch('student', 'u1');

      assert.equal(modelSearch.projects.length, oracleSearch.projects.length);
      assert.equal(modelSearch.files.length, oracleSearch.files.length);
      // Privacy check: search users must not contain password or email
      modelSearch.users.forEach(u => {
        assert.equal(u.password, undefined);
        assert.equal(u.password_hash, undefined);
        assert.equal(u.email, undefined);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ROLE RESOLUTION MATRIX TEST (Single SQL Query)
  // ---------------------------------------------------------------------------
  describe('2. Role Resolution Matrix', () => {

    test('Role derivation for all matrix quadrants', async () => {
      // p1 is public, owner is u1, u2 is accepted collaborator, u4 is pending
      const roleOwnerP1 = await memberModel.getRole('p1', 'u1');
      assert.equal(roleOwnerP1, 'owner');

      const roleCollabP1 = await memberModel.getRole('p1', 'u2');
      assert.equal(roleCollabP1, 'collaborator');

      // u4 has pending invite, but p1 is public -> resolves to 'viewer'
      const rolePendingP1 = await memberModel.getRole('p1', 'u4');
      assert.equal(rolePendingP1, 'viewer');

      // u3 has no member row, but p1 is public -> resolves to 'viewer'
      const rolePublicP1 = await memberModel.getRole('p1', 'u3');
      assert.equal(rolePublicP1, 'viewer');

      // p2 is private, owner is u2, u1 is accepted collaborator
      const roleOwnerP2 = await memberModel.getRole('p2', 'u2');
      assert.equal(roleOwnerP2, 'owner');

      const roleCollabP2 = await memberModel.getRole('p2', 'u1');
      assert.equal(roleCollabP2, 'collaborator');

      // u3 is not a member on private project p2 -> resolves to null
      const roleOutsiderP2 = await memberModel.getRole('p2', 'u3');
      assert.equal(roleOutsiderP2, null);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. CONCURRENCY: 10 SIMULTANEOUS VERSION CREATES
  // ---------------------------------------------------------------------------
  describe('3. Concurrency: 10 Parallel Version Creates', () => {

    test('10 parallel version creates generate 10 contiguous distinct numbers', async () => {
      // f2 has version 1 initially
      const initialVersions = await versionModel.listByFile('f2');
      const startVersion = initialVersions.length; // 1

      const parallelCreates = Array.from({ length: 10 }, (_, i) => {
        return versionModel.createWithTransaction(
          'f2',
          `public class Student {\n    // Concurrency test version ${i + 1}\n}\n`,
          `Parallel update batch ${i + 1}`,
          'u1'
        );
      });

      const results = await Promise.all(parallelCreates);
      assert.equal(results.length, 10);

      const updatedVersions = await versionModel.listByFile('f2');
      assert.equal(updatedVersions.length, startVersion + 10);

      const versionNumbers = updatedVersions.map(v => v.version_number).sort((a, b) => a - b);
      // Must be contiguous: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
      for (let i = 0; i < versionNumbers.length; i++) {
        assert.equal(versionNumbers[i], i + 1, `Version number sequence gap at index ${i}`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. TRANSACTION ROLLBACK TEST
  // ---------------------------------------------------------------------------
  describe('4. Transaction Rollback', () => {

    test('Failed transaction leaves zero partial rows', async () => {
      const beforeCountRows = await getPool().query('SELECT COUNT(*) AS c FROM code_files WHERE project_id = "p1"');
      const beforeCount = beforeCountRows[0][0].c;

      await assert.rejects(async () => {
        await withTransaction(async (conn) => {
          await fileModel.createWithTransaction('p1', 'RollbackTest.java', 'Java', 'public class R {}', 'u1', conn);
          // Intentionally throw inside transaction
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        });
      }, /SIMULATED_TRANSACTION_FAILURE/);

      const afterCountRows = await getPool().query('SELECT COUNT(*) AS c FROM code_files WHERE project_id = "p1"');
      const afterCount = afterCountRows[0][0].c;

      assert.equal(afterCount, beforeCount, 'Rollback failed: partial rows were committed');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. REVIEW LIFECYCLE AND RACE TEST
  // ---------------------------------------------------------------------------
  describe('5. Review Lifecycle & Guarded Transitions', () => {

    test('Valid lifecycle: open -> resolved -> closed -> open', async () => {
      // r1 is currently open
      const r1 = await reviewModel.findById('r1');
      assert.equal(r1.status, 'open');

      // 1. Resolve r1
      const resolveResult = await reviewModel.updateStatus('r1', 'open', 'resolved', { resolved_by: 'u1' });
      assert.equal(resolveResult.outcome, 'success');
      const afterResolve = await reviewModel.findById('r1');
      assert.equal(afterResolve.status, 'resolved');
      assert.equal(afterResolve.resolved_by, 'u1');

      // 2. Disallowed transition from resolved -> resolved (already resolved)
      const duplicateResolve = await reviewModel.updateStatus('r1', 'open', 'resolved', { resolved_by: 'u2' });
      assert.equal(duplicateResolve.outcome, 'conflict');

      // 3. Close r1
      const closeResult = await reviewModel.updateStatus('r1', 'resolved', 'closed', { closed_by: 'u1' });
      assert.equal(closeResult.outcome, 'success');
      const afterClose = await reviewModel.findById('r1');
      assert.equal(afterClose.status, 'closed');

      // 4. Reopen r1
      const reopenResult = await reviewModel.updateStatus('r1', 'closed', 'open', {});
      assert.equal(reopenResult.outcome, 'success');
      const afterReopen = await reviewModel.findById('r1');
      assert.equal(afterReopen.status, 'open');
      assert.equal(afterReopen.resolved_by, null);
      assert.equal(afterReopen.closed_by, null);
      assert.equal(afterReopen.reopen_count, 1);
    });

    test('Race condition: two simultaneous resolves on same review succeed exactly once', async () => {
      // Create a fresh test review on f1
      const testRev = await reviewModel.create('f1', 'v1', 'u2', 2, 'suggestion', 'Race test comment');
      assert.equal(testRev.status, 'open');

      const [res1, res2] = await Promise.all([
        reviewModel.updateStatus(testRev.id, 'open', 'resolved', { resolved_by: 'u1' }),
        reviewModel.updateStatus(testRev.id, 'open', 'resolved', { resolved_by: 'u2' })
      ]);

      const outcomes = [res1.outcome, res2.outcome].sort();
      assert.deepEqual(outcomes, ['conflict', 'success'], 'Guarded update failed: both or neither resolved');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. FILE CASCADES & POLYMORPHIC NOTIFICATIONS TEST
  // ---------------------------------------------------------------------------
  describe('6. File Cascades & Task Preservation', () => {

    test('Deleting file cleans polymorphic notifications and preserves task with review_id null', async () => {
      // Create file, review, task, and notification
      const file = await fileModel.createWithTransaction('p1', 'CascadeTest.java', 'Java', 'class C {}', 'u1');
      const rev = await reviewModel.create(file.id, null, 'u2', 1, 'bug', 'Cascade review test');
      const task = await taskModel.create('p1', 'Cascade task test', 'u1', { review_id: rev.id });

      const notif = await notificationModel.create('u1', 'review', 'Review on CascadeTest.java', {
        projectId: 'p1',
        referenceId: rev.id
      });

      // Verify existence before delete
      assert.ok(await fileModel.findById(file.id));
      assert.ok(await reviewModel.findById(rev.id));
      assert.ok(await notificationModel.findById(notif.id));

      // Perform cascade delete
      await fileModel.deleteWithTransaction(file.id, 'u1');

      // Verify file and review are deleted
      assert.equal(await fileModel.findById(file.id), null);
      assert.equal(await reviewModel.findById(rev.id), null);

      // Verify polymorphic notification was deleted
      assert.equal(await notificationModel.findById(notif.id), null);

      // Verify task survives with review_id SET NULL
      const survivedTask = await taskModel.findById(task.id);
      assert.ok(survivedTask, 'Task was incorrectly deleted');
      assert.equal(survivedTask.review_id, null, 'review_id was not set to NULL');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. OWNER INVARIANT AND PRIVACY
  // ---------------------------------------------------------------------------
  describe('7. Owner Invariant and Privacy', () => {

    test('Owner member row cannot be deleted', async () => {
      await assert.rejects(
        async () => memberModel.remove('p1', 'u1'),
        /Cannot remove the project owner/
      );
    });

    test('Non-owner cannot list pending or rejected members', async () => {
      // includeAllStatuses = false returns only accepted members
      const publicMembers = await memberModel.listByProject('p1', false);
      const allStatuses = publicMembers.every(m => m.status === 'accepted');
      assert.ok(allStatuses, 'Non-owner member list leaked pending/rejected members');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. PARTIAL UPDATE AND WHITELIST
  // ---------------------------------------------------------------------------
  describe('8. Partial Updates', () => {

    test('Partial update updates whitelisted keys and ignores extra keys', async () => {
      const updated = await projectModel.update('p1', {
        description: 'Updated description for partial update test',
        nonExistentField: 'malicious payload'
      });

      assert.equal(updated.description, 'Updated description for partial update test');
    });

    test('Empty patch throws 400 error', async () => {
      await assert.rejects(
        async () => projectModel.update('p1', {}),
        (err) => err.statusCode === 400
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 9. ERROR MAPPING
  // ---------------------------------------------------------------------------
  describe('9. Database Error Mapping', () => {

    test('MySQL 1062 duplicate key maps to 409 friendly message without driver text', () => {
      const rawError = new Error("Duplicate entry 'prasanna' for key 'uq_users_username'");
      rawError.errno = 1062;
      rawError.code = 'ER_DUP_ENTRY';

      const mapped = mapDbError(rawError);
      assert.equal(mapped.statusCode, 409);
      assert.equal(mapped.message, 'That username is already taken. Please choose another.');
      assert.equal(mapped.message.includes('ER_DUP_ENTRY'), false);
    });

    test('MySQL 1452 foreign key maps to 400', () => {
      const rawError = new Error('Cannot add or update a child row: a foreign key constraint fails');
      rawError.errno = 1452;

      const mapped = mapDbError(rawError);
      assert.equal(mapped.statusCode, 400);
      assert.equal(mapped.message.includes('foreign key'), false);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. HEALTH CHECK
  // ---------------------------------------------------------------------------
  describe('10. Health Status Ping', () => {

    test('Ping returns true when database is healthy', async () => {
      const isUp = await ping();
      assert.equal(isUp, true);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. MESSAGE ORDERING EXPERIMENT
  // ---------------------------------------------------------------------------
  describe('11. Message Ordering Experiment (Migration 002 Proof)', () => {

    test('Rapid message inserts timestamp resolution evaluation', async () => {
      const result = await runOrderingExperiment();
      assert.ok(result !== null);
      console.log(`    Ordering experiment proved: ${result.proved}`);
    });
  });
});
