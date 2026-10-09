const jwt = require('jsonwebtoken');
const config = require('../config/env');

exports.generateToken = (userId) => {
  return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
};

exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (e) {
    return null;
  }
};
