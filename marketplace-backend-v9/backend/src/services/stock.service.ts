import mongoose from 'mongoose';
import { Order, computeOrderStatus, type OrderDocument } from '../models/Order';
import { Product } from '../models/Product';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { refundPayment } from './razorpay.service';

class InsufficientStockError extends Error {
  constructor(public readonly title: string) {
    super(`Insufficient stock for "${title}"`);
    this.name = 'InsufficientStockError';
  }
}

export interface FinalizeResult {
  order: OrderDocument;
  /** true when this call performed the transition; false if it was already paid (idempotent replay). */
  newlyPaid: boolean;
}

/**
 * Atomically deducts stock for every line item and marks the order paid, inside a single
 * MongoDB transaction (requires a replica set). Safe to call from both the browser
 * verify-payment flow and the webhook — whichever arrives first wins; the other is a no-op.
 *
 * Each product decrement uses a conditional filter `{ stock: { $gte: quantity } }`, which is
 * the only race-free way to guarantee stock never goes negative under concurrent checkouts.
 */
export const finalizePaidOrder = async (
  razorpayOrderId: string,
  razorpayPaymentId: string,
): Promise<FinalizeResult> => {
  const session = await mongoose.startSession();
  let order: OrderDocument | null = null;
  let newlyPaid = false;

  try {
    await session.withTransaction(async () => {
      newlyPaid = false;
      order = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId }).session(session);
      if (!order) throw ApiError.notFound('No order found for this payment');
      if (order.payment.status === 'paid') return;

      for (const item of order.items) {
        const result = await Product.updateOne(
          { _id: item.product, isActive: true, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session },
        );
        if (result.matchedCount === 0) throw new InsufficientStockError(item.title);
      }

      // Payment confirms every item at once — each seller's per-item timeline starts here.
      const confirmedAt = new Date();
      for (const item of order.items) {
        item.status = 'confirmed';
        item.statusHistory.push({ status: 'confirmed', at: confirmedAt });
      }
      order.payment.status = 'paid';
      order.payment.razorpayPaymentId = razorpayPaymentId;
      order.status = computeOrderStatus(order.items);
      order.statusHistory.push({ status: order.status, at: confirmedAt });
      await order.save({ session });
      newlyPaid = true;
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      await handleOversell(razorpayOrderId, razorpayPaymentId, err.message);
      throw ApiError.conflict(`${err.message}. Your payment will be refunded automatically.`, 'INSUFFICIENT_STOCK');
    }
    throw err;
  } finally {
    await session.endSession();
  }

  return { order: order as unknown as OrderDocument, newlyPaid };
};

/**
 * Payment captured but inventory ran out between order creation and capture.
 * Record it honestly (paid + cancelled) and trigger a refund so money never sits in limbo.
 */
const handleOversell = async (razorpayOrderId: string, razorpayPaymentId: string, reason: string) => {
  let refundId: string | undefined;
  try {
    const refund = await refundPayment(razorpayPaymentId, { reason: 'out_of_stock', razorpayOrderId });
    refundId = refund.id;
  } catch (err) {
    logger.error('Automatic refund failed — manual action required', { razorpayPaymentId, err: String(err) });
  }

  await Order.updateOne(
    { 'payment.razorpayOrderId': razorpayOrderId, 'payment.status': { $ne: 'paid' } },
    [
      {
        $set: {
          status: 'cancelled',
          'payment.status': 'paid',
          'payment.razorpayPaymentId': razorpayPaymentId,
          'payment.failureReason': reason,
          ...(refundId ? { 'payment.refundId': refundId } : {}),
          statusHistory: { $concatArrays: ['$statusHistory', [{ status: 'cancelled', at: new Date() }]] },
          // Aggregation-pipeline update: cancel every item and append to each item's own history too,
          // so a seller's item-level timeline still shows why it never shipped.
          items: {
            $map: {
              input: '$items',
              as: 'item',
              in: {
                $mergeObjects: [
                  '$$item',
                  {
                    status: 'cancelled',
                    statusHistory: {
                      $concatArrays: ['$$item.statusHistory', [{ status: 'cancelled', at: new Date() }]],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  );
};

export const markPaymentFailed = async (razorpayOrderId: string, reason?: string): Promise<void> => {
  await Order.updateOne(
    { 'payment.razorpayOrderId': razorpayOrderId, 'payment.status': 'pending' },
    { $set: { 'payment.status': 'failed', 'payment.failureReason': reason ?? 'Payment failed' } },
  );
};
