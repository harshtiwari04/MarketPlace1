import { Types } from 'mongoose';
import { Order } from '../models/Order';

export interface ProductSalesStat {
  sold: number;
  revenue: number;
}

/**
 * Sold quantity + revenue per product, scoped to one seller's own line items.
 * Only counts items from paid orders that haven't since been cancelled (a refunded/cancelled
 * line item was never really "sold" from the seller's point of view).
 */
export const getSalesStatsForProducts = async (
  productIds: string[],
  sellerId: string,
): Promise<Map<string, ProductSalesStat>> => {
  if (productIds.length === 0) return new Map();

  const objectIds = productIds.map((id) => new Types.ObjectId(id));
  const sellerObjectId = new Types.ObjectId(sellerId);

  const rows = await Order.aggregate([
    {
      $match: {
        'payment.status': 'paid',
        'items.seller': sellerObjectId,
        'items.product': { $in: objectIds },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        'items.seller': sellerObjectId,
        'items.product': { $in: objectIds },
        'items.status': { $ne: 'cancelled' },
      },
    },
    {
      $group: {
        _id: '$items.product',
        sold: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
      },
    },
  ]);

  return new Map(rows.map((r) => [r._id.toString(), { sold: r.sold as number, revenue: r.revenue as number }]));
};

/** Seller-wide totals across every product, not just one page of results. */
export const getSellerSalesOverview = async (
  sellerId: string,
): Promise<{ totalSold: number; totalRevenue: number }> => {
  const sellerObjectId = new Types.ObjectId(sellerId);

  const [row] = await Order.aggregate([
    { $match: { 'payment.status': 'paid', 'items.seller': sellerObjectId } },
    { $unwind: '$items' },
    { $match: { 'items.seller': sellerObjectId, 'items.status': { $ne: 'cancelled' } } },
    {
      $group: {
        _id: null,
        totalSold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
      },
    },
  ]);

  return { totalSold: row?.totalSold ?? 0, totalRevenue: row?.totalRevenue ?? 0 };
};
