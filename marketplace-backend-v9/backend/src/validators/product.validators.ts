import { z } from 'zod';
import { UNITS } from '../constants';
import { booleanFromString, objectIdSchema, paginationSchema, stringArray } from './common';

const productBase = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(10).max(5000),
  price: z.coerce.number().positive().max(10_000_000),
  // '' or 'null' (multipart) explicitly clears the discount; absent leaves it untouched.
  discountPrice: z
    .preprocess((v) => (v === '' || v === 'null' || v === null ? null : v), z.coerce.number().positive().max(10_000_000).nullable())
    .optional(),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  unit: z.enum(UNITS),
  category: z.string().trim().min(2).max(60).toLowerCase(),
  isActive: booleanFromString.optional(),
});

const discountRule = (d: { price?: number; discountPrice?: number | null }) =>
  d.discountPrice == null || d.price == null || d.discountPrice < d.price;

export const createProductSchema = productBase.refine(discountRule, {
  message: 'discountPrice must be lower than price',
  path: ['discountPrice'],
});

export const updateProductSchema = productBase
  .partial()
  .extend({ removeImagePublicIds: stringArray.optional() })
  .refine(discountRule, { message: 'discountPrice must be lower than price', path: ['discountPrice'] });

export const productQuerySchema = paginationSchema.extend({
  category: z.string().trim().toLowerCase().max(60).optional(),
  q: z.string().trim().max(100).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: booleanFromString.optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'title_asc']).default('newest'),
});

export const sellerProductQuerySchema = paginationSchema.extend({
  includeInactive: booleanFromString.optional(),
  q: z.string().trim().max(100).optional(),
  lowStockOnly: booleanFromString.optional(),
  sort: z.enum(['newest', 'oldest', 'title_asc', 'stock_asc', 'stock_desc', 'price_asc', 'price_desc']).default('newest'),
});

/** PATCH /seller/products/:id/status — quick activate/deactivate without touching images. */
export const productStatusSchema = z.object({ isActive: z.boolean() });

const stockUpdateBase = z.object({
  mode: z.enum(['set', 'delta']).default('set'),
  value: z.coerce.number().int().min(-1_000_000).max(1_000_000),
});

const stockUpdateRule = (d: { mode: 'set' | 'delta'; value: number }) => d.mode !== 'set' || d.value >= 0;
const stockUpdateRuleMessage = {
  message: 'Stock cannot be set to a negative number',
  path: ['value'] as (string | number)[],
};

/** PATCH /seller/products/:id/stock — set an absolute value or apply a +/- delta (e.g. a restock). */
export const stockUpdateSchema = stockUpdateBase.refine(stockUpdateRule, stockUpdateRuleMessage);

/** PATCH /seller/products/bulk-stock — apply several stock updates in one request. */
export const bulkStockUpdateSchema = z.object({
  updates: z
    .array(stockUpdateBase.extend({ id: objectIdSchema }).refine(stockUpdateRule, stockUpdateRuleMessage))
    .min(1)
    .max(200),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type SellerProductQuery = z.infer<typeof sellerProductQuerySchema>;
export type StockUpdateInput = z.infer<typeof stockUpdateSchema>;
export type BulkStockUpdateInput = z.infer<typeof bulkStockUpdateSchema>;
