const { error } = require('../utils/response');
const { mapDbError } = require('../db/errors');

module.exports = (err, req, res, next) => {
  const mapped = mapDbError(err);
  console.error(mapped);
  error(res, mapped.message || 'Internal Server Error', mapped.statusCode || 500);
};

