const { DB_ENABLED } = require('../config/env');
const store = require('../data/store');
const { error } = require('../utils/response');
const { getRoleForUser } = require('./roleResolver');
const fileModel = require('../models/fileModel');
const projectModel = require('../models/projectModel');

exports.getRoleForUser = getRoleForUser;

async function resolveProjectId(req) {
  let projectId = req.params.projectId || req.params.id || req.body?.project_id || req.query.projectId;
  if (!projectId && req.params.fileId) {
    if (DB_ENABLED) {
      projectId = await fileModel.getProjectId(req.params.fileId);
    } else {
      const file = store.findById('code_files', req.params.fileId);
      projectId = file ? file.project_id : null;
    }
  }
  return projectId;
}

async function projectExists(projectId) {
  if (DB_ENABLED) {
    const p = await projectModel.findById(projectId);
    return Boolean(p);
  }
  return Boolean(store.findById('projects', projectId));
}

exports.requireProjectRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const projectId = await resolveProjectId(req);
      if (!projectId) return error(res, req.params.fileId ? 'File not found' : 'Project ID missing', req.params.fileId ? 404 : 400);

      const exists = await projectExists(projectId);
      if (!exists) return error(res, 'Project not found', 404);

      const role = await getRoleForUser(projectId, req.user.id);
      if (!role || !allowedRoles.includes(role)) {
        return error(res, 'Permission denied', 403);
      }
      req.projectRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
};

exports.requireProjectAccess = () => {
  return async (req, res, next) => {
    try {
      const projectId = await resolveProjectId(req);
      if (!projectId) return error(res, req.params.fileId ? 'File not found' : 'Project ID missing', req.params.fileId ? 404 : 400);

      const exists = await projectExists(projectId);
      if (!exists) return error(res, 'Project not found', 404);

      const role = await getRoleForUser(projectId, req.user.id);
      if (!role) {
        return error(res, 'Permission denied', 403);
      }
      req.projectRole = role;
      next();
    } catch (err) {
      next(err);
    }
  };
};
