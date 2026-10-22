/**
 * database/tools/await-audit.js
 * 
 * Scans backend/services/mysql, backend/controllers, and backend/middleware
 * for calls to models, roleResolver, or services that are not awaited or returned.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../backend');
const scanDirs = [
  path.join(rootDir, 'controllers'),
  path.join(rootDir, 'middleware'),
  path.join(rootDir, 'services/mysql')
];

const TARGET_IDENTIFIERS = [
  'userModel', 'projectModel', 'memberModel', 'fileModel', 'versionModel',
  'reviewModel', 'taskModel', 'notificationModel', 'activityModel',
  'messageModel', 'dashboardModel', 'searchModel', 'settingsModel',
  'roleResolver', 'authService', 'userService', 'projectService',
  'fileService', 'reviewService', 'taskService', 'notificationService',
  'dashboardService', 'searchService', 'messageService', 'devService'
];

let totalFilesScanned = 0;
let totalCallsFound = 0;
let violations = [];

function scanFile(filePath) {
  totalFilesScanned++;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((rawLine, idx) => {
    const lineNum = idx + 1;
    const line = rawLine.trim();

    // Skip comments and empty lines
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) return;

    for (const id of TARGET_IDENTIFIERS) {
      const callPattern = new RegExp(`\\b${id}\\.([A-Za-z0-9_]+)\\s*\\(`, 'g');
      let match;
      while ((match = callPattern.exec(line)) !== null) {
        totalCallsFound++;
        const method = match[1];
        
        // Exclude known synchronous methods/properties if any (none in models/services)
        // Check if line before the call has await or return
        const callIndex = match.index;
        const prefix = line.substring(0, callIndex).trim();

        const hasAwait = /\bawait\s*$/.test(prefix) || /\bawait\s+[\w.()\[\]]+\s*=\s*$/.test(prefix) || /\bawait\s*\(/.test(prefix);
        const hasReturn = /\breturn\s*$/.test(prefix);
        const hasAssignmentWithAwait = /=\s*await\s*$/.test(prefix);
        const isAwaitedOrReturned = /\bawait\b/.test(prefix) || /\breturn\b/.test(prefix);

        if (!isAwaitedOrReturned) {
          violations.push({
            file: path.relative(rootDir, filePath),
            line: lineNum,
            expression: `${id}.${method}()`,
            snippet: line
          });
        }
      }
    }
  });
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      scanFile(fullPath);
    }
  }
}

console.log('=======================================================');
console.log('       CodeReviewHub - Async / Await Audit Tool        ');
console.log('=======================================================');

for (const dir of scanDirs) {
  walkDir(dir);
}

console.log(`Files scanned: ${totalFilesScanned}`);
console.log(`Async model / service calls checked: ${totalCallsFound}`);

if (violations.length === 0) {
  console.log('\n[PASS] All model, roleResolver, and service calls are properly awaited or returned.');
  process.exit(0);
} else {
  console.log(`\n[WARN/FAIL] Found ${violations.length} call(s) missing await or return:`);
  violations.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.file}:${v.line} -> ${v.expression}`);
    console.log(`     ${v.snippet}`);
  });
  process.exit(1);
}
