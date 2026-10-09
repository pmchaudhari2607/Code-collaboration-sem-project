const store = require('../data/store');
const { getRoleForUser } = require('../middleware/permissionMiddleware');

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
      return { ...t, projectName: p.name, assigneeName: assignee?.full_name };
  });
};

exports.create = (data, userId) => {
  const role = getRoleForUser(data.project_id, userId);
  if (role !== 'owner' && role !== 'collaborator') {
    const err = new Error('You do not have permission to create tasks on this project.');
    err.statusCode = 403;
    throw err;
  }
  const newTask = store.insert('tasks', {
    id: 't' + Date.now(),
    project_id: data.project_id,
    title: data.title,
    description: data.description || '',
    status: data.status || 'todo',
    priority: data.priority || 'medium',
    assigned_to: data.assigned_to || null,
    due_date: data.due_date || null,
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  
  store.insert('activity', { id: 'a' + Date.now(), project_id: data.project_id, user_id: userId, action_text: `created task: ${data.title}.`, created_at: new Date().toISOString() });
  
  if (data.assigned_to && data.assigned_to !== userId) {
      const actor = store.findById('users', userId);
      store.insert('notifications', {
          id: 'n' + Date.now(), user_id: data.assigned_to, type: 'task',
          message: `${actor.full_name} assigned you a task: ${data.title}`,
          reference_id: newTask.id, project_id: data.project_id, is_read: false, created_at: new Date().toISOString()
      });
  }
  return newTask;
};

exports.update = (taskId, data, userId) => {
  const existingTask = store.findById('tasks', taskId);
  if (!existingTask) { const err = new Error('Task not found'); err.statusCode = 404; throw err; }
  const role = getRoleForUser(existingTask.project_id, userId);
  if (role !== 'owner' && role !== 'collaborator') {
    const err = new Error('You do not have permission to update this task.');
    err.statusCode = 403;
    throw err;
  }
  const allowed = { status: data.status, title: data.title, description: data.description, priority: data.priority, assigned_to: data.assigned_to, due_date: data.due_date };
  const updated = store.update('tasks', taskId, { ...allowed, updated_at: new Date().toISOString() });
  
  store.insert('activity', { id: 'a' + Date.now(), project_id: updated.project_id, user_id: userId, action_text: `updated task: ${updated.title}.`, created_at: new Date().toISOString() });
  return updated;
};
