const Store = {
  dbKey: 'crh_db_v1',
  latency: 350,
  
  _getDb() {
    let db = localStorage.getItem(this.dbKey);
    if (!db) {
      db = JSON.stringify(window.SeedData);
      localStorage.setItem(this.dbKey, db);
    }
    return JSON.parse(db);
  },
  
  _saveDb(data) {
    localStorage.setItem(this.dbKey, JSON.stringify(data));
  },
  
  _simulateNetwork(data) {
    return new Promise(resolve => setTimeout(() => resolve(data), this.latency));
  },
  
  _simulateError(msg) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), this.latency));
  },

  resetDemoData() {
    localStorage.removeItem(this.dbKey);
    return this._simulateNetwork({ success: true });
  },

  // Auth (Mock only)
  async login(usernameOrEmail, password) {
    const db = this._getDb();
    const user = db.users.find(u => (u.username === usernameOrEmail || u.email === usernameOrEmail) && u.password === password);
    if (user) {
      localStorage.setItem('crh_current_user', user.id);
      return this._simulateNetwork(user);
    }
    return this._simulateError('Invalid credentials');
  },
  
  async register(data) {
    const db = this._getDb();
    if (db.users.find(u => u.username === data.username || u.email === data.email)) {
      return this._simulateError('Username or email already exists');
    }
    const newUser = {
      id: 'u' + Date.now(),
      ...data,
      created_at: new Date().toISOString()
    };
    db.users.push(newUser);
    this._saveDb(db);
    return this._simulateNetwork(newUser);
  },
  
  getCurrentUserId() {
    return localStorage.getItem('crh_current_user') || 'u1';
  },
  
  setCurrentUserId(id) {
    localStorage.setItem('crh_current_user', id);
  },

  async getCurrentUser() {
    const db = this._getDb();
    const id = this.getCurrentUserId();
    return this._simulateNetwork(db.users.find(u => u.id === id));
  },
  
  async getUsers() {
    const db = this._getDb();
    return this._simulateNetwork(db.users);
  },

  async searchUsers(query) {
    const db = this._getDb();
    const q = (query || '').toLowerCase();
    const users = db.users.filter(u => u.username.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q));
    return this._simulateNetwork(users);
  },
  
  getRoleForUserSync(db, projectId, userId) {
    const project = db.projects.find(p => p.id === projectId);
    if (!project) return null;
    if (project.owner_id === userId) return 'owner';
    const member = db.project_members.find(m => m.project_id === projectId && m.user_id === userId && m.status === 'accepted');
    if (member) return member.role;
    if (project.visibility === 'public') return 'viewer';
    return null;
  },

  async getRoleForUser(projectId, userId) {
    const db = this._getDb();
    return this._simulateNetwork(this.getRoleForUserSync(db, projectId, userId));
  },
  
  async getProjects() {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const accessible = db.projects.filter(p => this.getRoleForUserSync(db, p.id, uid) !== null);
    
    const enriched = accessible.map(p => {
        const filesCount = db.code_files.filter(f => f.project_id === p.id).length;
        const membersCount = db.project_members.filter(m => m.project_id === p.id && m.status === 'accepted').length + 1;
        const fileIds = db.code_files.filter(f => f.project_id === p.id).map(f => f.id);
        const openReviewsCount = db.reviews.filter(r => fileIds.includes(r.file_id) && r.status === 'open').length;
        return { ...p, filesCount, membersCount, openReviewsCount, userRole: this.getRoleForUserSync(db, p.id, uid) };
    });
    
    return this._simulateNetwork(enriched.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at)));
  },
  
  async getProject(id) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const role = this.getRoleForUserSync(db, id, uid);
    if (!role) return this._simulateError('Access denied or not found');
    
    const project = db.projects.find(p => p.id === id);
    const files = db.code_files.filter(f => f.project_id === id);
    
    const enrichedFiles = files.map(f => {
       const versions = db.code_versions.filter(v => v.file_id === f.id);
       const latestVer = versions.length > 0 ? Math.max(...versions.map(v=>v.version_number)) : 0;
       const openReviews = db.reviews.filter(r => r.file_id === f.id && r.status === 'open').length;
       const creator = db.users.find(u => u.id === f.created_by)?.full_name || 'Unknown';
       return { ...f, currentVersionNumber: latestVer, openReviewsCount: openReviews, creatorName: creator };
    });
    
    const members = this._getProjectMembersSync(db, id);
    return this._simulateNetwork({ ...project, userRole: role, files: enrichedFiles, members });
  },
  
  async createProject(data) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const newProject = {
      id: 'p' + Date.now(),
      name: data.name,
      description: data.description || '',
      visibility: data.visibility || 'public',
      category: data.category || 'Mixed',
      owner_id: uid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.projects.push(newProject);
    db.activity.push({ id: 'a' + Date.now(), project_id: newProject.id, user_id: uid, action_text: 'created the project.', created_at: new Date().toISOString() });
    this._saveDb(db);
    return this._simulateNetwork(newProject);
  },

  async updateProject(id, data) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const projectIndex = db.projects.findIndex(p => p.id === id);
    if (projectIndex === -1) return this._simulateError('Project not found');
    if (db.projects[projectIndex].owner_id !== uid) return this._simulateError('Only owner can edit project');
    
    db.projects[projectIndex] = { ...db.projects[projectIndex], ...data, updated_at: new Date().toISOString() };
    this._saveDb(db);
    return this._simulateNetwork(db.projects[projectIndex]);
  },
  
  async getFiles(projectId) {
    const db = this._getDb();
    const role = this.getRoleForUserSync(db, projectId, this.getCurrentUserId());
    if (!role) return this._simulateError('Access denied');
    const files = db.code_files.filter(f => f.project_id === projectId);
    
    const enriched = files.map(f => {
       const versions = db.code_versions.filter(v => v.file_id === f.id);
       const latestVer = versions.length > 0 ? Math.max(...versions.map(v=>v.version_number)) : 0;
       const openReviews = db.reviews.filter(r => r.file_id === f.id && r.status === 'open').length;
       const creator = db.users.find(u => u.id === f.created_by)?.full_name || 'Unknown';
       return { ...f, currentVersionNumber: latestVer, openReviewsCount: openReviews, creatorName: creator };
    });
    return this._simulateNetwork(enriched);
  },
  
  async getFile(id) {
    const db = this._getDb();
    const file = db.code_files.find(f => f.id === id);
    if (!file) return this._simulateError('File not found');
    const role = this.getRoleForUserSync(db, file.project_id, this.getCurrentUserId());
    if (!role) return this._simulateError('Access denied');
    
    const versions = db.code_versions.filter(v => v.file_id === id).sort((a,b) => b.version_number - a.version_number);
    const creator = db.users.find(u => u.id === file.created_by)?.full_name || 'Unknown';
    const project = db.projects.find(p => p.id === file.project_id);
    return this._simulateNetwork({ ...file, versions, userRole: role, creatorName: creator, projectName: project.name });
  },
  
  async createFile(projectId, data) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const role = this.getRoleForUserSync(db, projectId, uid);
    if (role !== 'owner' && role !== 'collaborator') return this._simulateError('You do not have permission to create files');
    
    if (db.code_files.find(f => f.project_id === projectId && f.file_name === data.file_name)) {
       return this._simulateError('File name already exists in this project');
    }
    
    const newFile = {
      id: 'f' + Date.now(),
      project_id: projectId,
      file_name: data.file_name,
      language: data.language,
      current_code: data.current_code || '',
      created_by: uid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.code_files.push(newFile);
    db.activity.push({ id: 'a' + Date.now(), project_id: projectId, user_id: uid, action_text: `created file ${data.file_name}.`, created_at: new Date().toISOString() });
    
    const initialVersion = {
       id: 'v' + Date.now(),
       file_id: newFile.id,
       version_number: 1,
       code: newFile.current_code,
       created_by: uid,
       created_at: new Date().toISOString()
    };
    db.code_versions.push(initialVersion);
    
    this._saveDb(db);
    return this._simulateNetwork({ ...newFile, versions: [initialVersion] });
  },
  
  async saveFileCode(fileId, code) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const file = db.code_files.find(f => f.id === fileId);
    if (!file) return this._simulateError('File not found');
    const role = this.getRoleForUserSync(db, file.project_id, uid);
    if (role !== 'owner' && role !== 'collaborator') return this._simulateError('You do not have permission to edit code');
    
    file.current_code = code;
    file.updated_at = new Date().toISOString();
    this._saveDb(db);
    return this._simulateNetwork({ success: true });
  },
  
  async createVersion(fileId, code, note) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const file = db.code_files.find(f => f.id === fileId);
    if (!file) return this._simulateError('File not found');
    const role = this.getRoleForUserSync(db, file.project_id, uid);
    if (role !== 'owner' && role !== 'collaborator') return this._simulateError('You do not have permission to create versions');
    
    file.current_code = code;
    file.updated_at = new Date().toISOString();
    
    const existingVersions = db.code_versions.filter(v => v.file_id === fileId);
    const nextVerNum = existingVersions.length > 0 ? Math.max(...existingVersions.map(v=>v.version_number)) + 1 : 1;
    
    const newVersion = {
      id: 'v' + Date.now(),
      file_id: fileId,
      version_number: nextVerNum,
      code: code,
      note: note || '',
      created_by: uid,
      created_at: new Date().toISOString()
    };
    db.code_versions.push(newVersion);
    db.activity.push({ id: 'a' + Date.now(), project_id: file.project_id, user_id: uid, action_text: `created Version ${nextVerNum} of ${file.file_name}.`, created_at: new Date().toISOString() });
    
    this._createNotificationForProjectSync(db, file.project_id, uid, 'version', `${db.users.find(u=>u.id===uid).full_name} created Version ${nextVerNum} of ${file.file_name}`, newVersion.id);
    this._saveDb(db);
    return this._simulateNetwork(newVersion);
  },
  
  async getVersions(fileId) {
    const db = this._getDb();
    const versions = db.code_versions.filter(v => v.file_id === fileId).sort((a,b) => b.version_number - a.version_number);
    const enriched = versions.map(v => ({
       ...v,
       creatorName: db.users.find(u => u.id === v.created_by)?.full_name || 'Unknown'
    }));
    return this._simulateNetwork(enriched);
  },
  
  async getReviews({fileId, projectId, status, type} = {}) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    let reviews = db.reviews;
    
    if (fileId) reviews = reviews.filter(r => r.file_id === fileId);
    if (projectId) {
       const fileIds = db.code_files.filter(f => f.project_id === projectId).map(f => f.id);
       reviews = reviews.filter(r => fileIds.includes(r.file_id));
    }
    if (status) reviews = reviews.filter(r => r.status === status);
    if (type) reviews = reviews.filter(r => r.review_type === type);
    
    const accessibleReviews = reviews.filter(r => {
       const file = db.code_files.find(f => f.id === r.file_id);
       return file && this.getRoleForUserSync(db, file.project_id, uid) !== null;
    });
    
    const enriched = accessibleReviews.map(r => {
       const file = db.code_files.find(f => f.id === r.file_id);
       const project = db.projects.find(p => p.id === file?.project_id);
       const reviewer = db.users.find(u => u.id === r.reviewer_id);
       const version = db.code_versions.find(v => v.id === r.version_id);
       const task = db.tasks.find(t => t.review_id === r.id);
       return { 
         ...r, 
         fileName: file?.file_name, 
         projectName: project?.name, 
         project_id: project?.id,
         reviewerName: reviewer?.full_name,
         versionNumber: version?.version_number,
         hasTask: !!task,
         taskId: task?.id
       };
    }).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    
    return this._simulateNetwork(enriched);
  },
  
  async createReview(data) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const file = db.code_files.find(f => f.id === data.file_id);
    if (!file) return this._simulateError('File not found');
    const role = this.getRoleForUserSync(db, file.project_id, uid);
    if (!role) return this._simulateError('Access denied');
    
    const newReview = {
      id: 'r' + Date.now(),
      file_id: data.file_id,
      version_id: data.version_id,
      reviewer_id: uid,
      line_number: data.line_number,
      review_type: data.review_type,
      comment: data.comment,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.reviews.push(newReview);
    
    const reviewerName = db.users.find(u => u.id === uid).full_name;
    db.activity.push({ id: 'a' + Date.now(), project_id: file.project_id, user_id: uid, action_text: `added a ${data.review_type} review to ${file.file_name} line ${data.line_number}.`, created_at: new Date().toISOString() });
    
    this._createNotificationForProjectSync(db, file.project_id, uid, 'review', `${reviewerName} added a review on ${file.file_name}`, newReview.id);
    this._saveDb(db);
    return this._simulateNetwork(newReview);
  },
  
  async setReviewStatus(id, status) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const review = db.reviews.find(r => r.id === id);
    if (!review) return this._simulateError('Review not found');
    
    const file = db.code_files.find(f => f.id === review.file_id);
    const role = this.getRoleForUserSync(db, file.project_id, uid);
    
    if (status === 'closed' || status === 'hidden') {
       if (role !== 'owner') return this._simulateError('Only owner can close/hide reviews');
       review.closed_by = uid;
       review.closed_at = new Date().toISOString();
    }
    if (status === 'resolved' || status === 'reopened') {
       if (role !== 'owner' && role !== 'collaborator') return this._simulateError('You do not have permission to change review status');
       if (status === 'resolved') {
           review.resolved_by = uid;
           review.resolved_at = new Date().toISOString();
       }
    }
    
    review.status = status;
    review.updated_at = new Date().toISOString();
    this._saveDb(db);
    return this._simulateNetwork(review);
  },
  
  async getTasks(projectId) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    let tasks = db.tasks;
    
    if (projectId) {
       tasks = tasks.filter(t => t.project_id === projectId);
    } else {
       tasks = tasks.filter(t => this.getRoleForUserSync(db, t.project_id, uid) !== null);
    }
    
    const enriched = tasks.map(t => {
       const project = db.projects.find(p => p.id === t.project_id);
       const assignee = db.users.find(u => u.id === t.assigned_to);
       const creator = db.users.find(u => u.id === t.created_by);
       let review = null;
       if (t.review_id) {
           const r = db.reviews.find(rev => rev.id === t.review_id);
           const f = db.code_files.find(fi => fi.id === r?.file_id);
           if (r && f) review = { ...r, fileName: f.file_name, line_number: r.line_number, file_id: f.id };
       }
       return { 
           ...t, 
           projectName: project?.name, 
           assigneeName: assignee?.full_name,
           creatorName: creator?.full_name,
           reviewContext: review
       };
    });
    
    return this._simulateNetwork(enriched.sort((a,b) => new Date(a.due_date) - new Date(b.due_date)));
  },
  
  async createTask(data) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const role = this.getRoleForUserSync(db, data.project_id, uid);
    if (role !== 'owner' && role !== 'collaborator') return this._simulateError('You do not have permission to create tasks');
    
    const newTask = {
      id: 't' + Date.now(),
      project_id: data.project_id,
      review_id: data.review_id || null,
      created_by: uid,
      assigned_to: data.assigned_to || null,
      title: data.title,
      description: data.description || '',
      status: 'todo',
      priority: data.priority || 'medium',
      due_date: data.due_date,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.tasks.push(newTask);
    
    if (data.assigned_to && data.assigned_to !== uid) {
       const assignerName = db.users.find(u => u.id === uid).full_name;
       db.notifications.push({
           id: 'n' + Date.now(), user_id: data.assigned_to, type: 'task',
           message: `${assignerName} assigned a task to you: ${data.title}`,
           reference_id: newTask.id, project_id: data.project_id, is_read: false, created_at: new Date().toISOString()
       });
    }
    this._saveDb(db);
    return this._simulateNetwork(newTask);
  },

  async updateTask(id, data) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const task = db.tasks.find(t => t.id === id);
    if (!task) return this._simulateError('Task not found');
    const role = this.getRoleForUserSync(db, task.project_id, uid);
    if (role !== 'owner' && role !== 'collaborator') return this._simulateError('Permission denied');
    
    Object.assign(task, data);
    task.updated_at = new Date().toISOString();
    this._saveDb(db);
    return this._simulateNetwork(task);
  },
  
  _getProjectMembersSync(db, projectId) {
    const project = db.projects.find(p => p.id === projectId);
    const owner = db.users.find(u => u.id === project.owner_id);
    const members = db.project_members
      .filter(m => m.project_id === projectId && m.status === 'accepted')
      .map(m => {
        const user = db.users.find(u => u.id === m.user_id);
        return { ...m, user_full_name: user?.full_name, user_username: user?.username, user_email: user?.email };
      });
    return [
       { user_id: owner.id, user_full_name: owner.full_name, user_username: owner.username, user_email: owner.email, role: 'owner', status: 'accepted' },
       ...members
    ];
  },

  async getMembers(projectId) {
    const db = this._getDb();
    const role = this.getRoleForUserSync(db, projectId, this.getCurrentUserId());
    if (!role) return this._simulateError('Access denied');
    return this._simulateNetwork(this._getProjectMembersSync(db, projectId));
  },
  
  async sendInvitation(projectId, targetUserId) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const project = db.projects.find(p => p.id === projectId);
    if (project.owner_id !== uid) return this._simulateError('Only owner can invite');
    if (targetUserId === uid) return this._simulateError('Cannot invite yourself');
    
    const existing = db.project_members.find(m => m.project_id === projectId && m.user_id === targetUserId);
    if (existing) return this._simulateError('User is already invited or a member');
    
    const newMember = {
      id: 'm' + Date.now(),
      project_id: projectId,
      user_id: targetUserId,
      role: 'collaborator',
      status: 'pending',
      invited_by: uid,
      joined_at: null,
      created_at: new Date().toISOString()
    };
    db.project_members.push(newMember);
    
    db.notifications.push({
       id: 'n' + Date.now(), user_id: targetUserId, type: 'invitation',
       message: `You have been invited to collaborate on ${project.name}.`,
       reference_id: newMember.id, project_id: projectId, is_read: false, created_at: new Date().toISOString()
    });
    this._saveDb(db);
    return this._simulateNetwork(newMember);
  },
  
  async respondInvitation(invitationId, accept) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const member = db.project_members.find(m => m.id === invitationId);
    if (!member || member.user_id !== uid) return this._simulateError('Invitation not found');
    
    member.status = accept ? 'accepted' : 'rejected';
    member.joined_at = accept ? new Date().toISOString() : null;
    
    // Mark associated notification as read
    const notif = db.notifications.find(n => n.type === 'invitation' && n.reference_id === invitationId);
    if (notif) notif.is_read = true;
    
    this._saveDb(db);
    return this._simulateNetwork(member);
  },
  
  async removeMember(projectId, targetUserId) {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const project = db.projects.find(p => p.id === projectId);
    if (project.owner_id !== uid) return this._simulateError('Only owner can remove members');
    
    db.project_members = db.project_members.filter(m => !(m.project_id === projectId && m.user_id === targetUserId));
    this._saveDb(db);
    return this._simulateNetwork({ success: true });
  },
  
  async getNotifications() {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const notifs = db.notifications.filter(n => n.user_id === uid).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const enriched = notifs.map(n => {
       const project = db.projects.find(p => p.id === n.project_id);
       let memberContext = null;
       if (n.type === 'invitation') {
           memberContext = db.project_members.find(m => m.id === n.reference_id);
       }
       return { ...n, projectName: project?.name, memberContext };
    });
    return this._simulateNetwork(enriched);
  },
  
  async markNotificationRead(id) {
    const db = this._getDb();
    const notif = db.notifications.find(n => n.id === id);
    if (notif) notif.is_read = true;
    this._saveDb(db);
    return this._simulateNetwork({ success: true });
  },

  async markAllNotificationsRead() {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    db.notifications.forEach(n => {
        if (n.user_id === uid) n.is_read = true;
    });
    this._saveDb(db);
    return this._simulateNetwork({ success: true });
  },
  
  _createNotificationForProjectSync(db, projectId, actorId, type, message, refId) {
     const project = db.projects.find(p => p.id === projectId);
     const members = db.project_members.filter(m => m.project_id === projectId && m.status === 'accepted').map(m => m.user_id);
     const targets = new Set([project.owner_id, ...members]);
     targets.delete(actorId);
     targets.forEach(userId => {
         db.notifications.push({
             id: 'n' + Date.now() + Math.random(),
             user_id: userId,
             type: type,
             message: message,
             reference_id: refId,
             project_id: projectId,
             is_read: false,
             created_at: new Date().toISOString()
         });
     });
  },

  async getRecentActivity() {
    const db = this._getDb();
    const uid = this.getCurrentUserId();
    const accessibleProjectIds = db.projects.filter(p => this.getRoleForUserSync(db, p.id, uid) !== null).map(p=>p.id);
    const activities = db.activity.filter(a => accessibleProjectIds.includes(a.project_id)).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
    
    const enriched = activities.map(a => {
        const user = db.users.find(u => u.id === a.user_id);
        const project = db.projects.find(p => p.id === a.project_id);
        return { ...a, userName: user?.full_name, projectName: project?.name };
    });
    return this._simulateNetwork(enriched);
  },

  async getProjectActivity(projectId) {
    const db = this._getDb();
    const role = this.getRoleForUserSync(db, projectId, this.getCurrentUserId());
    if (!role) return this._simulateError('Access denied');
    const activities = db.activity.filter(a => a.project_id === projectId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const enriched = activities.map(a => {
        const user = db.users.find(u => u.id === a.user_id);
        const project = db.projects.find(p => p.id === a.project_id);
        return { ...a, userName: user?.full_name, projectName: project?.name };
    });
    return this._simulateNetwork(enriched);
  },
  
  async getDashboardStats() {
      const db = this._getDb();
      const uid = this.getCurrentUserId();
      const accessibleProjects = db.projects.filter(p => this.getRoleForUserSync(db, p.id, uid) !== null);
      const projectIds = accessibleProjects.map(p => p.id);
      
      const fileCount = db.code_files.filter(f => projectIds.includes(f.project_id)).length;
      const openReviews = db.reviews.filter(r => {
          const file = db.code_files.find(f => f.id === r.file_id);
          return file && projectIds.includes(file.project_id) && r.status === 'open';
      }).length;
      const pendingTasks = db.tasks.filter(t => projectIds.includes(t.project_id) && t.status !== 'completed').length;
      
      const owned = accessibleProjects.filter(p => p.owner_id === uid).length;
      const collab = accessibleProjects.length - owned;

      return this._simulateNetwork({
          totalProjects: accessibleProjects.length,
          ownedProjects: owned,
          collabProjects: collab,
          totalFiles: fileCount,
          openReviews: openReviews,
          pendingTasks: pendingTasks
      });
  },

  async getFileContextForSearch(fileId) {
      const db = this._getDb();
      const file = db.code_files.find(f => f.id === fileId);
      if(!file) return null;
      return { project_id: file.project_id };
  },
  
  async globalSearch(query) {
      const db = this._getDb();
      const uid = this.getCurrentUserId();
      const q = (query || '').toLowerCase();
      if (!q) return this._simulateNetwork({ projects: [], files: [], users: [] });

      const accessibleProjects = db.projects.filter(p => this.getRoleForUserSync(db, p.id, uid) !== null);
      const projectIds = accessibleProjects.map(p => p.id);
      
      const projects = accessibleProjects.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
      
      const files = db.code_files.filter(f => projectIds.includes(f.project_id) && (f.file_name.toLowerCase().includes(q) || f.language.toLowerCase().includes(q))).map(f => {
          const p = db.projects.find(pr => pr.id === f.project_id);
          return { ...f, projectName: p?.name };
      });
      
      const users = db.users.filter(u => u.username.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q));

      return this._simulateNetwork({ projects, files, users });
  }
};
window.Store = Store;
