const reviewService = require('../services/reviewService');
const { success } = require('../utils/response');

exports.listByFile = (req, res, next) => {
  try { success(res, 'Reviews', reviewService.listByFile(req.params.fileId, req.query.versionId)); } catch(e) { next(e); }
};
exports.create = (req, res, next) => {
  try { success(res, 'Review created', reviewService.create(req.params.fileId, req.body, req.user.id), 201); } catch(e) { next(e); }
};
exports.listAll = (req, res, next) => {
  try { success(res, 'All Reviews', reviewService.listAll(req.user.id, req.query.projectId)); } catch(e) { next(e); }
};
exports.updateStatus = (req, res, next) => {
  try { success(res, 'Review status updated', reviewService.updateStatus(req.params.reviewId, req.body.status, req.user.id)); } catch(e) { next(e); }
};
