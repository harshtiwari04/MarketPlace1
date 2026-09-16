import { Router } from 'express';
import { createCheckoutOrder, razorpayWebhook, verifyPayment } from '../controllers/checkout.controller';
import { optionalAuth, requirePhoneVerification } from '../middlewares/auth';
import { checkoutLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import { createCheckoutOrderSchema, verifyPaymentSchema } from '../validators/checkout.validators';

const router = Router();

router.post(
  '/create-order',
  checkoutLimiter,
  optionalAuth,
  validate({ body: createCheckoutOrderSchema }),
  requirePhoneVerification,
  createCheckoutOrder,
);
router.post('/verify-payment', checkoutLimiter, validate({ body: verifyPaymentSchema }), verifyPayment);

// No rate limit / auth: authenticated purely by HMAC over the raw body.
router.post('/webhook', razorpayWebhook);

export default router;
