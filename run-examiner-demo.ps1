# ==============================================================================
# CodeReviewHub - Examiner Demo & Evaluation Script
# Operating System: Windows PowerShell
# Database: MySQL 8.0 on Port 3307
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "               CodeReviewHub - MySQL Integration Demo                   " -ForegroundColor Yellow
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "Project: CodeReviewHub Collaboration Portal"
Write-Host "MySQL Port: 3307 | User: crh_app"
Write-Host "Dev Database: code_review_portal_dev"
Write-Host "Test Database: code_review_portal_test"
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir

# 1. Verify Node.js
Write-Host "[1/10] Checking Node.js Environment..." -ForegroundColor White
$nodeVer = node --version
Write-Host "      Node.js version: $nodeVer" -ForegroundColor Green

# 2. Verify Schema Matching & Migrations
Write-Host "`n[2/10] Verifying MySQL Database Schemas (Dev vs Test)..." -ForegroundColor White
node database/tools/schema-diff.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Schema diff check failed!" -ForegroundColor Red
    Exit 1
}

# 3. Run Async / Await Static Audit
Write-Host "`n[3/10] Running Async/Await Static Code Audit..." -ForegroundColor White
node database/tools/await-audit.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Await audit found unawaited calls!" -ForegroundColor Red
    Exit 1
}

# 4. Run Comprehensive MySQL Integration Suite (30 tests)
Write-Host "`n[4/10] Running 30-Point MySQL API & Invitation Suite..." -ForegroundColor White
node --test backend/tests/mysql-api.test.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] MySQL API test suite failed!" -ForegroundColor Red
    Exit 1
}

# 5. Run Live 2-Account End-to-End Collaboration Journey
Write-Host "`n[5/10] Running Live 2-Account End-to-End Collaboration Workflow..." -ForegroundColor White
node backend/tests/workflow-e2e.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] End-to-end workflow runner failed!" -ForegroundColor Red
    Exit 1
}

# 6. Run Delete Account Safety & Foreign Key Cascade Suite
Write-Host "`n[6/10] Running Delete Account Safety & Verification Suite..." -ForegroundColor White
node --test backend/tests/delete-account.test.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Delete account test suite failed!" -ForegroundColor Red
    Exit 1
}

# 7. Run Delete Project Owner-Only & Cascade Suite
Write-Host "`n[7/10] Running Delete Project Owner-Only & Cascade Suite..." -ForegroundColor White
node --test backend/tests/delete-project.test.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Delete project test suite failed!" -ForegroundColor Red
    Exit 1
}

# 8. Run Comprehensive UI & Functionality Verification Suite
Write-Host "`n[8/10] Running Full UI & Workflow Verification Suite..." -ForegroundColor White
node backend/tests/verify-ui-repair.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Full UI verification runner failed!" -ForegroundColor Red
    Exit 1
}

# 9. Run C++, JavaScript, & Multi-Language Support Suite
Write-Host "`n[9/10] Running C++, JavaScript, & Multi-Language Support Suite..." -ForegroundColor White
node --test backend/tests/language-support.test.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Language support test suite failed!" -ForegroundColor Red
    Exit 1
}

# 10. Run MySQL Permanent Source of Truth & Restart Persistence Suite
Write-Host "`n[10/10] Running MySQL Permanent Source of Truth & Restart Persistence Suite..." -ForegroundColor White
node --test backend/tests/mysql-persistence-restart.test.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] MySQL persistence restart test suite failed!" -ForegroundColor Red
    Exit 1
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "                ALL DEMO VERIFICATION CHECKS PASSED                     " -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "How to Start and Evaluate the Portal:" -ForegroundColor Yellow
Write-Host "  1. MySQL Mode (Default for Submission):"
Write-Host "     cd backend"
Write-Host "     node server.js"
Write-Host "     Health Endpoint: http://localhost:5000/api/health"
Write-Host "     (Response: { success: true, db: 'reachable' })"
Write-Host ""
Write-Host "  2. Instant Rollback Mode (In-Memory Fallback):"
Write-Host "     Set DB_ENABLED=false in backend/.env"
Write-Host "     Restart backend server (node server.js)"
Write-Host ""
Write-Host "  3. Evaluation Logins (Dev Database):"
Write-Host "     Owner:        prasanna / password"
Write-Host "     Collaborator: himesh   / password"
Write-Host "     Viewer:       divyesh  / password"
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

Pop-Location
