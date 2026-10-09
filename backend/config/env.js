require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  ENABLE_DEV_MODE: process.env.ENABLE_DEV_MODE === 'true',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://127.0.0.1:5500',
};
