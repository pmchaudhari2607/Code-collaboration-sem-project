const store = require('../data/store');
const { getRoleForUser } = require('../middleware/permissionMiddleware');

exports.list = (userId) => {
  const accessible = store.all('projects').filter(p => getRoleForUser(p.id, userId) !== null);
  return accessible.map(p => {
    const filesCount = store.all('code_files').filter(f => f.project_id === p.id).length;
    const membersCount = store.all('project_members').filter(m => m.project_id === p.id && m.status === 'accepted').length + 1;
    const fileIds = store.all('code_files').filter(f => f.project_id === p.id).map(f => f.id);
    const openReviewsCount = store.all('reviews').filter(r => fileIds.includes(r.file_id) && r.status === 'open').length;
    return { ...p, filesCount, membersCount, openReviewsCount, userRole: getRoleForUser(p.id, userId), members: exports.listMembers(p.id) };
  }).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
};

exports.create = (userId, data) => {
  const newProject = store.insert('projects', {
    id: 'p' + Date.now(),
    name: data.name,
    description: data.description || '',
    visibility: data.visibility || 'public',
    category: data.category || 'Mixed',
    owner_id: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  store.insert('activity', { id: 'a' + Date.now(), project_id: newProject.id, user_id: userId, action_text: 'created the project.', created_at: new Date().toISOString() });
  return newProject;
};

exports.getById = (id, userId) => {
  const project = store.findById('projects', id);
  if (!project) { const err = new Error('Not found'); err.statusCode = 404; throw err; }
  
  const role = getRoleForUser(id, userId);
  const files = store.filter('code_files', f => f.project_id === id);
  const enrichedFiles = files.map(f => {
    const versions = store.filter('code_versions', v => v.file_id === f.id);
    const latestVer = versions.length > 0 ? Math.max(...versions.map(v=>v.version_number)) : 0;
    const openReviews = store.filter('reviews', r => r.file_id === f.id && r.status === 'open').length;
    const creator = store.findById('users', f.created_by)?.full_name || 'Unknown';
    return { ...f, currentVersionNumber: latestVer, openReviewsCount: openReviews, creatorName: creator };
  });
  
  const members = this.listMembers(id);
  return { ...project, userRole: role, files: enrichedFiles, members };
};

exports.getActivity = (projectId) => {
    const activities = store.filter('activity', a => a.project_id === projectId)
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20);
    
    return activities.map(a => {
        const u = store.findById('users', a.user_id);
        return { ...a, userName: u?.full_name };
    });
};

exports.update = (id, data) => {
  const allowed = { name: data.name, description: data.description, visibility: data.visibility, category: data.category };
  return store.update('projects', id, { ...allowed, updated_at: new Date().toISOString() });
};

exports.remove = (id) => {
  return store.remove('projects', id);
};

exports.listMembers = (projectId) => {
  const project = store.findById('projects', projectId);
  const owner = store.findById('users', project.owner_id);
  const members = store.filter('project_members', m => m.project_id === projectId).map(m => {
    const user = store.findById('users', m.user_id);
    return { ...m, user_full_name: user?.full_name, user_username: user?.username, user_email: user?.email };
  });
  return [
    { user_id: owner.id, user_full_name: owner.full_name, user_username: owner.username, user_email: owner.email, role: 'owner', status: 'accepted' },
    ...members
  ];
};

exports.inviteMember = (projectId, data, inviterId) => {
  const existing = store.find('project_members', m => m.project_id === projectId && m.user_id === data.userId);
  if (existing) { const err = new Error('User is already invited or a member'); err.statusCode = 409; throw err; }
  
  if (data.userId === inviterId) { const err = new Error('Cannot invite yourself'); err.statusCode = 400; throw err; }

  const newMember = store.insert('project_members', {
    id: 'm' + Date.now(),
    project_id: projectId,
    user_id: data.userId,
    role: 'collaborator',
    status: 'pending',
    invited_by: inviterId,
    joined_at: null,
    created_at: new Date().toISOString()
  });
  
  const project = store.findById('projects', projectId);
  store.insert('notifications', {
    id: 'n' + Date.now(), user_id: data.userId, type: 'invitation',
    message: `You have been invited to collaborate on ${project.name}.`,
    reference_id: newMember.id, project_id: projectId, is_read: false, created_at: new Date().toISOString()
  });
  return newMember;
};

exports.removeMember = (projectId, userId) => {
  const member = store.find('project_members', m => m.project_id === projectId && m.user_id === userId);
  if (member) {
    store.remove('project_members', member.id);
  }
  return true;
};
