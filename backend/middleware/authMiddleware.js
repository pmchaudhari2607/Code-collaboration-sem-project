const { verifyToken } = require('../utils/jwt');
const store = require('../data/store');
const { DB_ENABLED } = require('../config/env');
const userModel = require('../models/userModel');
const { error } = require('../utils/response');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'Unauthenticated', 401);
  }
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return error(res, 'Invalid token', 401);
  
  try {
    const user = DB_ENABLED ? await userModel.findById(decoded.userId) : store.findById('users', decoded.userId);
    if (!user) return error(res, 'User not found', 401);
    
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

