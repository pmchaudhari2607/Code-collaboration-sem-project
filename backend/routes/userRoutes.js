const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.get('/', userController.list);
router.get('/search', userController.search);
router.get('/me', userController.me);
router.put('/me', userController.updateMe);
router.delete('/me', userController.deleteMe);

module.exports = router;
