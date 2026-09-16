import { Router } from 'express';
import {
  adminDeleteProduct,
  adminSetProductStatus,
  adminUpdateItemDelivery,
  adminUpdateItemStatus,
  analyticsOverview,
  analyticsRevenueByCategory,
  analyticsRevenueTimeseries,
  analyticsTopProducts,
  analyticsTopSellers,
  getOrder,
  getUser,
  listOrders,
  listProducts,
  listUsers,
  updateUser,
} from '../controllers/admin.controller';
import { requireAdmin, verifyJWT } from '../middlewares/auth';
import { adminWriteLimiter, authedReadLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import { adminUserUpdateSchema } from '../validators/admin.validators';
import { idParamSchema } from '../validators/common';
import { productStatusSchema } from '../validators/product.validators';
import { deliveryUpdateSchema, orderIdParamSchema, orderItemParamSchema, updateOrderStatusSchema } from '../validators/seller.validators';

const router = Router();

// Every admin route: authenticated + role admin (re-checked against the DB on every request).
router.use(verifyJWT, requireAdmin);
router.get('*', authedReadLimiter);
router.patch('*', adminWriteLimiter);
router.delete('*', adminWriteLimiter);

// Analytics — all accept ?from=&to= (ISO dates); default last 30 days.
router.get('/analytics/overview', analyticsOverview);
router.get('/analytics/revenue-by-category', analyticsRevenueByCategory);
router.get('/analytics/revenue-timeseries', analyticsRevenueTimeseries); // &granularity=day|week|month
router.get('/analytics/top-products', analyticsTopProducts); // &limit=
router.get('/analytics/top-sellers', analyticsTopSellers);

// Users
router.get('/users', listUsers);
router.get('/users/:id', validate({ params: idParamSchema }), getUser);
router.patch('/users/:id', validate({ params: idParamSchema, body: adminUserUpdateSchema }), updateUser);

// Orders — full cross-seller visibility
router.get('/orders', listOrders);
router.get('/orders/:id', validate({ params: orderIdParamSchema }), getOrder);
router.patch('/orders/:id/items/:productId/status', validate({ params: orderItemParamSchema, body: updateOrderStatusSchema }), adminUpdateItemStatus);
router.patch('/orders/:id/items/:productId/delivery', validate({ params: orderItemParamSchema, body: deliveryUpdateSchema }), adminUpdateItemDelivery);

// Products — moderation
router.get('/products', listProducts);
router.patch('/products/:id/status', validate({ params: idParamSchema, body: productStatusSchema }), adminSetProductStatus);
router.delete('/products/:id', validate({ params: idParamSchema }), adminDeleteProduct);

export default router;
