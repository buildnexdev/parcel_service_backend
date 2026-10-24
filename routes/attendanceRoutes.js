const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');

router.use(authMiddleware);

router.get('/', requirePermission('attendance', 'view'), attendanceController.getAttendance);
router.post('/mark', requirePermission('attendance', 'add'), attendanceController.markAttendance);
router.get('/monthly-summary', requirePermission('attendance', 'view'), attendanceController.getMonthlySummary);
router.get('/user-month-records', requirePermission('attendance', 'view'), attendanceController.getUserMonthRecords);
router.delete('/:id', requirePermission('attendance', 'delete'), attendanceController.deleteAttendance);

module.exports = router;
