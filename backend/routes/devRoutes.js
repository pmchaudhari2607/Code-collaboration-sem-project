// This endpoint MUST BE DISABLED before any real deployment.
const express = require('express');
const router = express.Router();
const config = require('../config/env');
const store = require('../data/store');
const { generateToken } = require('../utils/jwt');
const { success, error } = require('../utils/response');

router.post('/impersonate', (req, res, next) => {
  if (!config.ENABLE_DEV_MODE) {
    return error(res, 'Not Found', 404);
  }
  const { userId } = req.body;
  const user = store.findById('users', userId);
  if (!user) {
    return error(res, 'User not found', 404);
  }
  
  const userReturn = { ...user };
  delete userReturn.password;
  
  success(res, 'Impersonated successfully', { user: userReturn, token: generateToken(user.id) });
});

module.exports = router;
