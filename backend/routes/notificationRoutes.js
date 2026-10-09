const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.get('/', notificationController.list);
router.put('/mark-all-read', notificationController.markAllRead);
router.put('/:id/read', notificationController.markRead);
router.post('/invitations/:id/accept', notificationController.acceptInvitation);
router.post('/invitations/:id/decline', notificationController.declineInvitation);

module.exports = router;
