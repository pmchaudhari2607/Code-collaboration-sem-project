const taskService = require('../services/taskService');
const { success } = require('../utils/response');

exports.list = async (req, res, next) => {
  try {
    const data = await taskService.list(req.user.id, req.query.projectId);
    success(res, 'Tasks', data);
  } catch(e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const data = await taskService.create(req.body, req.user.id);
    success(res, 'Task created', data, 201);
  } catch(e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const data = await taskService.update(req.params.id, req.body, req.user.id);
    success(res, 'Task updated', data);
  } catch(e) { next(e); }
};
