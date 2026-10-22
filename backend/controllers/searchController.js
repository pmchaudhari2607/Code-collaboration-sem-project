const searchService = require('../services/searchService');
const { success } = require('../utils/response');

exports.globalSearch = async (req, res, next) => {
  try {
    const data = await searchService.globalSearch(req.query.q, req.user.id);
    success(res, 'Search results', data);
  } catch(e) { next(e); }
};
