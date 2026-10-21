const authService = require('../services/authService');
const { success } = require('../utils/response');

exports.register = async (req, res, next) => {
  try {
    const data = await authService.register(req.body);
    success(res, 'Registration successful', data, 201);
  } catch(err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const data = await authService.login(req.body.identifier, req.body.password);
    success(res, 'Login successful', data);
  } catch(err) { next(err); }
};

exports.me = async (req, res, next) => {
  try {
    const data = await authService.getMe(req.user.id);
    success(res, 'Current user', data);
  } catch(err) { next(err); }
};
