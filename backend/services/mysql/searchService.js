const searchModel = require('../../models/searchModel');

exports.globalSearch = async (q, userId) => {
  return searchModel.globalSearch(q, userId);
};
