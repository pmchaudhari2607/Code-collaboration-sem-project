const store = require('../../data/store');
const { getRoleForUser } = require('./roles');

exports.globalSearch = (q, userId) => {
  const query = (q || '').toLowerCase();
  if (!query) return { projects: [], files: [], users: [] };

  const allProjects = store.all('projects').filter(p => getRoleForUser(p.id, userId) !== null);
  const projectIds = allProjects.map(p => p.id);
  
  const projects = allProjects.filter(p => p.name.toLowerCase().includes(query));
  
  const allFiles = store.filter('code_files', f => projectIds.includes(f.project_id));
  const files = allFiles.filter(f => f.file_name.toLowerCase().includes(query)).map(f => {
      const p = allProjects.find(p => p.id === f.project_id);
      return { ...f, projectName: p?.name };
  });

  const users = store.all('users')
    .filter(u => u.id !== userId && (u.username.toLowerCase().includes(query) || u.full_name.toLowerCase().includes(query)))
    .map(u => { const user = { ...u }; delete user.password; delete user.email; return user; });

  return { projects, files, users };
};
