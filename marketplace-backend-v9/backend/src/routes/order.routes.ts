import { Router } from 'express';
import { getMyOrder, listMyOrders, trackOrder } from '../controllers/order.controller';
import { requirePhoneVerification, requireRegistered, verifyJWT } from '../middlewares/auth';
import { authedReadLimiter, checkoutLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import { orderIdParamSchema } from '../validators/seller.validators';
import { trackOrderSchema } from '../validators/order.validators';
import checkoutRoutes from './checkout.routes';

const router = Router();

// Checkout endpoints have always also been reachable under /orders (the SPA calls
// /orders/create-order and /orders/verify-payment). Mounted first so nothing below shadows them.
router.use(checkoutRoutes);

// Guest tracking: rate-limited because a valid phone token lets you enumerate order ids for that phone.
router.post('/track', checkoutLimiter, validate({ body: trackOrderSchema }), requirePhoneVerification, trackOrder);

// Registered buyers' order history.
router.get('/', authedReadLimiter, verifyJWT, requireRegistered, listMyOrders);
router.get('/:id', authedReadLimiter, verifyJWT, requireRegistered, validate({ params: orderIdParamSchema }), getMyOrder);

export default router;
