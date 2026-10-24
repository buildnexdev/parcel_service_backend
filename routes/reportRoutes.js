const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');

router.use(authMiddleware);

router.get('/daily', requirePermission('reports', 'view'), reportController.getDailyReport);
router.get('/summary', requirePermission('reports', 'view'), reportController.getDashboardSummary);

module.exports = router;
