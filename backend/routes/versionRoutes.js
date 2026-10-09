const express = require('express');
const router = express.Router({ mergeParams: true });
const fileController = require('../controllers/fileController');
const { requireProjectRole, requireProjectAccess } = require('../middleware/permissionMiddleware');
const { ROLES } = require('../utils/constants');

router.get('/', fileController.listVersions);
router.post('/', requireProjectRole([ROLES.OWNER, ROLES.COLLABORATOR]), fileController.createVersion);

module.exports = router;
