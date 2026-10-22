function mapDbError(err) {
  if (!err) return err;

  const code = err.code || '';
  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND', 'ER_ACCESS_DENIED_ERROR', 'DB_DISABLED', 'INVALID_DB_NAME'].includes(code)) {
    const connErr = new Error('Database service unavailable. Please check the MySQL database connection on port 3307.');
    connErr.statusCode = 503;
    connErr.code = code;
    return connErr;
  }

  const errno = err.errno;
  if (!errno) {
    return err;
  }

  const messageStr = err.message || '';

  if (errno === 1062) {
    let friendly = 'Duplicate entry conflict';
    if (messageStr.includes('uq_users_username')) {
      friendly = 'That username is already taken. Please choose another.';
    } else if (messageStr.includes('uq_users_email')) {
      friendly = 'Email already registered';
    } else if (messageStr.includes('uq_member_project_user')) {
      friendly = 'User is already invited or a member of this project';
    } else if (messageStr.includes('uq_files_project_name')) {
      friendly = 'A file with this name already exists in this project';
    } else if (messageStr.includes('uq_versions_file_number') || messageStr.includes('uq_versions_id_file')) {
      friendly = 'Version number conflict';
    }
    const mapped = new Error(friendly);
    mapped.statusCode = 409;
    return mapped;
  }

  if (errno === 1452) {
    const mapped = new Error('Referenced resource not found or invalid');
    mapped.statusCode = 400;
    return mapped;
  }

  if (errno === 1451) {
    const mapped = new Error('Resource cannot be deleted because dependent items exist');
    mapped.statusCode = 409;
    return mapped;
  }

  if (errno === 3819) {
    const mapped = new Error('Data validation failed constraint check');
    mapped.statusCode = 422;
    return mapped;
  }

  if (errno === 1406) {
    const mapped = new Error('Value exceeds maximum permitted length');
    mapped.statusCode = 422;
    return mapped;
  }

  if (errno === 1213 || errno === 1205) {
    const mapped = new Error('Database busy, please retry the operation');
    mapped.statusCode = 503;
    return mapped;
  }

  const generic = new Error('An internal database error occurred');
  generic.statusCode = 500;
  return generic;
}

module.exports = {
  mapDbError
};
