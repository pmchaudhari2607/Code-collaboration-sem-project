exports.impersonate = async () => {
  const err = new Error('Not Found');
  err.statusCode = 404;
  throw err;
};

exports.reset = async () => {
  const err = new Error('Not Found');
  err.statusCode = 404;
  throw err;
};

exports.dumpStore = async () => {
  const err = new Error('Not Found');
  err.statusCode = 404;
  throw err;
};
