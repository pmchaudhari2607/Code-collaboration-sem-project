const searchService = require('../services/searchService');
const { success } = require('../utils/response');

exports.globalSearch = (req, res, next) => {
  try { success(res, 'Search results', searchService.globalSearch(req.query.q, req.user.id)); } catch(e) { next(e); }
};
