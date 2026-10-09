const store = require('../data/store');

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
  const u = {...user};
  delete u.password;
  return u;
};
exports.updateMe = (userId, data) => {
  const allowed = { full_name: data.full_name, email: data.email, bio: data.bio };
  const updated = store.update('users', userId, allowed);
  const u = {...updated};
  delete u.password;
  return u;
};
