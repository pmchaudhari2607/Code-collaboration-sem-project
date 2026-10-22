const store = require('../../data/store');

function getRoleForUser(projectId, userId) {
  const project = store.findById('projects', projectId);
  if (!project) return null;
  if (project.owner_id === userId) return 'owner';
  const member = store.find('project_members', m => m.project_id === projectId && m.user_id === userId && m.status === 'accepted');
  if (member) return member.role;
  if (project.visibility === 'public') return 'viewer';
  return null;
}

module.exports = { getRoleForUser };
