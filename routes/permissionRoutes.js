const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Get current user's active permissions (any authenticated user)
router.get('/my-permissions', permissionController.getMyPermissions);

// Admin-only management endpoints
router.get('/users', permissionController.getAllStaffPermissions);
router.get('/user/:userId', permissionController.getUserPermissions);
router.put('/user/:userId', permissionController.updateUserPermissions);

module.exports = router;
