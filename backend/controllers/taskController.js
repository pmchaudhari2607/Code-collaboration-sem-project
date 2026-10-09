const taskService = require('../services/taskService');
const { success } = require('../utils/response');

exports.list = (req, res, next) => {
  try { success(res, 'Tasks', taskService.list(req.user.id, req.query.projectId)); } catch(e) { next(e); }
};
exports.create = (req, res, next) => {
  try { success(res, 'Task created', taskService.create(req.body, req.user.id), 201); } catch(e) { next(e); }
};
exports.update = (req, res, next) => {
  try { success(res, 'Task updated', taskService.update(req.params.id, req.body, req.user.id)); } catch(e) { next(e); }
};
