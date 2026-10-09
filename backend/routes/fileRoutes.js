const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const versionRoutes = require('./versionRoutes');
const reviewRoutes = require('./reviewRoutes');
const authMiddleware = require('../middleware/authMiddleware');
const { requireProjectRole, requireProjectAccess } = require('../middleware/permissionMiddleware');
const { ROLES } = require('../utils/constants');

router.use(authMiddleware);

router.get('/project/:projectId', requireProjectAccess(), fileController.listByProject);
router.post('/project/:projectId', requireProjectRole([ROLES.OWNER, ROLES.COLLABORATOR]), fileController.create);
router.get('/:fileId', requireProjectAccess(), fileController.getById);
router.put('/:fileId', requireProjectRole([ROLES.OWNER, ROLES.COLLABORATOR]), fileController.updateCode);
router.delete('/:fileId', requireProjectRole([ROLES.OWNER]), fileController.remove);

router.use('/:fileId/versions', requireProjectAccess(), versionRoutes);
router.use('/:fileId/reviews', requireProjectAccess(), reviewRoutes);

module.exports = router;
