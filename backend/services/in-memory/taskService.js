const store = require('../../data/store');
const { getRoleForUser } = require('./roles');
const { newId } = require('../../utils/id');

const normalizeDate = (val) => {
  if (!val) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    const err = new Error('Invalid due_date format');
    err.statusCode = 400;
    throw err;
  }
  return d.toISOString().slice(0, 10);
};

const assertValidAssignee = (projectId, userId) => {
  if (!userId) return;
  const project = store.findById('projects', projectId);
  if (!project) {
    const err = new Error('Project not found');
    err.statusCode = 400;
    throw err;
  }
  const isOwner = project.owner_id === userId;
  const isCollab = !!store.find('project_members', m => m.project_id === projectId && m.user_id === userId && m.status === 'accepted');
  if (!isOwner && !isCollab) {
    const err = new Error('Assigned user must be project owner or accepted collaborator');
    err.statusCode = 400;
    throw err;
  }
};

exports.list = (userId, projectId) => {
  const allProjects = store.all('projects').filter(p => getRoleForUser(p.id, userId) !== null);
  let projectIds = allProjects.map(p => p.id);
  if (projectId) {
      if (!projectIds.includes(projectId)) return [];
      projectIds = [projectId];
  }
  
  const tasks = store.filter('tasks', t => projectIds.includes(t.project_id));
  return tasks.map(t => {
      const p = allProjects.find(p => p.id === t.project_id);
      const assignee = store.findById('users', t.assigned_to);
      const role = getRoleForUser(t.project_id, userId);
      const canEdit = role === 'owner' || role === 'collaborator';
      return {
        ...t,
        projectName: p ? p.name : 'Unknown',
        assigneeName: assignee?.full_name,
        canEdit
      };
  });
};

exports.create = (data, userId) => {
  const role = getRoleForUser(data.project_id, userId);
  if (role !== 'owner' && role !== 'collaborator') {
    const err = new Error('You do not have permission to create tasks on this project.');
    err.statusCode = 403;
    throw err;
  }

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) {
    const err = new Error('Task title cannot be empty');
    err.statusCode = 400;
    throw err;
  }

  const status = data.status || 'todo';
  if (!['todo', 'in_progress', 'completed'].includes(status)) {
    const err = new Error('Invalid task status');
    err.statusCode = 400;
    throw err;
  }

  const priority = data.priority || 'medium';
  if (!['low', 'medium', 'high'].includes(priority)) {
    const err = new Error('Invalid task priority');
    err.statusCode = 400;
    throw err;
  }

  let review_id = null;
  if (data.review_id) {
    const review = store.findById('reviews', data.review_id);
    if (!review) {
      const err = new Error('Review not found');
      err.statusCode = 400;
      throw err;
    }
    const rFile = store.findById('code_files', review.file_id);
    if (!rFile || rFile.project_id !== data.project_id) {
      const err = new Error('Review does not belong to this project');
      err.statusCode = 400;
      throw err;
    }
    review_id = data.review_id;
  }

  const assigned_to = data.assigned_to ? data.assigned_to : null;
  if (assigned_to) {
    assertValidAssignee(data.project_id, assigned_to);
  }

  const due_date = normalizeDate(data.due_date);

  const newTask = store.insert('tasks', {
    id: newId('t'),
    project_id: data.project_id,
    review_id,
    title,
    description: typeof data.description === 'string' ? data.description.trim() : '',
    status,
    priority,
    assigned_to,
    due_date,
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  
  store.insert('activity', {
    id: newId('a'),
    project_id: data.project_id,
    user_id: userId,
    action_text: `created task: ${title}.`,
    created_at: new Date().toISOString()
  });
  
  if (assigned_to && assigned_to !== userId) {
      const actor = store.findById('users', userId);
      store.insert('notifications', {
          id: newId('n'),
          user_id: assigned_to,
          type: 'task',
          message: `${actor.full_name} assigned you a task: ${title}`,
          reference_id: newTask.id,
          project_id: data.project_id,
          is_read: false,
          created_at: new Date().toISOString()
      });
  }
  return newTask;
};

exports.update = (taskId, data, userId) => {
  const existingTask = store.findById('tasks', taskId);
  if (!existingTask) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }
  const role = getRoleForUser(existingTask.project_id, userId);
  if (role !== 'owner' && role !== 'collaborator') {
    const err = new Error('You do not have permission to update this task.');
    err.statusCode = 403;
    throw err;
  }

  const patch = {};

  if (data.title !== undefined) {
    const trimmed = typeof data.title === 'string' ? data.title.trim() : '';
    if (!trimmed) {
      const err = new Error('Task title cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    patch.title = trimmed;
  }

  if (data.description !== undefined) {
    patch.description = typeof data.description === 'string' ? data.description.trim() : '';
  }

  if (data.status !== undefined) {
    if (!['todo', 'in_progress', 'completed'].includes(data.status)) {
      const err = new Error('Invalid task status');
      err.statusCode = 400;
      throw err;
    }
    patch.status = data.status;
  }

  if (data.priority !== undefined) {
    if (!['low', 'medium', 'high'].includes(data.priority)) {
      const err = new Error('Invalid task priority');
      err.statusCode = 400;
      throw err;
    }
    patch.priority = data.priority;
  }

  if (data.assigned_to !== undefined) {
    if (data.assigned_to) {
      assertValidAssignee(existingTask.project_id, data.assigned_to);
      patch.assigned_to = data.assigned_to;
    } else {
      patch.assigned_to = null;
    }
  }

  if (data.due_date !== undefined) {
    patch.due_date = normalizeDate(data.due_date);
  }

  if (Object.keys(patch).length === 0) {
    const err = new Error('No valid fields provided for update');
    err.statusCode = 400;
    throw err;
  }

  const updated = store.update('tasks', taskId, { ...patch, updated_at: new Date().toISOString() });
  
  store.insert('activity', {
    id: newId('a'),
    project_id: updated.project_id,
    user_id: userId,
    action_text: `updated task: ${updated.title}.`,
    created_at: new Date().toISOString()
  });

  return updated;
};
