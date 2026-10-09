const authService = require('../services/authService');
const { success } = require('../utils/response');

exports.register = (req, res, next) => {
  try {
    const data = authService.register(req.body);
    success(res, 'Registration successful', data, 201);
  } catch(err) { next(err); }
};

exports.login = (req, res, next) => {
  try {
    const data = authService.login(req.body.identifier, req.body.password);
    success(res, 'Login successful', data);
  } catch(err) { next(err); }
};

exports.me = (req, res, next) => {
  try {
    const data = authService.getMe(req.user.id);
    success(res, 'Current user', data);
  } catch(err) { next(err); }
};
