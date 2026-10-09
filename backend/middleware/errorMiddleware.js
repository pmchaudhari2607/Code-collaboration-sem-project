const { error } = require('../utils/response');
module.exports = (err, req, res, next) => {
  console.error(err);
  error(res, err.message || 'Internal Server Error', err.statusCode || 500);
};
