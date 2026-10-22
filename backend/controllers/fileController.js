const fileService = require('../services/fileService');
const { success } = require('../utils/response');

exports.listByProject = async (req, res, next) => {
  try {
    const data = await fileService.listByProject(req.params.projectId);
    success(res, 'Files', data);
  } catch(e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const data = await fileService.create(req.params.projectId, req.body, req.user.id);
    success(res, 'File created', data, 201);
  } catch(e) { next(e); }
};

exports.getById = async (req, res, next) => {
  try {
    const data = await fileService.getById(req.params.fileId, req.projectRole);
    success(res, 'File', data);
  } catch(e) { next(e); }
};

exports.updateCode = async (req, res, next) => {
  try {
    const data = await fileService.updateCode(req.params.fileId, req.body.current_code);
    success(res, 'File updated', data);
  } catch(e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const data = await fileService.remove(req.params.fileId, req.user.id);
    success(res, 'File deleted', data);
  } catch(e) { next(e); }
};

exports.listVersions = async (req, res, next) => {
  try {
    const data = await fileService.listVersions(req.params.fileId);
    success(res, 'Versions', data);
  } catch(e) { next(e); }
};

exports.createVersion = async (req, res, next) => {
  try {
    const data = await fileService.createVersion(req.params.fileId, req.body, req.user.id);
    success(res, 'Version created', data, 201);
  } catch(e) { next(e); }
};
