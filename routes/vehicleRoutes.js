const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');

router.use(authMiddleware);

router.get('/', requirePermission('vehicles', 'view'), vehicleController.getVehicles);
router.post('/', requirePermission('vehicles', 'add'), vehicleController.createVehicle);
router.get('/:id', requirePermission('vehicles', 'view'), vehicleController.getVehicleById);
router.put('/:id', requirePermission('vehicles', 'edit'), vehicleController.updateVehicle);
router.delete('/:id', requirePermission('vehicles', 'delete'), vehicleController.deleteVehicle);

module.exports = router;
