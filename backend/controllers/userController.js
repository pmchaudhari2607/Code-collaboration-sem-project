const userService = require('../services/userService');
const { success } = require('../utils/response');

exports.list = (req, res, next) => {
  try {
    success(res, 'Users', userService.list());
  } catch(e) { next(e); }
};
exports.search = (req, res, next) => {
  try {
    success(res, 'Search results', userService.search(req.query.q, req.user.id));
  } catch(e) { next(e); }
};
exports.me = (req, res, next) => {
  try {
    success(res, 'Current user', userService.getMe(req.user.id));
  } catch(e) { next(e); }
};
exports.updateMe = (req, res, next) => {
  try {
    success(res, 'Profile updated', userService.updateMe(req.user.id, req.body));
  } catch(e) { next(e); }
};
