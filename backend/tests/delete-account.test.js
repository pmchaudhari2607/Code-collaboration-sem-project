const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

// Ensure target is test database
process.env.DB_TARGET = 'test';
process.env.DB_ENABLED = 'true';
process.env.DB_NAME_TEST = 'code_review_portal_test';

const { getPool, close } = require('../db/pool');
const seedDatabase = require('../../database/tools/seed');
const migrate = require('../../database/tools/migrate');
const userService = require('../services/mysql/userService');
const userModel = require('../models/userModel');
const projectModel = require('../models/projectModel');
const fileModel = require('../models/fileModel');
const inMemoryUserService = require('../services/in-memory/userService');
const store = require('../data/store');

describe('Delete Account Suite (code_review_portal_test)', () => {
  let pool;

  before(async () => {
    // Safety check: ensure target is code_review_portal_test
    pool = getPool('test');
    const [dbName] = await pool.query('SELECT DATABASE() as db');
    assert.strictEqual(dbName[0].db, 'code_review_portal_test', 'MUST run only on code_review_portal_test');
    
    await migrate({ isTest: true });
    await seedDatabase({ isTest: true, reset: true });
  });

  after(async () => {
    await close();
  });

  test('1. Rejects deletion if password is not provided', async () => {
    await assert.rejects(
      async () => {
        await userService.deleteMe('u1', '');
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /Password is required/i);
        return true;
      }
    );
  });

  test('2. Rejects deletion if password does not match', async () => {
    await assert.rejects(
      async () => {
        await userService.deleteMe('u1', 'WrongPassword123!');
      },
      (err) => {
        assert.strictEqual(err.statusCode, 401);
        assert.match(err.message, /Incorrect password/i);
        return true;
      }
    );
  });

  test('3. Blocks deletion if user has active contributions in another user\'s project', async () => {
    // In seed: u1 has contributed file f5 and version v_f5_1 in p2 (owned by u2)
    await assert.rejects(
      async () => {
        await userService.deleteMe('u1', 'password');
      },
      (err) => {
        assert.strictEqual(err.statusCode, 409);
        assert.match(err.message, /Cannot delete account.*contributed/i);
        return true;
      }
    );
  });

  test('4. Successfully deletes account when user has owned projects and no foreign contributions', async () => {
    // Create a fresh disposable user who owns a project and files
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('DeleteMe123!', salt);
    
    const newUser = await userModel.create({
      id: 'u_disposable_1',
      full_name: 'Disposable User',
      username: 'disposable_1',
      email: 'disposable_1@example.com',
      password_hash: hash
    });
    assert.ok(newUser);

    // User creates their own project
    const userProj = await projectModel.createWithTransaction({
      id: 'p_disp_1',
      name: 'Disposable Project',
      description: 'Will be deleted with user',
      visibility: 'private',
      category: 'Java'
    }, newUser.id);
    assert.ok(userProj);

    // User adds a file and review to their own project
    const userFile = await fileModel.createWithTransaction(userProj.id, {
      id: 'f_disp_1',
      file_name: 'Disp.java',
      language: 'Java',
      current_code: 'class Disp {}'
    }, newUser.id);
    assert.ok(userFile);

    // Perform deletion with correct password
    const result = await userService.deleteMe(newUser.id, 'DeleteMe123!');
    assert.strictEqual(result, true, 'Deletion must succeed');

    // Verify user row is gone
    const deletedUser = await userModel.findById(newUser.id);
    assert.strictEqual(deletedUser, null, 'User row must be deleted from database');

    // Verify owned project is gone
    const [projRows] = await pool.query('SELECT * FROM projects WHERE id = ?', [userProj.id]);
    assert.strictEqual(projRows.length, 0, 'Owned project must be cascade deleted');

    // Verify files belonging to project are gone
    const [fileRows] = await pool.query('SELECT * FROM code_files WHERE id = ?', [userFile.id]);
    assert.strictEqual(fileRows.length, 0, 'Files in owned project must be cascade deleted');
  });

  test('5. Successfully deletes account for user with zero projects and only read-only memberships', async () => {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('MemberOnly123!', salt);
    
    const memberUser = await userModel.create({
      id: 'u_disposable_2',
      full_name: 'Member Only User',
      username: 'disposable_2',
      email: 'disposable_2@example.com',
      password_hash: hash
    });
    assert.ok(memberUser);

    // Perform deletion
    const result = await userService.deleteMe(memberUser.id, 'MemberOnly123!');
    assert.strictEqual(result, true);

    const check = await userModel.findById(memberUser.id);
    assert.strictEqual(check, null);
  });

  test('6. In-Memory fallback parity: deleteMe handles password verification and safety checks', () => {
    store.reset();
    
    // Missing password
    assert.throws(
      () => inMemoryUserService.deleteMe('u1', ''),
      (err) => err.statusCode === 400
    );

    // Wrong password
    assert.throws(
      () => inMemoryUserService.deleteMe('u1', 'wrong'),
      (err) => err.statusCode === 401
    );

    // Foreign contributions check (u1 has contributions in p2)
    assert.throws(
      () => inMemoryUserService.deleteMe('u1', 'password'),
      (err) => err.statusCode === 409
    );

    // Clean user with no foreign contributions
    const dispUser = store.insert('users', {
      id: 'u_inmem_disp',
      full_name: 'InMem Disp',
      username: 'inmem_disp',
      email: 'inmem_disp@example.com',
      password: bcrypt.hashSync('pass123', 10)
    });
    assert.ok(dispUser);

    const res = inMemoryUserService.deleteMe('u_inmem_disp', 'pass123');
    assert.strictEqual(res, true);
    assert.strictEqual(store.findById('users', 'u_inmem_disp'), undefined);
  });
});
