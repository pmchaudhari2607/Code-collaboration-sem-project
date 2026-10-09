const express = require('express');
const router = express.Router({ mergeParams: true });
const reviewController = require('../controllers/reviewController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireProjectRole, requireProjectAccess } = require('../middleware/permissionMiddleware');
const { ROLES } = require('../utils/constants');

router.use(authMiddleware);

router.get('/', requireProjectAccess(), reviewController.listByFile);
router.post('/', requireProjectRole([ROLES.OWNER, ROLES.COLLABORATOR, ROLES.VIEWER]), reviewController.create);

router.get('/all', reviewController.listAll);
router.put('/:reviewId/status', reviewController.updateStatus);

module.exports = router;
