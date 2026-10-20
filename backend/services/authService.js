const bcrypt = require('bcryptjs');
const store = require('../data/store');
const { generateToken } = require('../utils/jwt');
const { newId } = require('../utils/id');

exports.register = (data) => {
  if (!data.username || !data.email || !data.password || !data.full_name) {
    const err = new Error('Missing required fields'); err.statusCode = 400; throw err;
  }
  if (data.password.length < 6) {
    const err = new Error('Password must be at least 6 characters'); err.statusCode = 400; throw err;
  }
  if (data.password !== data.confirm_password) {
    const err = new Error('Passwords do not match'); err.statusCode = 400; throw err;
  }
  const existing = store.find('users', u => u.username === data.username || u.email === data.email);
  if (existing) {
    const err = new Error('Username or email already taken'); err.statusCode = 409; throw err;
  }
  
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(data.password, salt);
  
  const newUser = store.insert('users', {
    id: newId('u'),
    full_name: data.full_name,
    username: data.username,
    email: data.email,
    password: hash,
    created_at: new Date().toISOString()
  });
  
  const userReturn = { ...newUser };
  delete userReturn.password;
  
  return { user: userReturn, token: generateToken(newUser.id) };
};

exports.login = (identifier, password) => {
  const user = store.find('users', u => u.username === identifier || u.email === identifier);
  if (!user) {
    const err = new Error('Invalid username/email or password.'); err.statusCode = 401; throw err;
  }
  const isValid = bcrypt.compareSync(password, user.password);
  if (!isValid) {
    const err = new Error('Invalid username/email or password.'); err.statusCode = 401; throw err;
  }
  
  const userReturn = { ...user };
  delete userReturn.password;
  return { user: userReturn, token: generateToken(user.id) };
};

exports.getMe = (userId) => {
  const user = store.findById('users', userId);
  if (!user) { const err = new Error('User not found'); err.statusCode = 404; throw err; }
  const userReturn = { ...user };
  delete userReturn.password;
  return userReturn;
};
