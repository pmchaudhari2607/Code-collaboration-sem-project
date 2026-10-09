const express = require('express');
const router = express.Router({ mergeParams: true });
const projectController = require('../controllers/projectController');
const { requireProjectRole, requireProjectAccess } = require('../middleware/permissionMiddleware');
const { ROLES } = require('../utils/constants');

router.get('/', requireProjectAccess(), projectController.listMembers);
router.post('/invitations', requireProjectRole([ROLES.OWNER]), projectController.inviteMember);
router.delete('/:userId', requireProjectRole([ROLES.OWNER]), projectController.removeMember);

module.exports = router;
