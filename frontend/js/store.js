class APIStore {
    constructor() {
        this.baseUrl = 'http://localhost:5000/api';
        this.token = localStorage.getItem('crh_token');
    }

    setToken(token) {
        this.token = token;
        if(token) localStorage.setItem('crh_token', token);
        else localStorage.removeItem('crh_token');
    }

    async request(endpoint, options = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = 'Bearer ' + this.token;

        const config = {
            method: options.method || 'GET',
            headers,
            ...options
        };
        if (options.body && typeof options.body !== 'string') {
            config.body = JSON.stringify(options.body);
        }

        let res;
        try {
            res = await fetch(this.baseUrl + endpoint, config);
        } catch (err) {
            throw new Error("Cannot reach the server. Please make sure the backend is running on http://localhost:5000 and try again.");
        }
        const data = await res.json();
        
        if (!res.ok || !data.success) {
            if (res.status === 401) {
                this.setToken(null);
                window.location.href = 'login.html';
            }
            throw new Error(data.message || 'API request failed');
        }
        return data.data;
    }

    // Auth
    async login(identifier, password) {
        const res = await this.request('/auth/login', { method: 'POST', body: { identifier, password } });
        this.setToken(res.token);
        return res.user;
    }
    async register(data) {
        const res = await this.request('/auth/register', { method: 'POST', body: data });
        this.setToken(res.token);
        return res.user;
    }
    async getCurrentUser() {
        if (!this.token) return null;
        try {
            return await this.request('/auth/me');
        } catch(e) {
            return null;
        }
    }

    // Projects
    getProjects() { return this.request('/projects'); }
    getProject(id) { return this.request('/projects/' + id); }
    createProject(data) { return this.request('/projects', { method: 'POST', body: data }); }
    updateProject(id, data) { return this.request('/projects/' + id, { method: 'PUT', body: data }); }
    deleteProject(id) { return this.request('/projects/' + id, { method: 'DELETE' }); }
    
    // Members
    inviteMember(projectId, userId, role = 'collaborator') { return this.request('/projects/' + projectId + '/members/invitations', { method: 'POST', body: { userId, role } }); }
    removeMember(projectId, userId) { return this.request('/projects/' + projectId + '/members/' + userId, { method: 'DELETE' }); }

    // Files
    getFiles(projectId) { return this.request('/files/project/' + projectId); }
    getFile(id) { return this.request('/files/' + id); }
    createFile(projectId, data) { return this.request('/files/project/' + projectId, { method: 'POST', body: data }); }
    saveFileCode(id, code) { return this.request('/files/' + id, { method: 'PUT', body: { current_code: code } }); }
    deleteFile(id) { return this.request('/files/' + id, { method: 'DELETE' }); }

    // Versions
    getVersions(fileId) { return this.request('/files/' + fileId + '/versions'); }
    createVersion(fileId, code, note) {
        const body = (code && typeof code === 'object') ? code : { code, note };
        return this.request('/files/' + fileId + '/versions', { method: 'POST', body });
    }

    // Reviews
    getReviews(filters = {}) {
        if (filters.projectId) {
            return this.request('/reviews/all?projectId=' + filters.projectId);
        } else if (filters.fileId) {
            let url = '/files/' + filters.fileId + '/reviews';
            if (filters.versionId) url += '?versionId=' + filters.versionId;
            return this.request(url);
        }
        return this.request('/reviews/all');
    }
    createReview(data) {
        return this.request('/files/' + data.file_id + '/reviews', { method: 'POST', body: data });
    }
    setReviewStatus(reviewId, status) { return this.request('/reviews/' + reviewId + '/status', { method: 'PUT', body: { status } }); }

    // Tasks
    getTasks(projectId) { 
        let url = '/tasks';
        if (projectId) url += '?projectId=' + projectId;
        return this.request(url); 
    }
    createTask(data) { return this.request('/tasks', { method: 'POST', body: data }); }
    updateTask(id, data) { return this.request('/tasks/' + id, { method: 'PUT', body: data }); }

    // Users & Search
    getUsers() { return this.request('/users'); }
    searchUsers(q) { return this.request('/users/search?q=' + encodeURIComponent(q)); }
    globalSearch(q) { return this.request('/search?q=' + encodeURIComponent(q)); }
    updateCurrentUserProfile(data) { return this.request('/users/me', { method: 'PUT', body: data }); }
    deleteCurrentUser(password) { return this.request('/users/me', { method: 'DELETE', body: { password } }); }

    // Notifications
    getNotifications() { return this.request('/notifications'); }
    markNotificationRead(id) { return this.request('/notifications/' + id + '/read', { method: 'PUT' }); }
    markAllNotificationsRead() { return this.request('/notifications/mark-all-read', { method: 'PUT' }); }
    respondToInvitation(id, accept) { 
        return this.request('/notifications/invitations/' + id + '/' + (accept ? 'accept' : 'decline'), { method: 'POST' }); 
    }
    
    // Dashboard
    getDashboardStats() { return this.request('/dashboard/stats'); }
    getRecentActivity() { return this.request('/dashboard/activity'); }
    getProjectActivity(projectId) { return this.request('/projects/' + projectId + '/activity'); }

    // Messages
    getMessages(projectId) { return this.request('/messages/' + projectId); }
    sendMessage(projectId, content) { return this.request('/messages/' + projectId, { method: 'POST', body: { content } }); }
}

window.Store = new APIStore();
