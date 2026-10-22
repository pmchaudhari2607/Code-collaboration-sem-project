/**
 * =============================================================================
 * Language Support Test Suite
 *
 * Verifies full support for:
 * - C++ (.cpp, .h, .hpp, .cc, .cxx)
 * - JavaScript (.js, .mjs, .cjs)
 * Alongside existing C, Java, and Python.
 *
 * Verifies:
 * - Language detection and mapping
 * - Template generation
 * - Explicit user selection of filename, extension, and language
 * - Filename & extension preservation across editing, draft saving, version creation
 * - Upload preservation without forcing .c
 * - In-memory and MySQL implementations
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// Enforce test database environment
process.env.DB_ENABLED = 'true';
process.env.DB_TARGET = 'test';
process.env.DB_NAME_TEST = 'code_review_portal_test';

const { detectLanguage, getDefaultCode, SUPPORTED_LANGUAGES, PROJECT_CATEGORIES } = require('../utils/language');
const inMemoryFileService = require('../services/in-memory/fileService');
const inMemoryProjectService = require('../services/in-memory/projectService');
const store = require('../data/store');
const { getPool, close } = require('../db/pool');
const migrate = require('../../database/tools/migrate');

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

describe('Language Support Test Suite', () => {
  before(async () => {
    await migrate();
    pool = getPool();
    const [dbRows] = await pool.query('SELECT DATABASE() AS db');
    assert.strictEqual(dbRows[0].db, 'code_review_portal_test', 'MUST run only on code_review_portal_test');

    // Start ephemeral backend server against code_review_portal_test
    const app = require('../server');
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
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

  // ===========================================================================
  // 1. Language Detection & Template Generation Unit Tests
  // ===========================================================================
  describe('Unit Tests: Language Detection & Templates', () => {
    test('detectLanguage maps C++ extensions correctly', () => {
      assert.equal(detectLanguage('main.cpp'), 'C++');
      assert.equal(detectLanguage('types.hpp'), 'C++');
      assert.equal(detectLanguage('algo.cc'), 'C++');
      assert.equal(detectLanguage('module.cxx'), 'C++');
      assert.equal(detectLanguage('header.h', 'C++'), 'C++');
    });

    test('detectLanguage maps JavaScript extensions correctly', () => {
      assert.equal(detectLanguage('app.js'), 'JavaScript');
      assert.equal(detectLanguage('worker.mjs'), 'JavaScript');
      assert.equal(detectLanguage('config.cjs'), 'JavaScript');
    });

    test('detectLanguage maps C, Java, and Python correctly', () => {
      assert.equal(detectLanguage('main.c'), 'C');
      assert.equal(detectLanguage('header.h'), 'C');
      assert.equal(detectLanguage('Student.java'), 'Java');
      assert.equal(detectLanguage('script.py'), 'Python');
    });

    test('detectLanguage falls back safely when extension is unrecognized', () => {
      assert.equal(detectLanguage('README.txt', 'C'), 'C');
      assert.equal(detectLanguage('notes', 'C++'), 'C++');
    });

    test('getDefaultCode generates appropriate starter templates', () => {
      const cppCode = getDefaultCode('C++', 'main.cpp');
      assert.match(cppCode, /#include <iostream>/);
      assert.match(cppCode, /int main\(\)/);

      const cppHeader = getDefaultCode('C++', 'types.hpp');
      assert.match(cppHeader, /#ifndef TYPES_HPP/);
      assert.match(cppHeader, /#define TYPES_HPP/);

      const jsCode = getDefaultCode('JavaScript', 'index.js');
      assert.match(jsCode, /function main\(\)/);
      assert.match(jsCode, /console\.log\(/);

      const pyCode = getDefaultCode('Python', 'script.py');
      assert.match(pyCode, /def main\(\):/);

      const javaCode = getDefaultCode('Java', 'Employee.java');
      assert.match(javaCode, /public class Employee/);

      const cCode = getDefaultCode('C', 'main.c');
      assert.match(cCode, /#include <stdio\.h>/);
    });

    test('SUPPORTED_LANGUAGES and PROJECT_CATEGORIES contain C++ and JavaScript', () => {
      assert.ok(SUPPORTED_LANGUAGES.includes('C++'));
      assert.ok(SUPPORTED_LANGUAGES.includes('JavaScript'));
      assert.ok(PROJECT_CATEGORIES.includes('C++'));
      assert.ok(PROJECT_CATEGORIES.includes('JavaScript'));
    });
  });

  // ===========================================================================
  // 2. In-Memory Service Language & Extension Preservation Tests
  // ===========================================================================
  describe('In-Memory Service: C++ & JavaScript Support', () => {
    test('creates and preserves C++ and JavaScript files in in-memory mode', () => {
      const proj = inMemoryProjectService.create('u1', {
        name: 'In-Memory Polyglot Project',
        category: 'Mixed',
        visibility: 'public'
      });

      const cppFile = inMemoryFileService.create(proj.id, {
        file_name: 'matrix.cpp',
        language: 'C++'
      }, 'u1');
      assert.equal(cppFile.file_name, 'matrix.cpp');
      assert.equal(cppFile.language, 'C++');
      assert.match(cppFile.current_code, /iostream/);

      const jsFile = inMemoryFileService.create(proj.id, {
        file_name: 'bundle.js',
        language: 'JavaScript'
      }, 'u1');
      assert.equal(jsFile.file_name, 'bundle.js');
      assert.equal(jsFile.language, 'JavaScript');
      assert.match(jsFile.current_code, /console\.log/);

      // Save draft code and verify filename and extension are never changed to .c
      inMemoryFileService.updateCode(cppFile.id, '// updated cpp code');
      const fetchedCpp = inMemoryFileService.getById(cppFile.id);
      assert.equal(fetchedCpp.file_name, 'matrix.cpp');
      assert.equal(fetchedCpp.language, 'C++');
      assert.equal(fetchedCpp.current_code, '// updated cpp code');

      // Create Version 2 and verify filename is preserved
      const ver2 = inMemoryFileService.createVersion(cppFile.id, {
        code: '// version 2 code',
        note: 'release v2'
      }, 'u1');
      assert.equal(ver2.version_number, 2);

      const fetchedAfterVer = inMemoryFileService.getById(cppFile.id);
      assert.equal(fetchedAfterVer.file_name, 'matrix.cpp');
      assert.equal(fetchedAfterVer.language, 'C++');
    });
  });

  // ===========================================================================
  // 3. MySQL API Integration Tests against code_review_portal_test
  // ===========================================================================
  describe('MySQL API Integration: Supported File Types & Extension Preservation', () => {
    let authToken;
    let testUserId;
    let testProjectId;

    before(async () => {
      // Login with default seed user
      const loginRes = await request('/api/auth/login', {
        method: 'POST',
        body: { identifier: 'prasanna', password: 'password' }
      });
      assert.equal(loginRes.status, 200);
      authToken = loginRes.data.data.token;
      testUserId = loginRes.data.data.user.id;

      // Create a dedicated C++ project
      const projRes = await request('/api/projects', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          name: `Language Test Project ${Date.now()}`,
          description: 'Testing C++, JS, and all languages',
          category: 'C++',
          visibility: 'public'
        }
      });
      assert.equal(projRes.status, 201);
      testProjectId = projRes.data.data.id;
      assert.equal(projRes.data.data.category, 'C++');
    });

    test('can create project with JavaScript category', async () => {
      const projRes = await request('/api/projects', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          name: `JS Suite Project ${Date.now()}`,
          description: 'JavaScript apps',
          category: 'JavaScript',
          visibility: 'public'
        }
      });
      assert.equal(projRes.status, 201);
      assert.equal(projRes.data.data.category, 'JavaScript');
    });

    test('creates C++ (.cpp) file and preserves exact filename, extension, and language', async () => {
      const res = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'algorithm.cpp',
          language: 'C++'
        }
      });
      assert.equal(res.status, 201);
      const file = res.data.data;
      assert.equal(file.file_name, 'algorithm.cpp', 'Filename must be algorithm.cpp and NOT changed to .c');
      assert.equal(file.language, 'C++');
      assert.match(file.current_code, /iostream/);
    });

    test('creates C++ header (.hpp) file and preserves exact filename and extension', async () => {
      const res = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'types.hpp',
          language: 'C++'
        }
      });
      assert.equal(res.status, 201);
      const file = res.data.data;
      assert.equal(file.file_name, 'types.hpp', 'Filename must be types.hpp and NOT changed to .c');
      assert.equal(file.language, 'C++');
      assert.match(file.current_code, /#ifndef TYPES_HPP/);
    });

    test('creates JavaScript (.js) file and preserves exact filename, extension, and language', async () => {
      const res = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'app.js',
          language: 'JavaScript'
        }
      });
      assert.equal(res.status, 201);
      const file = res.data.data;
      assert.equal(file.file_name, 'app.js', 'Filename must be app.js and NOT changed to .c');
      assert.equal(file.language, 'JavaScript');
      assert.match(file.current_code, /console\.log/);
    });

    test('creates JavaScript ES module (.mjs) file and preserves exact filename and extension', async () => {
      const res = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'module.mjs',
          language: 'JavaScript'
        }
      });
      assert.equal(res.status, 201);
      const file = res.data.data;
      assert.equal(file.file_name, 'module.mjs', 'Filename must be module.mjs and NOT changed to .c');
      assert.equal(file.language, 'JavaScript');
    });

    test('creates Python (.py) file and preserves exact filename and extension', async () => {
      const res = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'service.py',
          language: 'Python'
        }
      });
      assert.equal(res.status, 201);
      const file = res.data.data;
      assert.equal(file.file_name, 'service.py', 'Filename must be service.py and NOT changed to .c');
      assert.equal(file.language, 'Python');
      assert.match(file.current_code, /def main\(\):/);
    });

    test('creates Java (.java) file and preserves exact filename and extension', async () => {
      const res = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'Calculator.java',
          language: 'Java'
        }
      });
      assert.equal(res.status, 201);
      const file = res.data.data;
      assert.equal(file.file_name, 'Calculator.java', 'Filename must be Calculator.java and NOT changed to .c');
      assert.equal(file.language, 'Java');
      assert.match(file.current_code, /public class Calculator/);
    });

    test('creates C (.c) file and preserves exact filename and extension', async () => {
      const res = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'kernel.c',
          language: 'C'
        }
      });
      assert.equal(res.status, 201);
      const file = res.data.data;
      assert.equal(file.file_name, 'kernel.c');
      assert.equal(file.language, 'C');
      assert.match(file.current_code, /#include <stdio\.h>/);
    });

    test('preserves filename and extension across draft saving and version creation', async () => {
      // 1. Create a C++ file
      const createRes = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'geometry.cpp',
          language: 'C++',
          current_code: '#include <iostream>\nint main() { return 0; }\n'
        }
      });
      assert.equal(createRes.status, 201);
      const fileId = createRes.data.data.id;

      // 2. Update draft code
      const updatedCode = '#include <iostream>\n// draft modification\nint main() { return 0; }\n';
      const draftRes = await request(`/api/files/${fileId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}` },
        body: { current_code: updatedCode }
      });
      assert.equal(draftRes.status, 200);
      assert.equal(draftRes.data.data.file_name, 'geometry.cpp', 'Draft save must not alter file_name');
      assert.equal(draftRes.data.data.language, 'C++');
      assert.equal(draftRes.data.data.current_code, updatedCode);

      // 3. Create Version 2
      const verCode = '#include <iostream>\n// version 2 committed code\nint main() { return 0; }\n';
      const verRes = await request(`/api/files/${fileId}/versions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          code: verCode,
          note: 'Optimized geometric algorithms'
        }
      });
      assert.equal(verRes.status, 201);
      assert.equal(verRes.data.data.version_number, 2);

      // 4. Query file details
      const getRes = await request(`/api/files/${fileId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.equal(getRes.status, 200);
      const fileData = getRes.data.data;
      assert.equal(fileData.file_name, 'geometry.cpp', 'File name must still be geometry.cpp');
      assert.equal(fileData.language, 'C++');
      assert.equal(fileData.versions.length, 2);
      assert.equal(fileData.versions[0].version_number, 2);
    });

    test('preserves uploaded files original filename, extension, and detected language', async () => {
      // Simulate file upload with custom content
      const uploadedJs = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'uploaded_script.js',
          language: 'JavaScript',
          current_code: 'export function compute() { return 42; }\n'
        }
      });
      assert.equal(uploadedJs.status, 201);
      assert.equal(uploadedJs.data.data.file_name, 'uploaded_script.js');
      assert.equal(uploadedJs.data.data.language, 'JavaScript');

      const uploadedHpp = await request(`/api/files/project/${testProjectId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          file_name: 'uploaded_header.hpp',
          language: 'C++',
          current_code: '#pragma once\nstruct Point { double x, y; };\n'
        }
      });
      assert.equal(uploadedHpp.status, 201);
      assert.equal(uploadedHpp.data.data.file_name, 'uploaded_header.hpp');
      assert.equal(uploadedHpp.data.data.language, 'C++');
    });

    test('lists all files with their correct respective extensions and languages in project', async () => {
      const listRes = await request(`/api/files/project/${testProjectId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.equal(listRes.status, 200);
      const files = listRes.data.data;
      const fileNames = files.map(f => f.file_name);

      assert.ok(fileNames.includes('algorithm.cpp'), 'Must include algorithm.cpp');
      assert.ok(fileNames.includes('types.hpp'), 'Must include types.hpp');
      assert.ok(fileNames.includes('app.js'), 'Must include app.js');
      assert.ok(fileNames.includes('module.mjs'), 'Must include module.mjs');
      assert.ok(fileNames.includes('service.py'), 'Must include service.py');
      assert.ok(fileNames.includes('Calculator.java'), 'Must include Calculator.java');
      assert.ok(fileNames.includes('kernel.c'), 'Must include kernel.c');

      // Verify no accidental '.c' overrides occurred
      assert.ok(!fileNames.includes('algorithm.cpp.c'));
      assert.ok(!fileNames.includes('app.js.c'));
      assert.ok(!fileNames.includes('types.hpp.c'));
    });
  });
});
