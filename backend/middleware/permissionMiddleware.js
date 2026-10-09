const store = require('../data/store');
const { error } = require('../utils/response');

const getRoleForUser = (projectId, userId) => {
    const project = store.findById('projects', projectId);
    if (!project) return null;
    if (project.owner_id === userId) return 'owner';
    const member = store.find('project_members', m => m.project_id === projectId && m.user_id === userId && m.status === 'accepted');
    if (member) return member.role;
    if (project.visibility === 'public') return 'viewer';
    return null;
};
exports.getRoleForUser = getRoleForUser;

exports.requireProjectRole = (allowedRoles) => {
  return (req, res, next) => {
    let projectId = req.params.projectId || req.params.id || req.body?.project_id || req.query.projectId;
    // fallback if fileId or reviewId or taskId is provided instead
    if (!projectId && req.params.fileId) {
        const file = store.findById('code_files', req.params.fileId);
        if(file) projectId = file.project_id;
    }
    if (!projectId && req.params.id) {
        // try to guess the entity type from the route, but a safer bet is manually fetching
        // Will handle this in controllers directly if needed, or explicitly pass projectId.
    }
    
    if (!projectId) return error(res, 'Project ID missing', 400);
    
    const role = getRoleForUser(projectId, req.user.id);
    if (!role || !allowedRoles.includes(role)) {
      return error(res, 'Permission denied', 403);
    }
    req.projectRole = role;
    next();
  };
};

exports.requireProjectAccess = () => {
  return (req, res, next) => {
    let projectId = req.params.projectId || req.params.id || req.body?.project_id || req.query.projectId;
    if (!projectId && req.params.fileId) {
        const file = store.findById('code_files', req.params.fileId);
        if(file) projectId = file.project_id;
    }
    if (!projectId) return error(res, 'Project ID missing', 400);
    
    const role = getRoleForUser(projectId, req.user.id);
    if (!role) {
      return error(res, 'Permission denied', 403);
    }
    req.projectRole = role;
    next();
  };
};
