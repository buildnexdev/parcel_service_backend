const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', orderController.getOrders);
router.get('/next-waybill', orderController.getNextWaybillNumber);
router.post('/', orderController.createOrder);
router.get('/:id', orderController.getOrderById);
router.put('/:id', orderController.updateOrder); // Full order edit route
router.patch('/:id/payment', orderController.updatePayment); // In-place payment update on order table/page!
router.patch('/:id/status', orderController.updateDeliveryStatus);
router.post('/:id/checkpoint', orderController.addTrackingCheckpoint);
router.delete('/:id', orderController.deleteOrder);

module.exports = router;
