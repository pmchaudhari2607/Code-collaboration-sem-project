# CodeReviewHub

CodeReviewHub is a comprehensive code collaboration and review platform built for teams. It allows users to manage projects, review code files, track tasks, and collaborate seamlessly.

## 🚀 Features
- **User Authentication:** Secure login and registration.
- **Dashboard:** Overview of projects, tasks, and recent activity.
- **Project Management:** Create projects and invite team members.
- **Code Editor & Reviews:** Built-in code editor for reviewing files, leaving comments, and approving code.
- **Task Tracking:** Assign and track tasks within projects.
- **Team Collaboration:** Manage team members and roles.
- **Notifications:** Real-time alerts for project updates and invitations.
- **Global Search:** Quickly find projects, files, and users.

## 🛠️ Technology Stack
- **Frontend:** Vanilla HTML5, CSS3 (Custom Design System), and JavaScript.
- **Backend:** Node.js, Express.js.
- **Architecture:** RESTful API with JWT-based authentication.

## ⚙️ How to Run the Project Locally

The project consists of a backend API and a frontend UI. **Both must be running** for the application to work correctly.

### 1. Start the Backend API
The backend serves the data to the frontend and runs on port 5000.

1. Open a terminal.
2. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
3. Start the server:
   ```bash
   node server.js
   ```
   *(You should see a message saying `Server is running on port 5000`)*

### 2. Start the Frontend UI
The frontend requires a local web server (opening the HTML files directly via `file:///` will cause CORS/module errors).

**Method A: Using VS Code Live Server (Recommended)**
1. Open the project in VS Code.
2. Right-click on `frontend/index.html`.
3. Select **"Open with Live Server"**.
4. The app will open in your browser (usually at `http://127.0.0.1:5500`).

**Method B: Using Python built-in server**
1. Open a **new** terminal.
2. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
3. Run the server:
   ```bash
   python -m http.server 3000 --bind 127.0.0.1
   ```
4. Open your browser and go to `http://127.0.0.1:3000`.

## 📂 Project Structure
- `/frontend/` - Contains all HTML pages, CSS stylesheets, and client-side JavaScript.
  - `css/` - Custom styles including theming and components.
  - `js/` - Logic for API communication (`store.js`), UI rendering (`layout.js`), and page-specific scripts.
- `/backend/` - Contains the Express.js server and API endpoints.
  - `controllers/` - Logic for handling API requests.
  - `middleware/` - Authentication, role resolution, and permission enforcement.
  - `models/` - MySQL data access layer (parameterized SQL, transactions, cascades).
  - `routes/` - API route definitions.
  - `services/` - Switchable service layer (`in-memory/` and `mysql/`).
  - `tests/` - Comprehensive integration, model parity, and workflow test suites.
- `/database/` - Database schemas, migrations, and automated verification tools.

---

## 🗄️ Database Architecture & Runtime Modes

CodeReviewHub features a **Switchable Architecture** managed by a single environment variable `DB_ENABLED` in `backend/.env`.

### 1. Evaluation Script for Examiners (One-Command Verification)
Examiners can verify the entire MySQL integration, schema parity, async/await correctness, and multi-user collaboration workflow in seconds:
```powershell
powershell -ExecutionPolicy Bypass -File run-examiner-demo.ps1
```

### 2. MySQL Submission Mode (`DB_ENABLED=true`)
When `DB_ENABLED=true`, the backend dynamically routes all API controllers through MySQL services and transactions targeting MySQL 8.0 on port `3307`:
* **Port**: `3307`
* **Development Database**: `code_review_portal_dev`
* **Test Database**: `code_review_portal_test` (used for all destructive test runs)
* **Application DB User**: `crh_app`
* **Health Check**: `GET http://localhost:5000/api/health` -> `{"success": true, "db": "reachable"}`

### 3. Evaluation User Accounts (Pre-Seeded in Development Database)
* **Project Owner**: `prasanna` / `password`
* **Collaborator**: `himesh` / `password`
* **Viewer**: `divyesh` / `password`

### 4. Zero-Downtime Rollback Path (`DB_ENABLED=false`)
If MySQL is stopped or undergoing maintenance, the application has an instant, fully-tested fallback:
1. Open `backend/.env`.
2. Set `DB_ENABLED=false`.
3. Restart the backend server (`node server.js`).
4. The application seamlessly operates on the existing in-memory store with 100% feature parity.

### 5. Database Backup and Restore
A verified database backup utility is provided:
```powershell
# Create an atomic, verified mysqldump of the dev database:
node database/tools/backup-verify.js

# Output stored in: backups/dev_backup_latest.sql
```
To restore a backup into MySQL port 3307:
```powershell
mysql -h localhost -P 3307 -u crh_app -p code_review_portal_dev < backups/dev_backup_latest.sql
```