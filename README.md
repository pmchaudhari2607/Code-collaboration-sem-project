# CodeReviewHub

CodeReviewHub is a comprehensive code collaboration and review platform built for teams. It allows users to manage projects, review code files, track tasks, and collaborate seamlessly.

##  Features
- **User Authentication:** Secure login and registration.
- **Dashboard:** Overview of projects, tasks, and recent activity.
- **Project Management:** Create projects and invite team members.
- **Code Editor & Reviews:** Built-in code editor for reviewing files, leaving comments, and approving code.
- **Task Tracking:** Assign and track tasks within projects.
- **Team Collaboration:** Manage team members and roles.
- **Notifications:** Real-time alerts for project updates and invitations.
- **Global Search:** Quickly find projects, files, and users.

##  Technology Stack
- **Frontend:** Vanilla HTML5, CSS3 (Custom Design System), and JavaScript.
- **Backend:** Node.js, Express.js.
- **Architecture:** RESTful API with JWT-based authentication.

##  How to Run the Project Locally

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

##  Project Structure
- `/frontend/` - Contains all HTML pages, CSS stylesheets, and client-side JavaScript.
  - `css/` - Custom styles including theming and components.
  - `js/` - Logic for API communication (`store.js`), UI rendering (`layout.js`), and page-specific scripts.
- `/backend/` - Contains the Express.js server and API endpoints.
  - `controllers/` - Logic for handling API requests.
  - `routes/` - API route definitions.
  - `services/` - Business logic and data handling.
