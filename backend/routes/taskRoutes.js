const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.get('/', taskController.list);
router.post('/', taskController.create);
router.put('/:id', taskController.update);

module.exports = router;
