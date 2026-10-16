const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/daily', reportController.getDailyReport);
router.get('/summary', reportController.getDashboardSummary);

module.exports = router;
