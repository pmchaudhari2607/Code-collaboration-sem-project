const store = require('../../data/store');
const { newId } = require('../../utils/id');

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

exports.markRead = (id, userId) => {
  const notif = store.findById('notifications', id);
  if (!notif) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }
  if (notif.user_id !== userId) {
    const err = new Error('You do not have permission to access this notification.');
    err.statusCode = 403;
    throw err;
  }
  return store.update('notifications', id, { is_read: true });
};

exports.markAllRead = (userId) => {
  const notifs = store.filter('notifications', n => n.user_id === userId && !n.is_read);
  notifs.forEach(n => store.update('notifications', n.id, { is_read: true }));
  return true;
};

exports.respondInvitation = (memberId, userId, status) => {
  const member = store.findById('project_members', memberId);
  if (!member) {
    const err = new Error('Invitation not found');
    err.statusCode = 404;
    throw err;
  }
  if (member.user_id !== userId) {
    const err = new Error('This invitation does not belong to you.');
    err.statusCode = 403;
    throw err;
  }
  if (member.status !== 'pending') {
    const err = new Error(`Invitation has already been responded to (status: ${member.status})`);
    err.statusCode = 409;
    throw err;
  }

  // Update member status
  store.update('project_members', member.id, {
    status,
    joined_at: status === 'accepted' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  });

  // Keep invitation notification: mark it read, do NOT delete it
  const relatedNotifs = store.filter('notifications', n => n.type === 'invitation' && n.reference_id === memberId && n.user_id === userId);
  relatedNotifs.forEach(n => store.update('notifications', n.id, { is_read: true }));

  // Notify the inviter
  const responder = store.findById('users', userId);
  const project = store.findById('projects', member.project_id);
  const actionWord = status === 'accepted' ? 'accepted' : 'declined';
  const responderName = responder ? responder.full_name : 'A user';
  const projectName = project ? project.name : 'the project';

  if (member.invited_by) {
    store.insert('notifications', {
      id: newId('n'),
      user_id: member.invited_by,
      type: 'invitation',
      message: `${responderName} ${actionWord} your invitation to ${projectName}.`,
      reference_id: member.id,
      project_id: member.project_id,
      is_read: false,
      created_at: new Date().toISOString()
    });
  }

  return true;
};
