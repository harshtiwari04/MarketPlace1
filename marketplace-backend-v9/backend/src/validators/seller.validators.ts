import { z } from 'zod';
import { CARRIERS, ORDER_STATUSES, ORDER_STATUS_ALIASES, PAYMENT_STATUSES } from '../constants';
import { paginationSchema } from './common';

/** Accepts stored statuses and their common aliases (pending, shipped, …) — normalised in the controller. */
export const updateOrderStatusSchema = z.object({
  status: z.enum([...ORDER_STATUSES, ...(Object.keys(ORDER_STATUS_ALIASES) as [string, ...string[]])]),
});

/** `null` / '' clears a field; omitted leaves it untouched. */
const clearable = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === '' ? null : v), schema.nullable()).optional();

export const deliveryUpdateSchema = z
  .object({
    carrier: clearable(z.enum(CARRIERS)),
    carrierName: clearable(z.string().trim().max(60)),
    trackingNumber: clearable(z.string().trim().max(80)),
    trackingUrl: clearable(z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Tracking URL must be http(s)')),
    estimatedDeliveryAt: clearable(z.coerce.date()),
    notes: clearable(z.string().trim().max(300)),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Provide at least one delivery field' });

export type DeliveryUpdateInput = z.infer<typeof deliveryUpdateSchema>;

export const sellerOrderQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  phone: z.string().trim().max(20).optional(),
});

/** Accepts a Mongo _id or the human-readable ORD-… id. */
export const orderIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

/** Identifies one seller's line item within an order for per-item status updates. */
export const orderItemParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
  productId: z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid product id'),
});
