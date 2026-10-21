const userService = require('../services/userService');
const { success } = require('../utils/response');

exports.list = async (req, res, next) => {
  try {
    const data = await userService.list();
    success(res, 'Users', data);
  } catch(e) { next(e); }
};

exports.search = async (req, res, next) => {
  try {
    const data = await userService.search(req.query.q, req.user.id);
    success(res, 'Search results', data);
  } catch(e) { next(e); }
};

exports.me = async (req, res, next) => {
  try {
    const data = await userService.getMe(req.user.id);
    success(res, 'Current user', data);
  } catch(e) { next(e); }
};

exports.updateMe = async (req, res, next) => {
  try {
    const data = await userService.updateMe(req.user.id, req.body);
    success(res, 'Profile updated', data);
  } catch(e) { next(e); }
};
