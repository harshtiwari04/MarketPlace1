import { razorpay } from '../config/razorpay';
import { env } from '../config/env';
import { hmacSha256Hex, safeEqual } from '../utils/crypto';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export interface CreatedRazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
}

/**
 * Creates a Razorpay Order. `amountInPaisa` must be an integer computed server-side.
 * `receipt` is our human-readable orderId — useful for reconciliation in the dashboard.
 */
export const createRazorpayOrder = async (
  amountInPaisa: number,
  receipt: string,
  notes: Record<string, string> = {},
): Promise<CreatedRazorpayOrder> => {
  try {
    const order = await razorpay.orders.create({
      amount: amountInPaisa,
      currency: 'INR',
      receipt,
      notes,
      payment_capture: true,
    });
    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      receipt: order.receipt ?? undefined,
    };
  } catch (err) {
    logger.error('Razorpay order creation failed', { err: String(err) });
    throw ApiError.badGateway('Unable to initiate payment. Please try again.');
  }
};

/**
 * Checkout signature: HMAC-SHA256(`${order_id}|${payment_id}`, KEY_SECRET).
 * Sent by Razorpay Checkout.js to the frontend, which forwards it to us.
 */
export const verifyCheckoutSignature = (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
): boolean => {
  const expected = hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${razorpayOrderId}|${razorpayPaymentId}`);
  return safeEqual(expected, signature);
};

/**
 * Webhook signature: HMAC-SHA256(rawRequestBody, WEBHOOK_SECRET) in `X-Razorpay-Signature`.
 * Must be computed on the *raw* bytes, not the re-serialised parsed body.
 */
export const verifyWebhookSignature = (rawBody: Buffer, signature: string): boolean => {
  const expected = hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody);
  return safeEqual(expected, signature);
};

export const fetchPayment = (paymentId: string) => razorpay.payments.fetch(paymentId);

/** Full refund — used when payment succeeded but stock could no longer be reserved. */
export const refundPayment = async (paymentId: string, notes: Record<string, string> = {}) => {
  return razorpay.payments.refund(paymentId, { notes, speed: 'normal' });
};
