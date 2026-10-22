const dashboardModel = require('../../models/dashboardModel');

exports.getStats = async (userId) => {
  return dashboardModel.getStats(userId);
};

exports.getActivity = async (userId) => {
  return dashboardModel.getActivity(userId);
};
