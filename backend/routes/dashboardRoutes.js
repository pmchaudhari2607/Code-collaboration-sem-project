const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.get('/stats', dashboardController.getStats);
router.get('/activity', dashboardController.getActivity);

module.exports = router;
