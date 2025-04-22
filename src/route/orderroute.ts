import { Router } from 'express';
import * as OrderController from '../controllers/ordercontroller';
import { createOrder, getAllOrders, getOrders, getOrderById, getMarketplaceOrders, updateOrder, confirmPayment, getOrderAnalytics, getOrdersByCustomerId } from '../controllers/ordercontroller';
import { Admin } from '../middlewares/rbac';
import { authToken } from '../middlewares/auth';


const router = Router();


router.post('/orders', authToken, createOrder);
router.get('/orders',   getOrders);
router.get('/orders/all', authToken, Admin, getAllOrders);
router.get('/orders/customer/:customerId', authToken, getOrdersByCustomerId);
router.get('/orders/:id', authToken,  getOrderById);
router.get('/orders/marketplace/:marketplace', authToken, Admin, getMarketplaceOrders);
router.patch('/orders/update', authToken, Admin, updateOrder);
router.post('/orders/confirm-payment', authToken, Admin, confirmPayment);
//router.delete('/orders/delete', deleteOrder);
//router.post('/orders/refund', processRefund);
//router.post('/orders/bulk-update', bulkUpdateOrders);
router.get('/orders/analytics', authToken, Admin, getOrderAnalytics);

export default router;