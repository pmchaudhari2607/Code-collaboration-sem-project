const bcrypt = require('bcryptjs');
const userModel = require('../../models/userModel');
const { generateToken } = require('../../utils/jwt');

exports.register = async (data) => {
  if (!data.username || !data.email || !data.password || !data.full_name) {
    const err = new Error('Missing required fields');
    err.statusCode = 400;
    throw err;
  }
  if (data.password.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.statusCode = 400;
    throw err;
  }
  if (data.password !== data.confirm_password) {
    const err = new Error('Passwords do not match');
    err.statusCode = 400;
    throw err;
  }

  const usernameTrimmed = data.username.trim();
  if (!/^[A-Za-z0-9_]{3,15}$/.test(usernameTrimmed)) {
    const err = new Error('Username must be 3-15 alphanumeric characters or underscores');
    err.statusCode = 400;
    throw err;
  }

  const existing = await userModel.findByUsernameOrEmail(usernameTrimmed, data.email.trim());
  if (existing) {
    const err = new Error('Username or email already taken');
    err.statusCode = 409;
    throw err;
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(data.password, salt);

  const newUser = await userModel.create({
    full_name: data.full_name.trim(),
    username: usernameTrimmed,
    email: data.email.trim(),
    password_hash: hash,
    bio: data.bio || ''
  });

  return {
    user: newUser,
    token: generateToken(newUser.id)
  };
};

exports.login = async (identifier, password) => {
  if (!identifier || !password) {
    const err = new Error('Invalid username/email or password.');
    err.statusCode = 401;
    throw err;
  }
  const user = await userModel.findAuthByIdentifier(identifier);
  if (!user) {
    const err = new Error('Invalid username/email or password.');
    err.statusCode = 401;
    throw err;
  }
  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    const err = new Error('Invalid username/email or password.');
    err.statusCode = 401;
    throw err;
  }

  const safeUser = { ...user };
  delete safeUser.password_hash;
  delete safeUser.password;

  return {
    user: safeUser,
    token: generateToken(user.id)
  };
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
