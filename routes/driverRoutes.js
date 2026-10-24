const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');

router.use(authMiddleware);

router.get('/', requirePermission('drivers', 'view'), driverController.getDrivers);
router.post('/', requirePermission('drivers', 'add'), driverController.createDriver);
router.get('/:id', requirePermission('drivers', 'view'), driverController.getDriverById);
router.put('/:id', requirePermission('drivers', 'edit'), driverController.updateDriver);
router.delete('/:id', requirePermission('drivers', 'delete'), driverController.deleteDriver);

module.exports = router;
