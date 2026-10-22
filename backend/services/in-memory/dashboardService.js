const store = require('../../data/store');
const { getRoleForUser } = require('./roles');

exports.getStats = (userId) => {
  const allProjects = store.all('projects').filter(p => getRoleForUser(p.id, userId) !== null);
  const projectIds = allProjects.map(p => p.id);
  const owned = allProjects.filter(p => p.owner_id === userId).length;
  const collab = allProjects.length - owned;

  const files = store.filter('code_files', f => projectIds.includes(f.project_id));
  const fileIds = files.map(f => f.id);

  const openReviews = store.filter('reviews', r => fileIds.includes(r.file_id) && r.status === 'open').length;

  const tasks = store.filter('tasks', t => projectIds.includes(t.project_id));
  const pendingTasks = tasks.filter(t => t.status !== 'completed').length;

  return {
      totalProjects: allProjects.length,
      ownedProjects: owned,
      collabProjects: collab,
      totalFiles: files.length,
      openReviews: openReviews,
      pendingTasks: pendingTasks
  };
};

exports.getActivity = (userId) => {
  const allProjects = store.all('projects').filter(p => getRoleForUser(p.id, userId) !== null);
  const projectIds = allProjects.map(p => p.id);
  
  const activities = store.filter('activity', a => projectIds.includes(a.project_id))
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10);
    
  return activities.map(a => {
      const p = allProjects.find(p => p.id === a.project_id);
      const u = store.findById('users', a.user_id);
      return {
          ...a,
          projectName: p?.name,
          userName: u?.full_name,
          userFullName: u?.full_name
      };
  });
};
