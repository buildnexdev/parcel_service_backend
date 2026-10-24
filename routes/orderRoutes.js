const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');

router.use(authMiddleware);

router.get('/', requirePermission('orders', 'view'), orderController.getOrders);
router.get('/next-waybill', requirePermission('orders', 'add'), orderController.getNextWaybillNumber);
router.post('/', requirePermission('orders', 'add'), orderController.createOrder);
router.get('/:id', requirePermission('orders', 'view'), orderController.getOrderById);
router.put('/:id', requirePermission('orders', 'edit'), orderController.updateOrder); // Full order edit
router.patch('/:id/payment', requirePermission('orders', 'edit'), orderController.updatePayment); // Payment update
router.patch('/:id/status', requirePermission('orders', 'edit'), orderController.updateDeliveryStatus);
router.post('/:id/checkpoint', requirePermission('orders', 'edit'), orderController.addTrackingCheckpoint);
router.delete('/:id', requirePermission('orders', 'delete'), orderController.deleteOrder);

module.exports = router;
