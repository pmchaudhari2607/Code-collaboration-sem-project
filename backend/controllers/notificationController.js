const notificationService = require('../services/notificationService');
const { success } = require('../utils/response');

exports.list = (req, res, next) => {
  try { success(res, 'Notifications', notificationService.list(req.user.id)); } catch(e) { next(e); }
};
exports.markRead = (req, res, next) => {
  try { success(res, 'Marked read', notificationService.markRead(req.params.id, req.user.id)); } catch(e) { next(e); }
};
exports.markAllRead = (req, res, next) => {
  try { success(res, 'All marked read', notificationService.markAllRead(req.user.id)); } catch(e) { next(e); }
};
exports.acceptInvitation = (req, res, next) => {
  try { success(res, 'Invitation accepted', notificationService.respondInvitation(req.params.id, req.user.id, 'accepted')); } catch(e) { next(e); }
};
exports.declineInvitation = (req, res, next) => {
  try { success(res, 'Invitation declined', notificationService.respondInvitation(req.params.id, req.user.id, 'rejected')); } catch(e) { next(e); }
};
