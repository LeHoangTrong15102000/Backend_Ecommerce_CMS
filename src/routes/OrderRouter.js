const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/OrderController');
const { AuthPermission } = require('../middleware/AuthPermission');
const { CONFIG_PERMISSIONS } = require('../configs');

router.post(
  '/',
  AuthPermission(CONFIG_PERMISSIONS.MANAGE_ORDER.ORDER.CREATE),
  OrderController.createOrder
);

router.put(
  '/:id',
  AuthPermission(CONFIG_PERMISSIONS.MANAGE_ORDER.ORDER.UPDATE),
  OrderController.updateOrder
);

// Phải đưa thằng này lên trước không thì nó sẽ call xuống /:orderId trước
router.get('/me', AuthPermission('', true), OrderController.getAllOrderOfMe);

router.get(
  '/:orderId',
  AuthPermission(CONFIG_PERMISSIONS.MANAGE_ORDER.ORDER.VIEW),
  OrderController.getDetailsOrder
);

router.get(
  '/',
  AuthPermission(CONFIG_PERMISSIONS.MANAGE_ORDER.ORDER.VIEW),
  OrderController.getAllOrder
);

router.post(
  '/cancel/:orderId',
  AuthPermission(CONFIG_PERMISSIONS.MANAGE_ORDER.ORDER.UPDATE),
  OrderController.cancelOrderProduct
);

router.delete(
  '/:orderId',
  AuthPermission(CONFIG_PERMISSIONS.MANAGE_ORDER.ORDER.DELETE),
  OrderController.deleteOrderProduct
);

// me

router.post(
  '/me/cancel/:orderId',
  AuthPermission('', true),
  OrderController.cancelOrderOfMe
);

router.get('/me/:orderId', AuthPermission('', true), OrderController.getDetailsOrderOfMe);

module.exports = router;
