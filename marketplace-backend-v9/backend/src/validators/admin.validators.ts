import { z } from 'zod';
import { ASSIGNABLE_ROLES, ORDER_STATUSES, PAYMENT_STATUSES } from '../constants';
import { objectIdSchema, paginationSchema, booleanFromString } from './common';

/** `from`/`to` as ISO dates or YYYY-MM-DD. Defaults (last 30 days) are applied in the controller. */
export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((d) => !d.from || !d.to || d.from <= d.to, { message: '`from` must be before `to`', path: ['from'] });

export const timeseriesQuerySchema = dateRangeSchema.and(
  z.object({ granularity: z.enum(['day', 'week', 'month']).default('day') }),
);

export const leaderboardQuerySchema = dateRangeSchema.and(
  z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
);

export const adminUserQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  suspended: booleanFromString.optional(),
  verified: booleanFromString.optional(),
  sort: z.enum(['newest', 'oldest', 'last_login', 'name']).default('newest'),
});

export const adminUserUpdateSchema = z
  .object({
    role: z.enum(ASSIGNABLE_ROLES).optional(),
    isSuspended: z.boolean().optional(),
    storeName: z.string().trim().min(2).max(100).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const adminOrderQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  /** Matches orderId, buyer phone, buyer email, or Razorpay payment id. */
  q: z.string().trim().max(80).optional(),
  sellerId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const adminProductQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().toLowerCase().max(60).optional(),
  sellerId: objectIdSchema.optional(),
  includeInactive: booleanFromString.optional(),
  sort: z.enum(['newest', 'oldest', 'title_asc', 'price_desc', 'stock_asc']).default('newest'),
});

export type DateRangeQuery = z.infer<typeof dateRangeSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
