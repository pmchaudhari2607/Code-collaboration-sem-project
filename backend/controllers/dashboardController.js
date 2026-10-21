const dashboardService = require('../services/dashboardService');
const { success } = require('../utils/response');

exports.getStats = async (req, res, next) => {
  try {
    const data = await dashboardService.getStats(req.user.id);
    success(res, 'Dashboard stats', data);
  } catch(e) { next(e); }
};

exports.getActivity = async (req, res, next) => {
  try {
    const data = await dashboardService.getActivity(req.user.id);
    success(res, 'Recent activity', data);
  } catch(e) { next(e); }
};
