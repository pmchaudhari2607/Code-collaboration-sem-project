const reviewService = require('../services/reviewService');
const { success } = require('../utils/response');

exports.listByFile = async (req, res, next) => {
  try {
    const data = await reviewService.listByFile(req.params.fileId, req.query.versionId);
    success(res, 'Reviews', data);
  } catch(e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const data = await reviewService.create(req.params.fileId, req.body, req.user.id);
    success(res, 'Review created', data, 201);
  } catch(e) { next(e); }
};

exports.listAll = async (req, res, next) => {
  try {
    const data = await reviewService.listAll(req.user.id, req.query.projectId);
    success(res, 'All Reviews', data);
  } catch(e) { next(e); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const data = await reviewService.updateStatus(req.params.reviewId, req.body.status, req.user.id);
    success(res, 'Review status updated', data);
  } catch(e) { next(e); }
};
