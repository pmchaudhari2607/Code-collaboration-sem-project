// This endpoint MUST BE DISABLED before any real deployment or when DB_ENABLED=true.
const express = require('express');
const router = express.Router();
const config = require('../config/env');
const store = require('../data/store');
const { generateToken } = require('../utils/jwt');
const { success, error } = require('../utils/response');

router.post('/reset', (req, res, next) => {
  if (!config.ENABLE_DEV_MODE || config.DB_ENABLED) {
    return error(res, 'Not Found', 404);
  }
  store.reset();
  success(res, 'Store reset');
});

router.get('/store', (req, res, next) => {
  if (!config.ENABLE_DEV_MODE || config.DB_ENABLED) {
    return error(res, 'Not Found', 404);
  }
  success(res, 'Store dump', store.dump());
});

module.exports = router;
