const notificationModel = require('../../models/notificationModel');
const memberModel = require('../../models/memberModel');
const projectModel = require('../../models/projectModel');
const userModel = require('../../models/userModel');
const activityModel = require('../../models/activityModel');
const { withTransaction } = require('../../db/transaction');
const { exec } = require('../../models/helpers');

exports.list = async (userId) => {
  return notificationModel.listByUser(userId);
};

exports.markRead = async (id, userId) => {
  const notif = await notificationModel.findById(id);
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
  await notificationModel.markRead(id, userId);
  return true;
};

exports.markAllRead = async (userId) => {
  await notificationModel.markAllRead(userId);
  return true;
};

exports.respondInvitation = async (memberId, userId, status) => {
  const member = await memberModel.findById(memberId);
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

  return withTransaction(async (conn) => {
    // 1. Guarded update: WHERE id=? AND user_id=? AND status='pending'
    const affected = await memberModel.respondInvitation(memberId, userId, status, conn);
    if (!affected || affected === 0) {
      const err = new Error(`Invitation has already been responded to`);
      err.statusCode = 409;
      throw err;
    }

    // 2. Mark related invitation notification as read
    await exec(`
      UPDATE notifications
      SET is_read = 1
      WHERE type = 'invitation' AND reference_id = ? AND user_id = ?
    `, [memberId, userId], conn);

    // 3. Side-effects: activity if accepted
    const responder = await userModel.findById(userId, conn);
    const responderName = responder ? responder.full_name : 'A user';
    const project = await projectModel.findById(member.project_id, null, conn);
    const projectName = project ? project.name : 'the project';

    if (status === 'accepted') {
      await activityModel.log(
        member.project_id,
        userId,
        'joined the project.',
        conn
      );
    }

    // 4. Notify inviter
    if (member.invited_by) {
      const actionWord = status === 'accepted' ? 'accepted' : 'declined';
      await notificationModel.create({
        user_id: member.invited_by,
        type: 'invitation',
        message: `${responderName} ${actionWord} your invitation to ${projectName}.`,
        reference_id: member.id,
        project_id: member.project_id,
        is_read: false
      }, conn);
    }

    return true;
  });
};
