const store = require('../../data/store');

exports.list = () => {
  return store.all('users').map(u => {
    const user = {...u};
    delete user.password;
    delete user.email; // no emails exposed to others per req
    return user;
  });
};

exports.search = (q, reqUserId) => {
  const query = (q || '').toLowerCase();
  return store.all('users')
    .filter(u => u.id !== reqUserId && (u.username.toLowerCase().includes(query) || u.full_name.toLowerCase().includes(query)))
    .map(u => {
        const user = {...u};
        delete user.password;
        delete user.email;
        return user;
    });
};

exports.getMe = (userId) => {
  const user = store.findById('users', userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  const u = {...user};
  delete u.password;
  return u;
};

exports.updateMe = (userId, data) => {
  const user = store.findById('users', userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const patch = {};

  if (data.full_name !== undefined) {
    const trimmed = typeof data.full_name === 'string' ? data.full_name.trim() : '';
    if (!trimmed) {
      const err = new Error('Full name cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    patch.full_name = trimmed;
  }

  if (data.email !== undefined) {
    const trimmed = typeof data.email === 'string' ? data.email.trim() : '';
    if (!trimmed) {
      const err = new Error('Email cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      const err = new Error('Invalid email format');
      err.statusCode = 400;
      throw err;
    }
    const existing = store.find('users', u => u.email.toLowerCase() === trimmed.toLowerCase() && u.id !== userId);
    if (existing) {
      const err = new Error('Email already in use');
      err.statusCode = 409;
      throw err;
    }
    patch.email = trimmed;
  }

  if (data.bio !== undefined) {
    patch.bio = typeof data.bio === 'string' ? data.bio.trim() : '';
  }

  if (Object.keys(patch).length === 0) {
    const err = new Error('No valid fields provided for update');
    err.statusCode = 400;
    throw err;
  }

  const updated = store.update('users', userId, patch);
  const u = {...updated};
  delete u.password;
  return u;
};
