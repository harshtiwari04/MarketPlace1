import { z } from 'zod';
import { ORDER_STATUSES } from '../constants';
import { paginationSchema } from './common';

/** Buyer order history filters — `status` is the order-wide aggregate, not a per-item value. */
export const buyerOrderQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
});

/**
 * Guest tracking: the human-readable ORD-… id plus proof of phone ownership.
 * The phone itself is never accepted from the body — it is read from the verified token by
 * requirePhoneVerification, so a caller can't look up someone else's order by guessing a number.
 */
export const trackOrderSchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  phoneVerificationToken: z.string().min(1).optional(),
});

export type BuyerOrderQuery = z.infer<typeof buyerOrderQuerySchema>;
export type TrackOrderInput = z.infer<typeof trackOrderSchema>;
