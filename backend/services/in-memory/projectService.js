const store = require('../../data/store');
const { getRoleForUser } = require('./roles');
const { newId } = require('../../utils/id');

exports.list = (userId) => {
  const accessible = store.all('projects').filter(p => getRoleForUser(p.id, userId) !== null);
  return accessible.map(p => {
    const filesCount = store.all('code_files').filter(f => f.project_id === p.id).length;
    const membersCount = store.all('project_members').filter(m => m.project_id === p.id && m.status === 'accepted').length + 1;
    const fileIds = store.all('code_files').filter(f => f.project_id === p.id).map(f => f.id);
    const openReviewsCount = store.all('reviews').filter(r => fileIds.includes(r.file_id) && r.status === 'open').length;
    return {
      ...p,
      filesCount,
      membersCount,
      openReviewsCount,
      userRole: getRoleForUser(p.id, userId),
      members: exports.listMembers(p.id, userId)
    };
  }).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
};

exports.create = (userId, data) => {
  if (!data.name || !data.name.trim()) {
    const err = new Error('Project name is required');
    err.statusCode = 400;
    throw err;
  }
  const visibility = data.visibility || 'public';
  if (!['public', 'private'].includes(visibility)) {
    const err = new Error('Invalid visibility');
    err.statusCode = 400;
    throw err;
  }
  const category = data.category || 'Mixed';
  if (!['C', 'Java', 'Python', 'Mixed'].includes(category)) {
    const err = new Error('Invalid category');
    err.statusCode = 400;
    throw err;
  }

  const newProject = store.insert('projects', {
    id: newId('p'),
    name: data.name.trim(),
    description: (data.description || '').trim(),
    visibility,
    category,
    owner_id: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  store.insert('activity', {
    id: newId('a'),
    project_id: newProject.id,
    user_id: userId,
    action_text: 'created the project.',
    created_at: new Date().toISOString()
  });
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
  
  const members = exports.listMembers(id, userId);
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
  const existing = store.findById('projects', id);
  if (!existing) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }

  const patch = {};
  if (data.name !== undefined) {
    const trimmed = typeof data.name === 'string' ? data.name.trim() : '';
    if (!trimmed) {
      const err = new Error('Project name cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    patch.name = trimmed;
  }
  if (data.description !== undefined) {
    patch.description = typeof data.description === 'string' ? data.description.trim() : '';
  }
  if (data.visibility !== undefined) {
    if (!['public', 'private'].includes(data.visibility)) {
      const err = new Error('Invalid visibility');
      err.statusCode = 400;
      throw err;
    }
    patch.visibility = data.visibility;
  }
  if (data.category !== undefined) {
    if (!['C', 'Java', 'Python', 'Mixed'].includes(data.category)) {
      const err = new Error('Invalid category');
      err.statusCode = 400;
      throw err;
    }
    patch.category = data.category;
  }

  if (Object.keys(patch).length === 0) {
    const err = new Error('No valid fields provided for update');
    err.statusCode = 400;
    throw err;
  }

  return store.update('projects', id, { ...patch, updated_at: new Date().toISOString() });
};

exports.remove = (id) => {
  const project = store.findById('projects', id);
  if (!project) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }

  // Compute what to delete first
  const files = store.filter('code_files', f => f.project_id === id);
  const fileIds = files.map(f => f.id);
  const reviews = store.filter('reviews', r => fileIds.includes(r.file_id));
  const reviewIds = reviews.map(r => r.id);
  const versions = store.filter('code_versions', v => fileIds.includes(v.file_id));
  const versionIds = versions.map(v => v.id);
  const tasks = store.filter('tasks', t => t.project_id === id);
  const taskIds = tasks.map(t => t.id);
  const members = store.filter('project_members', m => m.project_id === id);
  const memberIds = members.map(m => m.id);

  // Apply cascade deletes
  store.removeWhere('messages', m => m.project_id === id);
  store.removeWhere('notifications', n =>
    n.project_id === id ||
    (n.type === 'invitation' && memberIds.includes(n.reference_id)) ||
    (n.type === 'task' && taskIds.includes(n.reference_id)) ||
    (n.type === 'review' && reviewIds.includes(n.reference_id)) ||
    (n.type === 'resolution' && reviewIds.includes(n.reference_id)) ||
    (n.type === 'version' && versionIds.includes(n.reference_id))
  );
  store.removeWhere('activity', a => a.project_id === id);
  store.removeWhere('tasks', t => t.project_id === id);
  store.removeWhere('reviews', r => fileIds.includes(r.file_id));
  store.removeWhere('code_versions', v => fileIds.includes(v.file_id));
  store.removeWhere('code_files', f => f.project_id === id);
  store.removeWhere('project_members', m => m.project_id === id);
  store.remove('projects', id);

  return true;
};

exports.listMembers = (projectId, callerUserId) => {
  const project = store.findById('projects', projectId);
  if (!project) return [];
  const owner = store.findById('users', project.owner_id);
  const isOwner = callerUserId && project.owner_id === callerUserId;

  let members = store.filter('project_members', m => m.project_id === projectId);
  if (!isOwner) {
    members = members.filter(m => m.status === 'accepted');
  }

  const memberList = members.map(m => {
    const user = store.findById('users', m.user_id);
    return {
      id: m.id,
      project_id: m.project_id,
      user_id: m.user_id,
      role: m.role,
      status: m.status,
      invited_by: m.invited_by,
      joined_at: m.joined_at,
      created_at: m.created_at,
      user_full_name: user?.full_name,
      user_username: user?.username
    };
  });

  const ownerRow = {
    user_id: owner?.id,
    user_full_name: owner?.full_name,
    user_username: owner?.username,
    role: 'owner',
    status: 'accepted'
  };

  return [ownerRow, ...memberList];
};

exports.inviteMember = (projectId, data, inviterId) => {
  const project = store.findById('projects', projectId);
  if (!project) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }

  const targetUser = store.findById('users', data.userId);
  if (!targetUser) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (data.userId === inviterId) {
    const err = new Error('Cannot invite yourself');
    err.statusCode = 400;
    throw err;
  }

  if (project.owner_id === data.userId) {
    const err = new Error('Owner cannot be invited');
    err.statusCode = 400;
    throw err;
  }

  const existing = store.find('project_members', m => m.project_id === projectId && m.user_id === data.userId);
  if (existing) {
    if (existing.status === 'accepted') {
      const err = new Error('User is already a member of this project');
      err.statusCode = 409;
      throw err;
    }
    if (existing.status === 'pending') {
      const err = new Error('An invitation is already pending for this user');
      err.statusCode = 409;
      throw err;
    }
    if (existing.status === 'rejected') {
      // Reset the same row to pending
      const updated = store.update('project_members', existing.id, {
        status: 'pending',
        invited_by: inviterId,
        joined_at: null,
        updated_at: new Date().toISOString()
      });
      store.insert('notifications', {
        id: newId('n'),
        user_id: data.userId,
        type: 'invitation',
        message: `You have been invited to collaborate on ${project.name}.`,
        reference_id: existing.id,
        project_id: projectId,
        is_read: false,
        created_at: new Date().toISOString()
      });
      return updated;
    }
  }

  const newMember = store.insert('project_members', {
    id: newId('m'),
    project_id: projectId,
    user_id: data.userId,
    role: 'collaborator',
    status: 'pending',
    invited_by: inviterId,
    joined_at: null,
    created_at: new Date().toISOString()
  });

  store.insert('notifications', {
    id: newId('n'),
    user_id: data.userId,
    type: 'invitation',
    message: `You have been invited to collaborate on ${project.name}.`,
    reference_id: newMember.id,
    project_id: projectId,
    is_read: false,
    created_at: new Date().toISOString()
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
