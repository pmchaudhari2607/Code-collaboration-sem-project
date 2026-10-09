const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireProjectRole, requireProjectAccess } = require('../middleware/permissionMiddleware');
const { ROLES } = require('../utils/constants');

router.use(authMiddleware);
router.get('/', projectController.list);
router.post('/', projectController.create);
router.get('/:id', requireProjectAccess(), projectController.getById);
router.get('/:id/activity', requireProjectAccess(), projectController.getActivity);
router.put('/:id', requireProjectRole([ROLES.OWNER]), projectController.update);
router.delete('/:id', requireProjectRole([ROLES.OWNER]), projectController.remove);

const memberRoutes = require('./memberRoutes');
router.use('/:projectId/members', requireProjectRole([ROLES.OWNER, ROLES.COLLABORATOR, ROLES.VIEWER]), memberRoutes);

module.exports = router;
