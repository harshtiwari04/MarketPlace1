import { Types } from 'mongoose';
import { Product } from '../models/Product';
import type { IOrderItem } from '../models/Order';
import { ApiError } from '../utils/ApiError';

export interface CartItemInput {
  productId: string;
  quantity: number;
}

export interface PricedCart {
  lineItems: IOrderItem[];
  totalAmount: number;
  amountInPaisa: number;
}

/** Merge duplicate product lines so quantities are validated as a whole. */
const consolidate = (items: CartItemInput[]): CartItemInput[] => {
  const map = new Map<string, number>();
  for (const { productId, quantity } of items) map.set(productId, (map.get(productId) ?? 0) + quantity);
  return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
};

/**
 * Re-prices the cart from the database. Client-supplied prices/totals are never trusted.
 * Stock is checked here for early feedback; the authoritative deduction happens at payment time.
 */
export const priceCart = async (rawItems: CartItemInput[]): Promise<PricedCart> => {
  const items = consolidate(rawItems);
  const ids = items.map((i) => new Types.ObjectId(i.productId));
  const products = await Product.find({ _id: { $in: ids }, isActive: true }).lean();
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const lineItems: IOrderItem[] = items.map(({ productId, quantity }) => {
    const p = byId.get(productId);
    if (!p) throw ApiError.badRequest('A product in your cart is no longer available', { productId }, 'PRODUCT_UNAVAILABLE');
    if (p.stock < quantity) {
      throw ApiError.badRequest(`Only ${p.stock} ${p.unit} of "${p.title}" left in stock`, { productId, available: p.stock }, 'INSUFFICIENT_STOCK');
    }
    const unitPrice = p.discountPrice != null && p.discountPrice < p.price ? p.discountPrice : p.price;
    return {
      product: p._id,
      seller: p.seller,
      category: p.category,
      title: p.title,
      price: unitPrice,
      quantity,
      unit: p.unit,
      status: 'placed',
      statusHistory: [{ status: 'placed', at: new Date() }],
    };
  });

  // Work in integer paisa to avoid floating-point drift.
  const amountInPaisa = lineItems.reduce((sum, i) => sum + Math.round(i.price * 100) * i.quantity, 0);
  if (amountInPaisa < 100) throw ApiError.badRequest('Order total must be at least ₹1.00');

  return { lineItems, totalAmount: amountInPaisa / 100, amountInPaisa };
};
