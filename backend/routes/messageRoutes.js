const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireProjectRole } = require('../middleware/permissionMiddleware');

router.use(authMiddleware);

// GET /api/messages/:projectId
router.get('/:projectId', requireProjectRole(['owner', 'collaborator', 'viewer']), messageController.list);

// POST /api/messages/:projectId
router.post('/:projectId', requireProjectRole(['owner', 'collaborator']), messageController.create);

module.exports = router;
