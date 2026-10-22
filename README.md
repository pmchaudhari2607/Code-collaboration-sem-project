# CodeReviewHub

CodeReviewHub is a collaborative code review and project management portal built for academic evaluation and team collaboration. It provides project management, multi-language code editing, immutable version snapshots, line-level code reviews, task tracking, team invitations, and role-based access control.

---

## 🛠️ System Prerequisites & Technology Stack

- **Node.js**: `v18.0.0` or higher (verified on Node.js `v20` / `v24`)
- **MySQL**: `MySQL 8.0.16` or higher (required for CHECK constraints and `utf8mb4_0900_ai_ci` collation)
- **MySQL Port**: `3307` (isolated evaluation instance)
- **Frontend**: Vanilla HTML5, CSS3 (Custom Design System with Dark/Light themes), Vanilla JavaScript (No heavy frameworks, zero build step)
- **Backend**: Node.js, Express.js (RESTful API, bcrypt password hashing, JWT authentication)
- **Database Layer**: MySQL with switchable service architecture (`DB_ENABLED=true` for MySQL, `DB_ENABLED=false` for in-memory testing)

---

## ⚙️ Safe Local Configuration Setup

The backend configuration is managed via `backend/.env`. A reference template is provided in [`backend/.env.example`](file:///backend/.env.example).

### Safe Configuration Values (`backend/.env`):
```env
PORT=5000
JWT_SECRET=your_secure_jwt_secret_at_least_32_characters
JWT_EXPIRES_IN=7d
ENABLE_DEV_MODE=false
CORS_ORIGIN=http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:3000,http://localhost:3000

# Database Configuration (Port 3307)
DB_ENABLED=true
DB_TARGET=dev
DB_HOST=localhost
DB_PORT=3307
DB_NAME=code_review_portal_dev
DB_NAME_TEST=code_review_portal_test
DB_USER=crh_app
DB_PASSWORD=your_db_password
DB_POOL_LIMIT=10
```

> **Security Note**: Never commit actual database passwords or JWT secrets to Git. When database mode is active (`DB_ENABLED=true`), the server fails fast if `JWT_SECRET` is left as a weak default.

---

## 🚀 How to Start the Application

The project consists of an Express API backend and a static frontend. **Both servers should be running.**

### 1. Start the Backend API (Port 5000)
```bash
cd backend
node server.js
```
*Expected console output: `Server is running on port 5000`*

### 2. Verify Backend Health Endpoint
Open `http://localhost:5000/api/health` in your browser or terminal:
```bash
curl http://localhost:5000/api/health
```
*Expected JSON response:*
```json
{
  "success": true,
  "message": "CodeReviewHub API is running",
  "db": "reachable"
}
```

### 3. Start the Frontend UI (Port 3000 or Port 5500)
The frontend requires a local HTTP server to avoid browser `file:///` CORS restrictions:

- **Option A (Python built-in server):**
  ```bash
  cd frontend
  python -m http.server 3000 --bind 127.0.0.1
  ```
  Open `http://127.0.0.1:3000` in your browser.

- **Option B (VS Code Live Server):**
  Right-click `frontend/index.html` and choose **"Open with Live Server"** (opens on `http://127.0.0.1:5500`).

---

## 🧪 One-Command Verification & Testing

Examiners can verify the entire application, database schema, async/await correctness, authorization rules, and persistence in seconds:

### Automated Examiner Demonstration Script (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File run-examiner-demo.ps1
```

### Standard NPM Test Suite:
```bash
cd backend
npm test
```
*Executes all 91 automated tests (models, API, account deletion, project deletion, language support, and server restart persistence) against `code_review_portal_test`.*

---

## 📋 Feature Implementation Status

| Feature Area | Status | Implementation Details |
|---|---|---|
| **User Authentication** | **Implemented** | Registration, login with bcrypt password hashing, JWT bearer tokens, profile edit, logout session wipe. |
| **Account Deletion** | **Implemented** | Authenticated self-service deletion in Settings; requires password confirmation; prevents deleting other accounts; safeguards foreign contributions. |
| **Project Management** | **Implemented** | Project creation, category selection, visibility (public/private), member lists, real dashboard stats. |
| **Owner-Only Project Delete** | **Implemented** | Dedicated owner-only delete button with modal confirmation; atomic cascade of files, versions, reviews, tasks; rollback on error. |
| **Multi-Language Support** | **Implemented** | Full support for **C, C++, Java, Python, and JavaScript** (`.c`, `.h`, `.cpp`, `.hpp`, `.java`, `.py`, `.js`, `.mjs`); extension preservation throughout drafts and versions; file upload validation. |
| **Code Editor & Syntax** | **Implemented** | CodeMirror editor with syntax highlighting for C/C++/Java (`clike`), Python (`python`), and JavaScript (`javascript`). |
| **Drafts vs Versions** | **Implemented** | Ordinary "Save" updates working draft without version bump; explicit **"Save as New Version"** increments version number. |
| **Code Reviews** | **Implemented** | Line-level review comments, review categories (`bug`, `suggestion`, `question`), guarded lifecycle (`open` $\rightarrow$ `resolved` $\rightarrow$ `closed` $\rightarrow$ `open`), owner-only close enforcement. |
| **Task Management** | **Implemented** | Task creation, status toggles (`todo`, `completed`), priority badges, due dates, review linking. |
| **Team Collaboration** | **Implemented** | Real user search without password/hash leak, invitation flow (`pending` $\rightarrow$ `accepted`/`rejected`), role permissions (`owner`, `collaborator`, `viewer`). |
| **Notifications** | **Implemented** | Real-time in-app alerts, invitation accept/reject actions, mark read, mark all read. |
| **Project Messaging** | **Implemented** | Role-gated project messaging channel for collaborators and owners. |
| **Analytics & Calendar** | **Implemented** | Dynamically computed task completion, review status distributions, and interactive monthly due-date calendar. |
| **Code Execution ("Run Code")** | **Out of Scope** | Intentionally excluded for student evaluation safety and server sandboxing security. |

---

## 🗄️ Database Backup, Verification & Recovery

### 1. Create Verified Database Backup
```bash
node database/tools/backup-verify.js
```
Creates an atomic mysqldump of `code_review_portal_dev` using `--single-transaction` and verifies all 12 tables. The dump is saved to `backups/dev_backup_latest.sql`.

### 2. Verify Recovery into Isolated Test Database
```bash
node database/tools/test-recovery.js
```
Restores `dev_backup_latest.sql` into `code_review_portal_test` and confirms table counts without touching development records.

### 3. Manual Database Restore (MySQL 8.0 on Port 3307)
```powershell
mysql -h localhost -P 3307 -u crh_app -p code_review_portal_dev < backups/dev_backup_latest.sql
```

---

## 🔧 Troubleshooting Connection Failures

1. **`GET /api/health` returns `db: "unavailable"` or `503 Service Unavailable`:**
   - Verify MySQL is running on port **3307**:
     ```powershell
     Test-NetConnection -ComputerName localhost -Port 3307
     ```
   - Check `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD` in `backend/.env`.
   - Verify that the `crh_app` user has privileges on `code_review_portal_dev`.

2. **Frontend displays "Cannot reach the server":**
   - Confirm backend is running on `http://localhost:5000`.
   - If frontend is served from a custom port, check `CORS_ORIGIN` in `backend/.env`.

3. **In-Memory Fallback for Testing (`DB_ENABLED=false`):**
   - If MySQL is undergoing maintenance, set `DB_ENABLED=false` in `backend/.env` and restart `node server.js`. The backend seamlessly boots in isolated in-memory test mode with full API compatibility.

---

## 🎓 Examiner Demonstration Walkthrough

To evaluate the portal manually using pre-seeded development accounts:

1. **Sign In as Project Owner:**
   - Open `http://127.0.0.1:3000/login.html` (or `http://127.0.0.1:5500/login.html`).
   - Log in with `Username: prasanna`, `Password: password`.
   - Notice the dark navy sidebar, real statistics cards, and accessible projects on the Dashboard.

2. **Create a Multi-Language File & Review:**
   - Go to **Projects** $\rightarrow$ Click **"Student Management System"** (or create a new project).
   - Click **"Create File"** $\rightarrow$ Enter filename `App.cpp`, select language `C++`.
   - Click **"Open in Editor"** $\rightarrow$ Note C++ syntax highlighting and Version `v1`.
   - Edit the code and click **"Save"** (updates draft without version bump).
   - Click **"Save as New Version"** $\rightarrow$ Enter note `"Added helper function"` $\rightarrow$ Version increments to `v2`.
   - Select line 3, click review icon, add a suggestion review comment.

3. **Collaboration & Permission Enforcement:**
   - In project details, go to **Members** $\rightarrow$ Click **"Invite Member"** $\rightarrow$ Search for `himesh` $\rightarrow$ Send invite.
   - Click **Logout** in the bottom of the sidebar.
   - Log in as `Username: himesh`, `Password: password`.
   - Go to **Notifications** $\rightarrow$ Accept the pending project invitation.
   - Access the project as a collaborator, inspect the review, and mark it resolved.
   - Notice that Himesh cannot close the review (only owner Prasanna can close).

4. **Owner-Only Project Deletion:**
   - Log back in as `prasanna`.
   - Go to a project owned by Prasanna $\rightarrow$ Click **"Delete Project"** $\rightarrow$ Confirm project name in modal $\rightarrow$ Project and cascading records are cleanly removed.