const projectService = require('../services/projectService');
const { success } = require('../utils/response');

exports.list = (req, res, next) => {
  try { success(res, 'Projects', projectService.list(req.user.id)); } catch(e) { next(e); }
};
exports.create = (req, res, next) => {
  try { success(res, 'Project created', projectService.create(req.user.id, req.body), 201); } catch(e) { next(e); }
};
exports.getById = (req, res, next) => {
  try { success(res, 'Project details', projectService.getById(req.params.id, req.user.id)); } catch(e) { next(e); }
};
exports.getActivity = (req, res, next) => {
  try { success(res, 'Project activity', projectService.getActivity(req.params.id)); } catch(e) { next(e); }
};
exports.update = (req, res, next) => {
  try { success(res, 'Project updated', projectService.update(req.params.id, req.body)); } catch(e) { next(e); }
};
exports.remove = (req, res, next) => {
  try { success(res, 'Project deleted', projectService.remove(req.params.id)); } catch(e) { next(e); }
};

exports.listMembers = (req, res, next) => {
  try { success(res, 'Members', projectService.listMembers(req.params.projectId)); } catch(e) { next(e); }
};
exports.inviteMember = (req, res, next) => {
  try { success(res, 'Member invited', projectService.inviteMember(req.params.projectId, req.body, req.user.id), 201); } catch(e) { next(e); }
};
exports.removeMember = (req, res, next) => {
  try { success(res, 'Member removed', projectService.removeMember(req.params.projectId, req.params.userId)); } catch(e) { next(e); }
};
