const store = require('../../data/store');
const bcrypt = require('bcryptjs');

exports.list = () => {
  return store.all('users').map(u => {
    const user = {...u};
    delete user.password;
    delete user.email; // no emails exposed to others per req
    return user;
  });
};

exports.search = (q, reqUserId) => {
  const query = (q || '').toLowerCase();
  return store.all('users')
    .filter(u => u.id !== reqUserId && (u.username.toLowerCase().includes(query) || u.full_name.toLowerCase().includes(query)))
    .map(u => {
        const user = {...u};
        delete user.password;
        delete user.email;
        return user;
    });
};

exports.getMe = (userId) => {
  const user = store.findById('users', userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  const u = {...user};
  delete u.password;
  return u;
};

exports.updateMe = (userId, data) => {
  const user = store.findById('users', userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const patch = {};

  if (data.full_name !== undefined) {
    const trimmed = typeof data.full_name === 'string' ? data.full_name.trim() : '';
    if (!trimmed) {
      const err = new Error('Full name cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    patch.full_name = trimmed;
  }

  if (data.email !== undefined) {
    const trimmed = typeof data.email === 'string' ? data.email.trim() : '';
    if (!trimmed) {
      const err = new Error('Email cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      const err = new Error('Invalid email format');
      err.statusCode = 400;
      throw err;
    }
    const existing = store.find('users', u => u.email.toLowerCase() === trimmed.toLowerCase() && u.id !== userId);
    if (existing) {
      const err = new Error('Email already in use');
      err.statusCode = 409;
      throw err;
    }
    patch.email = trimmed;
  }

  if (data.bio !== undefined) {
    patch.bio = typeof data.bio === 'string' ? data.bio.trim() : '';
  }

  if (Object.keys(patch).length === 0) {
    const err = new Error('No valid fields provided for update');
    err.statusCode = 400;
    throw err;
  }

  const updated = store.update('users', userId, patch);
  const u = {...updated};
  delete u.password;
  return u;
};

exports.deleteMe = (userId, password) => {
  if (!password || typeof password !== 'string') {
    const err = new Error('Password is required to confirm account deletion');
    err.statusCode = 400;
    throw err;
  }

  const user = store.findById('users', userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    const err = new Error('Incorrect password. Account deletion cancelled.');
    err.statusCode = 401;
    throw err;
  }

  // Pre-check foreign contributions
  const ownedProjects = store.all('projects').filter(p => p.owner_id === userId).map(p => p.id);
  const foreignFiles = store.all('code_files').filter(f => f.created_by === userId && !ownedProjects.includes(f.project_id));
  if (foreignFiles.length > 0) {
    const err = new Error('Cannot delete account: You have contributed code files in projects owned by other users. Those contributions cannot be silently deleted to protect their projects.');
    err.statusCode = 409;
    throw err;
  }

  const foreignVersions = store.all('code_versions').filter(v => {
    if (v.created_by !== userId) return false;
    const file = store.findById('code_files', v.file_id);
    return file && !ownedProjects.includes(file.project_id);
  });
  if (foreignVersions.length > 0) {
    const err = new Error('Cannot delete account: You have committed code versions in projects owned by other users. Those contributions cannot be silently deleted to protect their projects.');
    err.statusCode = 409;
    throw err;
  }

  const foreignReviews = store.all('reviews').filter(r => {
    if (r.reviewer_id !== userId) return false;
    const file = store.findById('code_files', r.file_id);
    return file && !ownedProjects.includes(file.project_id);
  });
  if (foreignReviews.length > 0) {
    const err = new Error('Cannot delete account: You have written code reviews in projects owned by other users. To preserve review history, your account cannot be deleted while those reviews remain active.');
    err.statusCode = 409;
    throw err;
  }

  const foreignTasks = store.all('tasks').filter(t => t.created_by === userId && !ownedProjects.includes(t.project_id));
  if (foreignTasks.length > 0) {
    const err = new Error('Cannot delete account: You have created tasks in projects owned by other users. To preserve project tracking, your account cannot be deleted while those tasks remain active.');
    err.statusCode = 409;
    throw err;
  }

  // Delete owned projects and cascade
  for (const pid of ownedProjects) {
    store.remove('projects', pid);
    store.removeWhere('code_files', f => f.project_id === pid);
    store.removeWhere('tasks', t => t.project_id === pid);
    store.removeWhere('project_members', m => m.project_id === pid);
    store.removeWhere('activity_log', a => a.project_id === pid);
    store.removeWhere('messages', m => m.project_id === pid);
  }

  // Clean user activity, notifications, memberships, messages
  store.removeWhere('activity_log', a => a.user_id === userId);
  store.removeWhere('notifications', n => n.user_id === userId);
  store.removeWhere('project_members', m => m.user_id === userId);
  store.removeWhere('messages', m => m.sender_id === userId);

  // Delete user
  store.remove('users', userId);
  return true;
};
