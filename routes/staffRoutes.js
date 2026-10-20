const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const authMiddleware = require('../middleware/auth');

// All staff endpoints require authentication
router.use(authMiddleware);

router.get('/', staffController.getStaff);
router.post('/', staffController.createStaff);
router.get('/:id', staffController.getStaffById);
router.put('/:id', staffController.updateStaff);
router.delete('/:id', staffController.deleteStaff);
router.put('/:id/reset-password', staffController.resetPassword);

module.exports = router;
