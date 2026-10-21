const userModel = require('../../models/userModel');

exports.list = async () => {
  return userModel.listAll();
};

exports.search = async (q, reqUserId) => {
  return userModel.search(q, reqUserId);
};

exports.getMe = async (userId) => {
  const user = await userModel.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return user;
};

exports.updateMe = async (userId, data) => {
  const user = await userModel.findById(userId);
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
    const existing = await userModel.findByEmail(trimmed);
    if (existing && existing.id !== userId) {
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

  return userModel.updateProfile(userId, patch);
};
