const notificationService = require('../services/notificationService');
const { success } = require('../utils/response');

exports.list = async (req, res, next) => {
  try {
    const data = await notificationService.list(req.user.id);
    success(res, 'Notifications', data);
  } catch(e) { next(e); }
};

exports.markRead = async (req, res, next) => {
  try {
    const data = await notificationService.markRead(req.params.id, req.user.id);
    success(res, 'Marked read', data);
  } catch(e) { next(e); }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const data = await notificationService.markAllRead(req.user.id);
    success(res, 'All marked read', data);
  } catch(e) { next(e); }
};

exports.acceptInvitation = async (req, res, next) => {
  try {
    const data = await notificationService.respondInvitation(req.params.id, req.user.id, 'accepted');
    success(res, 'Invitation accepted', data);
  } catch(e) { next(e); }
};

exports.declineInvitation = async (req, res, next) => {
  try {
    const data = await notificationService.respondInvitation(req.params.id, req.user.id, 'rejected');
    success(res, 'Invitation declined', data);
  } catch(e) { next(e); }
};
