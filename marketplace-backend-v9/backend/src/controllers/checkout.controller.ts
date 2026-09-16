import { Types } from 'mongoose';
import { env } from '../config/env';
import { ERROR_CODES, HTTP, MESSAGES } from '../constants';
import { Order } from '../models/Order';
import { priceCart } from '../services/order.service';
import { createRazorpayOrder, verifyCheckoutSignature, verifyWebhookSignature } from '../services/razorpay.service';
import { finalizePaidOrder, markPaymentFailed } from '../services/stock.service';
import { sendOrderConfirmation } from '../services/whatsapp.service';
import { ApiError } from '../utils/ApiError';
import { sendResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateOrderId } from '../utils/crypto';
import { logger } from '../utils/logger';
import type { CreateCheckoutOrderInput, VerifyPaymentInput } from '../validators/checkout.validators';

const notifyConfirmation = (order: Parameters<typeof sendOrderConfirmation>[0]) =>
  sendOrderConfirmation(order).catch((err) =>
    logger.warn('Order confirmation not delivered', { orderId: order.orderId, err: String(err) }),
  );

/**
 * POST /checkout/create-order
 * Guards: optionalAuth (buyer or guest) + requirePhoneVerification (sets req.phone).
 */
export const createCheckoutOrder = asyncHandler(async (req, res) => {
  const { items, shippingAddress, email } = req.body as CreateCheckoutOrderInput;
  const phone = req.phone!; // guaranteed by requirePhoneVerification

  const { lineItems, totalAmount, amountInPaisa } = await priceCart(items);
  const orderId = generateOrderId();

  const rzpOrder = await createRazorpayOrder(amountInPaisa, orderId, { orderId, phone });

  const isGuest = !req.user || req.user.isGuest;
  const order = await Order.create({
    orderId,
    buyer: { userId: isGuest ? undefined : new Types.ObjectId(req.user!.id), phone, email, isGuest },
    items: lineItems,
    shippingAddress,
    totalAmount,
    payment: { method: 'razorpay', razorpayOrderId: rzpOrder.id, status: 'pending' },
    status: 'placed',
    otpVerified: true,
    statusHistory: [{ status: 'placed', at: new Date() }],
  });

  sendResponse(
    res,
    {
      orderId: order.orderId,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount, // paisa — pass straight to Checkout.js
      currency: rzpOrder.currency,
      keyId: env.RAZORPAY_KEY_ID,
      prefill: { contact: phone, email },
      items: lineItems,
      totalAmount,
    },
    'Order initiated',
    HTTP.CREATED,
  );
});

/**
 * POST /checkout/verify-payment
 * Called by the SPA with the Checkout.js success payload. Verifies HMAC, deducts stock atomically,
 * marks paid, and dispatches the WhatsApp confirmation.
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as VerifyPaymentInput;

  if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    logger.warn('Checkout signature mismatch', { razorpay_order_id, razorpay_payment_id, ip: req.ip });
    throw ApiError.badRequest(MESSAGES.INVALID_SIGNATURE, undefined, ERROR_CODES.INVALID_SIGNATURE);
  }

  const { order, newlyPaid } = await finalizePaidOrder(razorpay_order_id, razorpay_payment_id);
  if (newlyPaid) void notifyConfirmation(order);

  sendResponse(
    res,
    {
      orderId: order.orderId,
      status: order.status,
      paymentStatus: order.payment.status,
      totalAmount: order.totalAmount,
      items: order.items,
    },
    newlyPaid ? 'Payment verified' : 'Payment already recorded',
  );
});

interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    payment?: {
      entity?: { id: string; order_id: string; error_description?: string; error_reason?: string };
    };
  };
}

/**
 * POST /checkout/webhook
 * Backstop for network drop-offs: if the browser never reached verify-payment, `payment.captured`
 * still finalizes the order (idempotently). Returns 2xx once processed; 5xx makes Razorpay retry.
 */
export const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (typeof signature !== 'string' || !req.rawBody || !verifyWebhookSignature(req.rawBody, signature)) {
    logger.warn('Webhook signature rejected', { ip: req.ip });
    throw ApiError.badRequest(MESSAGES.INVALID_SIGNATURE, undefined, ERROR_CODES.INVALID_SIGNATURE);
  }

  const event = req.body as RazorpayWebhookEvent;
  const payment = event.payload?.payment?.entity;

  switch (event.event) {
    case 'payment.captured': {
      if (!payment?.order_id) break;
      try {
        const { order, newlyPaid } = await finalizePaidOrder(payment.order_id, payment.id);
        if (newlyPaid) void notifyConfirmation(order);
      } catch (err) {
        // 404 / 409 are terminal for this event — acknowledge so Razorpay stops retrying.
        if (err instanceof ApiError && (err.statusCode === HTTP.NOT_FOUND || err.statusCode === HTTP.CONFLICT)) {
          logger.warn('Webhook capture not applied', { razorpayOrderId: payment.order_id, reason: err.message });
          break;
        }
        throw err; // transient → 500 → Razorpay retries
      }
      break;
    }
    case 'payment.failed': {
      if (!payment?.order_id) break;
      await markPaymentFailed(payment.order_id, payment.error_description ?? payment.error_reason);
      break;
    }
    default:
      logger.info('Unhandled Razorpay webhook event', { event: event.event });
  }

  res.status(HTTP.OK).json({ received: true });
});
