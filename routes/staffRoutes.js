const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');

// All staff endpoints require authentication
router.use(authMiddleware);

router.get('/', requirePermission('staff', 'view'), staffController.getStaff);
router.post('/', requirePermission('staff', 'add'), staffController.createStaff);
router.get('/:id', requirePermission('staff', 'view'), staffController.getStaffById);
router.put('/:id', requirePermission('staff', 'edit'), staffController.updateStaff);
router.delete('/:id', requirePermission('staff', 'delete'), staffController.deleteStaff);
router.put('/:id/reset-password', requirePermission('staff', 'edit'), staffController.resetPassword);

module.exports = router;
