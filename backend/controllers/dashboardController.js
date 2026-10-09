const dashboardService = require('../services/dashboardService');
const { success } = require('../utils/response');

exports.getStats = (req, res, next) => {
  try { success(res, 'Dashboard stats', dashboardService.getStats(req.user.id)); } catch(e) { next(e); }
};
exports.getActivity = (req, res, next) => {
  try { success(res, 'Recent activity', dashboardService.getActivity(req.user.id)); } catch(e) { next(e); }
};
