const fileService = require('../services/fileService');
const { success } = require('../utils/response');

exports.listByProject = (req, res, next) => {
  try { success(res, 'Files', fileService.listByProject(req.params.projectId)); } catch(e) { next(e); }
};
exports.create = (req, res, next) => {
  try { success(res, 'File created', fileService.create(req.params.projectId, req.body, req.user.id), 201); } catch(e) { next(e); }
};
exports.getById = (req, res, next) => {
  try { success(res, 'File', fileService.getById(req.params.fileId, req.projectRole)); } catch(e) { next(e); }
};
exports.updateCode = (req, res, next) => {
  try { success(res, 'File updated', fileService.updateCode(req.params.fileId, req.body.current_code)); } catch(e) { next(e); }
};
exports.remove = (req, res, next) => {
  try { success(res, 'File deleted', fileService.remove(req.params.fileId)); } catch(e) { next(e); }
};
exports.listVersions = (req, res, next) => {
  try { success(res, 'Versions', fileService.listVersions(req.params.fileId)); } catch(e) { next(e); }
};
exports.createVersion = (req, res, next) => {
  try { success(res, 'Version created', fileService.createVersion(req.params.fileId, req.body, req.user.id), 201); } catch(e) { next(e); }
};
