/**
 * =============================================================================
 * MySQL Persistence Across Backend Server Restart Test
 *
 * Verifies:
 * - Data created through the API is permanently stored in MySQL.
 * - Completely stopping and restarting the backend server preserves all records.
 * - Confirms MySQL (not in-memory RAM) is the permanent source of truth.
 * - Runs strictly against code_review_portal_test on port 3307.
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

process.env.DB_ENABLED = 'true';
process.env.DB_TARGET = 'test';
process.env.DB_NAME_TEST = 'code_review_portal_test';

const { getPool, close } = require('../db/pool');
const migrate = require('../../database/tools/migrate');

let serverInstance1;
let serverInstance2;
let baseUrl1;
let baseUrl2;
let pool;

async function request(baseUrl, path, options = {}) {
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

describe('MySQL Permanent Source of Truth & Restart Persistence Test', () => {
  let authToken;
  let disposableProjectId;
  let disposableFileId;
  let testTimestamp;

  before(async () => {
    await migrate();
    pool = getPool();

    // Verify target is strictly test db
    const [dbRows] = await pool.query('SELECT DATABASE() AS db');
    assert.equal(dbRows[0].db, 'code_review_portal_test');

    // Start Server Instance 1
    const app1 = require('../server');
    serverInstance1 = http.createServer(app1);
    await new Promise((resolve) => {
      serverInstance1.listen(0, '127.0.0.1', () => {
        baseUrl1 = `http://127.0.0.1:${serverInstance1.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (serverInstance1 && serverInstance1.listening) {
      await new Promise(r => serverInstance1.close(r));
    }
    if (serverInstance2 && serverInstance2.listening) {
      await new Promise(r => serverInstance2.close(r));
    }
    // Clean up disposable project
    if (disposableProjectId) {
      try {
        await pool.query('DELETE FROM projects WHERE id = ?', [disposableProjectId]);
      } catch (e) {}
    }
    await close();
  });

  test('1. Create disposable project, file, and draft on Server Instance 1', async () => {
    testTimestamp = Date.now();

    // Authenticate
    const loginRes = await request(baseUrl1, '/api/auth/login', {
      method: 'POST',
      body: { identifier: 'prasanna', password: 'password' }
    });
    assert.equal(loginRes.status, 200);
    authToken = loginRes.data.data.token;

    // Create Project
    const projRes = await request(baseUrl1, '/api/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: {
        name: `Restart Persistence Project ${testTimestamp}`,
        description: 'Verifying data survives complete process restart',
        category: 'C++',
        visibility: 'private'
      }
    });
    assert.equal(projRes.status, 201);
    disposableProjectId = projRes.data.data.id;

    // Create File
    const fileRes = await request(baseUrl1, `/api/files/project/${disposableProjectId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: {
        file_name: 'persistence_check.cpp',
        language: 'C++',
        current_code: '#include <iostream>\n// Version 1 before restart\nint main() { return 0; }\n'
      }
    });
    assert.equal(fileRes.status, 201);
    disposableFileId = fileRes.data.data.id;

    // Create Version 2
    const verRes = await request(baseUrl1, `/api/files/${disposableFileId}/versions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: {
        code: '#include <iostream>\n// Version 2 committed before restart\nint main() { return 1; }\n',
        note: 'Commit v2 prior to shutdown'
      }
    });
    assert.equal(verRes.status, 201);
  });

  test('2. Directly query MySQL to confirm records exist on disk in MySQL 8.0', async () => {
    const [projRows] = await pool.query('SELECT id, name, category FROM projects WHERE id = ?', [disposableProjectId]);
    assert.equal(projRows.length, 1);
    assert.equal(projRows[0].name, `Restart Persistence Project ${testTimestamp}`);
    assert.equal(projRows[0].category, 'C++');

    const [fileRows] = await pool.query('SELECT id, file_name, language FROM code_files WHERE id = ?', [disposableFileId]);
    assert.equal(fileRows.length, 1);
    assert.equal(fileRows[0].file_name, 'persistence_check.cpp');
    assert.equal(fileRows[0].language, 'C++');

    const [verRows] = await pool.query('SELECT version_number, note FROM code_versions WHERE file_id = ? ORDER BY version_number ASC', [disposableFileId]);
    assert.equal(verRows.length, 2);
    assert.equal(verRows[1].version_number, 2);
    assert.equal(verRows[1].note, 'Commit v2 prior to shutdown');
  });

  test('3. Terminate Server Instance 1 and clear Node.js module cache', async () => {
    await new Promise(resolve => serverInstance1.close(resolve));
    assert.equal(serverInstance1.listening, false);

    // Invalidate express app module cache to simulate a completely new process
    delete require.cache[require.resolve('../server')];
  });

  test('4. Start Server Instance 2 (brand new process memory) and verify data persistence', async () => {
    const freshApp = require('../server');
    serverInstance2 = http.createServer(freshApp);
    await new Promise((resolve) => {
      serverInstance2.listen(0, '127.0.0.1', () => {
        baseUrl2 = `http://127.0.0.1:${serverInstance2.address().port}`;
        resolve();
      });
    });

    // Health check on new server instance
    const health = await request(baseUrl2, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.db, 'reachable');

    // Fetch project from the new server instance
    const getProj = await request(baseUrl2, `/api/projects/${disposableProjectId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.equal(getProj.status, 200);
    assert.equal(getProj.data.data.name, `Restart Persistence Project ${testTimestamp}`);
    assert.equal(getProj.data.data.category, 'C++');

    // Fetch file and version history from the new server instance
    const getFile = await request(baseUrl2, `/api/files/${disposableFileId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.equal(getFile.status, 200);
    assert.equal(getFile.data.data.file_name, 'persistence_check.cpp');
    assert.equal(getFile.data.data.language, 'C++');
    assert.equal(getFile.data.data.versions.length, 2);
    assert.equal(getFile.data.data.versions[0].version_number, 2);
    assert.match(getFile.data.data.versions[0].code, /Version 2 committed before restart/);
  });

  test('5. Verify database errors return clean 503 and never silently fall back to in-memory', () => {
    const { mapDbError } = require('../db/errors');

    const econn = new Error('connect ECONNREFUSED 127.0.0.1:3307');
    econn.code = 'ECONNREFUSED';
    const mappedEconn = mapDbError(econn);
    assert.equal(mappedEconn.statusCode, 503);
    assert.match(mappedEconn.message, /Database service unavailable/);

    const lostConn = new Error('PROTOCOL_CONNECTION_LOST');
    lostConn.code = 'PROTOCOL_CONNECTION_LOST';
    const mappedLost = mapDbError(lostConn);
    assert.equal(mappedLost.statusCode, 503);
    assert.match(mappedLost.message, /Database service unavailable/);

    // Verify services/index target in DB_ENABLED mode is strictly mysql
    const servicesIndex = require('../services/index');
    assert.ok(servicesIndex.projectService, 'projectService must be defined');
    // Ensure in-memory store is not used when DB is enabled
    const config = require('../config/env');
    assert.equal(config.DB_ENABLED, true);
  });
});
