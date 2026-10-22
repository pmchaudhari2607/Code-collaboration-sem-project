# CodeReviewHub — Final Semester Project Submission & Viva Report

**Project Title:** CodeReviewHub (Code Review Collaboration Portal)  
**Academic Level:** Second-Year Information Technology (SE IT) Semester Project  
**Repository Branch:** `feature/mysql-integration`  
**Evaluation Database:** MySQL 8.0 on Port `3307` (`code_review_portal_dev`)  
**Safety & Test Database:** `code_review_portal_test`  
**Runtime Architecture:** Switchable Dual Service Layer (`DB_ENABLED=true` for MySQL 8.0, `false` for In-Memory Fallback)  

---

## 1. Executive Summary & Implemented Features

CodeReviewHub is a full-stack web application designed for academic teams and software developers to manage code repositories, conduct line-by-line code reviews, maintain version history, track actionable tasks, and manage project collaboration with role-based access control (RBAC).

### Key Features Implemented:
1. **Authentication & Session Security:**
   - JWT-based token authentication (`authMiddleware`) with bcrypt password hashing (10 rounds).
   - Secure registration, login, and user profile management.
   - Zero password or credential leaks in public APIs or search queries.
2. **Project Management & Role-Based Access Control:**
   - Project lifecycle: creation, details, editing, and permanent owner-only deletion.
   - Strict 3-tier authorization model: **Owner**, **Collaborator**, and **Viewer**.
   - Public vs. Private project access enforcement.
3. **Owner-Only Delete Project (Final Feature):**
   - Visible and executable *only* by the authenticated owner of the project.
   - Server-side verification using authenticated JWT user ID against the actual project record (`requireProjectRole([ROLES.OWNER])`).
   - Permanent deletion confirmation dialog displaying the exact project name and danger warnings.
   - Atomic database cascading deletion across all 12 tables ensuring zero orphaned records.
   - Immediate redirect to Projects page with a success toast notification.
4. **Code File Management & Syntax Highlighting:**
   - Multi-language file creation (Java, Python, C) and file upload.
   - CodeMirror-powered syntax highlighting with line numbering and gutter indicators.
   - Real-time draft saving (`PUT /api/files/:id`).
5. **Immutable Version Control:**
   - Explicit version snapshot creation ("Save as New Version").
   - Version history inspection with read-only historical viewing and diff navigation.
6. **Line-by-Line Code Reviews:**
   - Click-to-comment on specific code lines.
   - Review classification: *Comment*, *Suggestion*, *Bug*, *Improvement*.
   - Review status lifecycle: `open` $\rightarrow$ `resolved` $\rightarrow$ `closed` (closing restricted strictly to project owner).
7. **Actionable Tasks System:**
   - Direct conversion of review comments into trackable tasks.
   - Priority (`low`, `medium`, `high`) and status (`todo`, `in_progress`, `completed`).
8. **Collaboration & Member Workflow:**
   - Real-time user search by username or name.
   - Member invitation with duplicate invitation and self-invitation prevention (`HTTP 409` / `HTTP 400`).
   - Notification delivery to invitee with Accept / Decline actions.
9. **Account Deletion Workflow:**
   - Password-verified self-account deletion (`DELETE /api/users/me`).
   - Foreign contribution pre-checks preventing dangling co-authorship.

---

## 2. Delete Project Feature: Architecture & Security

### 2.1 Owner-Only Authorization
- **Client Side:** The "Delete Project" action button (`#btn-delete-project`) is rendered inside `#pd-actions`, which is guarded by `if (projectData.userRole === 'owner')`. For collaborators and viewers, the button is never rendered.
- **Server Side:** The route `DELETE /api/projects/:id` is guarded by `requireProjectRole([ROLES.OWNER])`.
  1. Resolves `projectId` from URL parameters.
  2. Verifies project existence via database query (returns `404 Not Found` if missing).
  3. Resolves user's role from the verified JWT token (`req.user.id`).
  4. Returns `403 Forbidden` if the user is a collaborator, viewer, or outsider.
  5. Never trusts client-supplied owner IDs, roles, or request bodies.

### 2.2 Database Cascade & Orphan Prevention
Project deletion is executed atomically inside a MySQL transaction (`withTransaction`):
1. **Polymorphic Notification Cleanup:** The system collects all `fileIds`, `reviewIds`, `versionIds`, `taskIds`, and `memberIds` belonging to the project and explicitly deletes all polymorphic notifications where `reference_id` points to those entities.
2. **Project Notification Cleanup:** Deletes all notifications with `project_id = ?`.
3. **Atomic Project Deletion:** Executes `DELETE FROM projects WHERE id = ?`.
4. **InnoDB Foreign Key Cascades:** Automatically cascades deletions to:
   - `project_members` (`ON DELETE CASCADE`)
   - `code_files` (`ON DELETE CASCADE`) $\rightarrow$ cascades to `code_versions` and `reviews`
   - `tasks` (`ON DELETE CASCADE`)
   - `activity_log` (`ON DELETE CASCADE`)
   - `messages` (`ON DELETE CASCADE`)
5. **Rollback Guarantee:** If any step fails, `withTransaction` calls `conn.rollback()`, ensuring the database state is completely preserved.
6. **In-Memory Parity:** `services/in-memory/projectService.js` implements the exact same cascading removal of files, versions, reviews, tasks, members, messages, and polymorphic notifications.

---

## 3. Database Architecture (12-Table Relational Schema)

The database `code_review_portal_dev` follows a normalized relational model designed for MySQL 8.0 (Engine: InnoDB, Character Set: utf8mb4):

| # | Table Name | Purpose | Foreign Key Relationships & Cascades |
|---|------------|---------|--------------------------------------|
| 1 | `users` | User accounts, bcrypt passwords, profiles | Root table; referenced by all user actions |
| 2 | `user_settings` | Notification and appearance preferences | `user_id` $\rightarrow$ `users(id)` (`ON DELETE CASCADE`) |
| 3 | `languages` | Lookup table for supported languages (C, Java, Python, Mixed) | Master lookup |
| 4 | `projects` | Collaboration projects & categories | `owner_id` $\rightarrow$ `users(id)`, `category` $\rightarrow$ `languages(name)` |
| 5 | `project_members` | Membership records and invitation statuses | `project_id` $\rightarrow$ `projects(id)` (`CASCADE`), `user_id` $\rightarrow$ `users(id)` (`CASCADE`) |
| 6 | `code_files` | Working files and draft code | `project_id` $\rightarrow$ `projects(id)` (`CASCADE`), `created_by` $\rightarrow$ `users(id)` |
| 7 | `code_versions` | Immutable version snapshots | `file_id` $\rightarrow$ `code_files(id)` (`CASCADE`), `created_by` $\rightarrow$ `users(id)` |
| 8 | `reviews` | Line-by-line review comments | `file_id` $\rightarrow$ `code_files(id)` (`CASCADE`), `version_id` $\rightarrow$ `code_versions(id)` (`CASCADE`) |
| 9 | `tasks` | Project action items and linked reviews | `project_id` $\rightarrow$ `projects(id)` (`CASCADE`), `review_id` $\rightarrow$ `reviews(id)` (`SET NULL`) |
| 10 | `notifications` | User alerts (invitations, reviews, tasks) | `user_id` $\rightarrow$ `users(id)` (`CASCADE`), `project_id` $\rightarrow$ `projects(id)` (`CASCADE`) |
| 11 | `activity_log` | Audit logs for project actions | `project_id` $\rightarrow$ `projects(id)` (`CASCADE`), `user_id` $\rightarrow$ `users(id)` |
| 12 | `messages` | Project team chat history | `project_id` $\rightarrow$ `projects(id)` (`CASCADE`), `sender_id` $\rightarrow$ `users(id)` |

---

## 4. Backup & Disaster Recovery Verification

- **Automated Backup Tool:** `database/tools/backup-verify.js` executes `mysqldump` with `--single-transaction`, `--routines`, and `--triggers`.
- **Verified Backup Files in `backups/`:**
  - Baseline Backup: `backups/dev_backup_2026-10-21T16-43-58-104Z.sql` (29,218 bytes)
  - Final Checkpoint Backup: `backups/dev_backup_2026-10-22T12-26-24-510Z.sql` (70,013 bytes)
  - Latest Copy: `backups/dev_backup_latest.sql` (70,013 bytes)
- **Backup Verification:** Confirmed 100% presence of all 12 tables and data integrity.
- **Test Database Recovery:** Tested using `database/tools/test-recovery.js`, confirming clean restore into `code_review_portal_test`.

---

## 5. Automated Regression Test Results

All destructive and integration test suites run strictly against the disposable `code_review_portal_test` database.

### 5.1 Examiner Master Demo Script (`run-examiner-demo.ps1`)
Command: `powershell -ExecutionPolicy Bypass -File .\run-examiner-demo.ps1`

| Stage | Suite Name | Tests / Actions | Status |
|---|---|---|---|
| **[1/8]** | Node.js Environment Check | Node v22.14.0 verified | **PASS** |
| **[2/8]** | MySQL Schema Parity Diff | Compared `dev` vs `test` schemas across all 12 tables | **PASS** (0 differences) |
| **[3/8]** | Static Async/Await Code Audit | Scanned all backend files for unawaited asynchronous calls | **PASS** (0 unhandled calls) |
| **[4/8]** | MySQL API & RBAC Suite | 30 test points covering auth, projects, files, reviews, tasks, RBAC | **PASS** (30/30 passed) |
| **[5/8]** | Live 2-Account Collaboration | Registered Alice & Bob, invited, accepted, reviewed, verified across restart | **PASS** (8/8 steps passed) |
| **[6/8]** | Delete Account Safety Suite | Missing/wrong password, foreign contribution pre-checks, cascading delete | **PASS** (6/6 passed) |
| **[7/8]** | Owner-Only Delete Project Suite | 10 test cases: owner delete, collaborator block, 401, 404, orphans, rollback | **PASS** (10/10 passed) |
| **[8/8]** | Full UI & Workflow Verification | Register, project create, version 2, reviews, invites, decline, account delete | **PASS** (13/13 passed) |

**Overall Verification Result:** **100% Passed (0 Failures, 0 Skips, 0 Cancellations)**.

---

## 6. How to Start and Evaluate the Portal

### 6.1 Requirements
- Node.js (v18+)
- MySQL Server 8.0 running on Port `3307`

### 6.2 Step-by-Step Launch
1. **Start the Backend API Server:**
   ```powershell
   cd backend
   node server.js
   ```
   *Expected Output: `Server is running on port 5000`*  
   *Health Check: `http://localhost:5000/api/health` returns `{"success": true, "db": "reachable"}`*

2. **Start the Frontend Web Server:**
   ```powershell
   cd frontend
   python -m http.server 3000 --bind 127.0.0.1
   ```
   *Access Portal in Browser:* `http://localhost:3000`

3. **Evaluation User Credentials (Pre-seeded in Dev Database):**
   - **Project Owner:** Username: `prasanna` | Password: `password`
   - **Collaborator:** Username: `himesh` | Password: `password`
   - **Viewer:** Username: `divyesh` | Password: `password`

4. **Instant In-Memory Rollback Demonstration (Zero-Downtime Fallback):**
   - In `backend/.env`, change `DB_ENABLED=true` to `DB_ENABLED=false`.
   - Restart `node server.js`. The portal immediately operates using the in-memory store without needing MySQL.

---

## 7. Submission Screenshots Gallery

All screenshots were genuinely captured directly from the live running web application using headless Chrome DevTools Protocol and saved to `submission_screenshots/`:

| Filename | Description | Key Visible Elements |
|---|---|---|
| `01_login_page.png` | Portal Login Page | Clean navy/light split layout, login form, credentials fields |
| `02_dashboard.png` | Authenticated Dashboard | Total projects, files, open reviews, tasks, activity chart, recent projects |
| `03_projects_list_and_create.png` | Projects Page & Create Modal | Project cards, category badges, Create Project dialog with visibility options |
| `04_project_details_and_files.png` | Project Details Page | Project title, owner badge, Edit & Delete buttons, tabs, files list |
| `05_code_editor_syntax.png` | Code Editor with Syntax Highlighting | CodeMirror editor, Java syntax colors, line markers, review sidebar |
| `06_version_history.png` | Version History Tab | Version snapshots (v1, v2), viewing status, author, timestamps |
| `07_code_review_and_task.png` | Code Review & Task Action | Review card with bug badge, line pointer, Resolve and Make Task buttons |
| `08_members_invitation_workflow.png` | Members Tab & Invite Modal | Team member list with roles/status, Invite Member search dialog |
| `09_notifications.png` | Notifications Center | Invitation alerts with Accept/Decline buttons, review notifications |
| `10_profile_and_settings.png` | Profile & Application Settings | Dark mode toggle, notification preferences, Danger Zone |
| `11_delete_project_confirmation_modal.png` | Delete Project Dialog | Danger modal identifying project by name, permanent warning, Cancel button |
| `12_successful_project_deletion_toast.png` | Project Deletion Success | Return to Projects page showing green success toast notification |
| `13_delete_account_confirmation_modal.png` | Delete Account Dialog | Danger Zone modal requiring password re-verification |

---

## 8. Honest Known Limitations & Future Scope

In adherence to academic integrity, the following boundaries are clearly acknowledged:
1. **No Code Sandbox / Arbitrary Code Execution:** The platform is dedicated to code review, static reading, and versioning. It does not compile or run untrusted code on the server, avoiding severe remote code execution vulnerabilities.
2. **WebSocket Real-time Broadcast:** Instant notification and message updates rely on periodic polling and event-driven page updates rather than a persistent WebSocket pub/sub broker (e.g. Socket.io).
3. **Draft Concurrency / Operational Transformation:** Simultaneous real-time co-typing in the code editor uses latest-write draft saving rather than operational transformation (CRDT/OT).
4. **Binary / Large Assets:** The system is optimized for text/code files (up to `MEDIUMTEXT` 16MB) and does not store large binary blob artifacts like compiled `.jar` or `.exe` binaries.

---

## 9. Final Verification & Git Checkpoint Status

- **Git Branch:** `feature/mysql-integration`
- **Submission Tag:** `submission-final`
- **Database Backup Verified:** `backups/dev_backup_latest.sql` (70,013 bytes, 12 tables verified)
- **Automated Regression Suites:** 8/8 Suites Passed (0 Failures)
- **Submission Screenshots:** 13 Genuine PNG files in `submission_screenshots/`
