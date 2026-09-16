import { z } from 'zod';
import { objectIdSchema } from './common';

export const shippingAddressSchema = z.object({
  street: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(12),
  country: z.string().trim().min(2).max(2).toUpperCase().default('IN'),
});

export const createCheckoutOrderSchema = z.object({
  items: z
    .array(z.object({ productId: objectIdSchema, quantity: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
  shippingAddress: shippingAddressSchema,
  email: z.string().trim().email().toLowerCase().optional(),
  phoneVerificationToken: z.string().optional(),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export type CreateCheckoutOrderInput = z.infer<typeof createCheckoutOrderSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
