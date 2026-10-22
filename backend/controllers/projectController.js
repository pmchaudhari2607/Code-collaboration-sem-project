const projectService = require('../services/projectService');
const { success } = require('../utils/response');

exports.list = async (req, res, next) => {
  try {
    const data = await projectService.list(req.user.id);
    success(res, 'Projects', data);
  } catch(e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const data = await projectService.create(req.user.id, req.body);
    success(res, 'Project created', data, 201);
  } catch(e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    const data = await projectService.getById(req.params.id, req.user.id);
    success(res, 'Project details', data);
  } catch(e) { next(e); }
};

exports.getActivity = async (req, res, next) => {
  try {
    const data = await projectService.getActivity(req.params.id);
    success(res, 'Project activity', data);
  } catch(e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const data = await projectService.update(req.params.id, req.body);
    success(res, 'Project updated', data);
  } catch(e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const data = await projectService.remove(req.params.id);
    success(res, 'Project deleted', data);
  } catch(e) { next(e); }
};

exports.listMembers = async (req, res, next) => {
  try {
    const data = await projectService.listMembers(req.params.projectId, req.user.id);
    success(res, 'Members', data);
  } catch(e) { next(e); }
};

exports.inviteMember = async (req, res, next) => {
  try {
    const data = await projectService.inviteMember(req.params.projectId, req.body, req.user.id);
    success(res, 'Member invited', data, 201);
  } catch(e) { next(e); }
};

exports.removeMember = async (req, res, next) => {
  try {
    const data = await projectService.removeMember(req.params.projectId, req.params.userId);
    success(res, 'Member removed', data);
  } catch(e) { next(e); }
};
