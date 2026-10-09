const store = require('../data/store');

exports.list = (userId) => {
  const notifs = store.filter('notifications', n => n.user_id === userId)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  return notifs.map(n => {
    const project = store.findById('projects', n.project_id);
    let memberContext = null;
    if (n.type === 'invitation') {
      memberContext = store.findById('project_members', n.reference_id);
    }
    return { ...n, projectName: project?.name, memberContext };
  });
};
exports.markRead = (id) => {
  return store.update('notifications', id, { is_read: true });
};
exports.markAllRead = (userId) => {
  const notifs = store.filter('notifications', n => n.user_id === userId && !n.is_read);
  notifs.forEach(n => store.update('notifications', n.id, { is_read: true }));
  return true;
};
exports.respondInvitation = (memberId, userId, status) => {
  const member = store.findById('project_members', memberId);
  if (!member) { const err = new Error('Invitation not found'); err.statusCode = 404; throw err; }
  if (member.user_id !== userId) { const err = new Error('This invitation does not belong to you.'); err.statusCode = 403; throw err; }

  store.update('project_members', member.id, { status, joined_at: status === 'accepted' ? new Date().toISOString() : null });

  const relatedNotifs = store.filter('notifications', n => n.type === 'invitation' && n.reference_id === memberId);
  relatedNotifs.forEach(n => store.remove('notifications', n.id));

  return true;
};
