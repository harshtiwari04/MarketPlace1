import { Types, type PipelineStage } from 'mongoose';
import { ORDER_STATUSES, type OrderStatus } from '../constants';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { RefreshToken } from '../models/RefreshToken';
import { User } from '../models/User';

/**
 * Admin analytics. Every query is a single aggregation (or a small Promise.all of counts) so the
 * dashboard stays one round-trip per widget under load, and every revenue figure uses the same
 * definition:
 *
 *   recognised revenue = Σ item.price × item.quantity
 *                        over orders with payment.status = 'paid'
 *                        excluding line items whose status = 'cancelled'
 *
 * A paid order whose items were all cancelled (oversell → automatic refund) therefore contributes
 * ₹0, which matches what the business actually kept. Time ranges filter on order.createdAt.
 */

export interface DateRange {
  from?: Date;
  to?: Date;
}

const rangeMatch = ({ from, to }: DateRange, field = 'createdAt'): Record<string, unknown> => {
  if (!from && !to) return {};
  const cond: Record<string, Date> = {};
  if (from) cond.$gte = from;
  if (to) cond.$lte = to;
  return { [field]: cond };
};

/** Paid, non-cancelled line items — the shared head of every revenue pipeline. */
const paidLineItems = (range: DateRange): PipelineStage[] => [
  { $match: { 'payment.status': 'paid', ...rangeMatch(range) } },
  { $unwind: '$items' },
  { $match: { 'items.status': { $ne: 'cancelled' } } },
  { $addFields: { lineRevenue: { $multiply: ['$items.price', '$items.quantity'] } } },
];

/* ───────────────────────── Overview ───────────────────────── */

export interface OverviewMetrics {
  users: {
    total: number;
    byRole: Record<string, number>;
    verified: number;
    suspended: number;
    newInRange: number;
    /** Distinct users holding at least one live (unrevoked, unexpired) refresh token — i.e. currently signed in on some device. */
    currentlyLoggedIn: number;
    /** Signed in within the last 24h / 7d (from User.lastLoginAt). */
    activeLast24h: number;
    activeLast7d: number;
  };
  orders: {
    total: number;
    inRange: number;
    paidInRange: number;
    byStatus: Record<OrderStatus, number>;
    byPaymentStatus: Record<string, number>;
    averageOrderValue: number;
  };
  revenue: {
    /** Recognised revenue in range (see definition above). */
    recognised: number;
    /** Gross paid order totals in range, including later-cancelled/refunded lines. */
    grossPaid: number;
    /** Value of cancelled line items on paid orders in range (≈ refunds owed/issued). */
    cancelledOnPaid: number;
    unitsSold: number;
  };
  products: {
    total: number;
    active: number;
    outOfStock: number;
    lowStock: number;
    categories: number;
  };
  sellers: {
    total: number;
    withSalesInRange: number;
  };
}

export const getOverview = async (range: DateRange): Promise<OverviewMetrics> => {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [userFacets, loggedIn, orderFacets, revenueRows, productFacets] = await Promise.all([
    User.aggregate<{
      total: { count: number }[];
      byRole: { _id: string; count: number }[];
      verified: { count: number }[];
      suspended: { count: number }[];
      newInRange: { count: number }[];
      active24h: { count: number }[];
      active7d: { count: number }[];
    }>([
      {
        $facet: {
          total: [{ $count: 'count' }],
          byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }],
          verified: [{ $match: { isEmailVerified: true } }, { $count: 'count' }],
          suspended: [{ $match: { isSuspended: true } }, { $count: 'count' }],
          newInRange: [{ $match: rangeMatch(range) }, { $count: 'count' }],
          active24h: [{ $match: { lastLoginAt: { $gte: dayAgo } } }, { $count: 'count' }],
          active7d: [{ $match: { lastLoginAt: { $gte: weekAgo } } }, { $count: 'count' }],
        },
      },
    ]),
    RefreshToken.aggregate<{ _id: null; users: number }>([
      { $match: { revokedAt: { $exists: false }, expiresAt: { $gt: now } } },
      { $group: { _id: '$user' } },
      { $count: 'users' },
    ]),
    Order.aggregate<{
      total: { count: number }[];
      inRange: { count: number }[];
      paidInRange: { count: number; gross: number }[];
      byStatus: { _id: OrderStatus; count: number }[];
      byPayment: { _id: string; count: number }[];
    }>([
      {
        $facet: {
          total: [{ $count: 'count' }],
          inRange: [{ $match: rangeMatch(range) }, { $count: 'count' }],
          paidInRange: [
            { $match: { 'payment.status': 'paid', ...rangeMatch(range) } },
            { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$totalAmount' } } },
          ],
          byStatus: [{ $match: rangeMatch(range) }, { $group: { _id: '$status', count: { $sum: 1 } } }],
          byPayment: [{ $match: rangeMatch(range) }, { $group: { _id: '$payment.status', count: { $sum: 1 } } }],
        },
      },
    ]),
    Order.aggregate<{ _id: boolean; revenue: number; units: number; sellers: Types.ObjectId[] }>([
      { $match: { 'payment.status': 'paid', ...rangeMatch(range) } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { $eq: ['$items.status', 'cancelled'] },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          units: { $sum: '$items.quantity' },
          sellers: { $addToSet: '$items.seller' },
        },
      },
    ]),
    Product.aggregate<{
      total: { count: number }[];
      active: { count: number }[];
      outOfStock: { count: number }[];
      lowStock: { count: number }[];
      categories: { count: number }[];
    }>([
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { isActive: true } }, { $count: 'count' }],
          outOfStock: [{ $match: { stock: 0 } }, { $count: 'count' }],
          lowStock: [{ $match: { stock: { $gt: 0, $lte: 5 } } }, { $count: 'count' }],
          categories: [{ $group: { _id: '$category' } }, { $count: 'count' }],
        },
      },
    ]),
  ]);

  const uf = userFacets[0];
  const of = orderFacets[0];
  const pf = productFacets[0];
  const first = (arr: { count: number }[] | undefined) => arr?.[0]?.count ?? 0;

  const recognisedRow = revenueRows.find((r) => r._id === false);
  const cancelledRow = revenueRows.find((r) => r._id === true);
  const paidInRange = of?.paidInRange?.[0];
  const sellersWithSales = new Set([...(recognisedRow?.sellers ?? [])].map(String)).size;

  const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  for (const r of of?.byStatus ?? []) byStatus[r._id] = r.count;

  const totalSellers = (uf?.byRole ?? []).find((r) => r._id === 'seller')?.count ?? 0;

  return {
    users: {
      total: first(uf?.total),
      byRole: Object.fromEntries((uf?.byRole ?? []).map((r) => [r._id, r.count])),
      verified: first(uf?.verified),
      suspended: first(uf?.suspended),
      newInRange: first(uf?.newInRange),
      currentlyLoggedIn: loggedIn[0]?.users ?? 0,
      activeLast24h: first(uf?.active24h),
      activeLast7d: first(uf?.active7d),
    },
    orders: {
      total: first(of?.total),
      inRange: first(of?.inRange),
      paidInRange: paidInRange?.count ?? 0,
      byStatus,
      byPaymentStatus: Object.fromEntries((of?.byPayment ?? []).map((r) => [r._id, r.count])),
      averageOrderValue: paidInRange?.count ? round2((recognisedRow?.revenue ?? 0) / paidInRange.count) : 0,
    },
    revenue: {
      recognised: round2(recognisedRow?.revenue ?? 0),
      grossPaid: round2(paidInRange?.gross ?? 0),
      cancelledOnPaid: round2(cancelledRow?.revenue ?? 0),
      unitsSold: recognisedRow?.units ?? 0,
    },
    products: {
      total: first(pf?.total),
      active: first(pf?.active),
      outOfStock: first(pf?.outOfStock),
      lowStock: first(pf?.lowStock),
      categories: first(pf?.categories),
    },
    sellers: { total: totalSellers, withSalesInRange: sellersWithSales },
  };
};

/* ───────────────────────── Revenue by category ───────────────────────── */

export interface CategoryRevenueRow {
  category: string;
  revenue: number;
  units: number;
  orders: number;
  /** Distinct products that sold in this category. */
  products: number;
  share: number; // 0..1 of total recognised revenue
}

/**
 * Total recognised revenue grouped by product category.
 * `items.category` is denormalised at checkout; orders created before that field existed fall back
 * to a $lookup on the live product (and to "uncategorized" if the product was since deleted).
 */
export const getRevenueByCategory = async (range: DateRange): Promise<{ rows: CategoryRevenueRow[]; total: number }> => {
  const rows = await Order.aggregate<Omit<CategoryRevenueRow, 'share'>>([
    ...paidLineItems(range),
    {
      $lookup: {
        from: Product.collection.name,
        let: { pid: '$items.product', hasCategory: { $gt: ['$items.category', null] } },
        pipeline: [
          // Only hit the products collection for legacy items with no denormalised category.
          { $match: { $expr: { $and: [{ $not: ['$$hasCategory'] }, { $eq: ['$_id', '$$pid'] }] } } },
          { $project: { category: 1 } },
        ],
        as: 'productDoc',
      },
    },
    {
      $addFields: {
        category: {
          $ifNull: ['$items.category', { $arrayElemAt: ['$productDoc.category', 0] }, 'uncategorized'],
        },
      },
    },
    {
      $group: {
        _id: '$category',
        revenue: { $sum: '$lineRevenue' },
        units: { $sum: '$items.quantity' },
        orderIds: { $addToSet: '$_id' },
        productIds: { $addToSet: '$items.product' },
      },
    },
    {
      $project: {
        _id: 0,
        category: '$_id',
        revenue: { $round: ['$revenue', 2] },
        units: 1,
        orders: { $size: '$orderIds' },
        products: { $size: '$productIds' },
      },
    },
    { $sort: { revenue: -1, category: 1 } },
  ]).option({ maxTimeMS: 10_000 });

  const total = round2(rows.reduce((s, r) => s + r.revenue, 0));
  return { total, rows: rows.map((r) => ({ ...r, share: total ? round4(r.revenue / total) : 0 })) };
};

/* ───────────────────────── Revenue over time ───────────────────────── */

export type Granularity = 'day' | 'week' | 'month';

export interface RevenuePoint {
  period: string; // ISO date (day/week start) or YYYY-MM
  revenue: number;
  orders: number;
  units: number;
}

export const getRevenueTimeseries = async (range: DateRange, granularity: Granularity): Promise<RevenuePoint[]> => {
  const format = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const truncUnit = granularity === 'week' ? 'week' : granularity === 'month' ? 'month' : 'day';

  return Order.aggregate<RevenuePoint>([
    ...paidLineItems(range),
    { $addFields: { bucket: { $dateTrunc: { date: '$createdAt', unit: truncUnit, timezone: 'Asia/Kolkata', startOfWeek: 'monday' } } } },
    {
      $group: {
        _id: '$bucket',
        revenue: { $sum: '$lineRevenue' },
        units: { $sum: '$items.quantity' },
        orderIds: { $addToSet: '$_id' },
      },
    },
    {
      $project: {
        _id: 0,
        period: { $dateToString: { date: '$_id', format, timezone: 'Asia/Kolkata' } },
        revenue: { $round: ['$revenue', 2] },
        units: 1,
        orders: { $size: '$orderIds' },
      },
    },
    { $sort: { period: 1 } },
  ]).option({ maxTimeMS: 10_000 });
};

/* ───────────────────────── Leaderboards ───────────────────────── */

export interface TopProductRow {
  productId: string;
  title: string;
  category: string;
  sellerId: string;
  revenue: number;
  units: number;
}

export const getTopProducts = async (range: DateRange, limit: number): Promise<TopProductRow[]> =>
  Order.aggregate<TopProductRow>([
    ...paidLineItems(range),
    {
      $group: {
        _id: '$items.product',
        title: { $last: '$items.title' },
        category: { $last: { $ifNull: ['$items.category', 'uncategorized'] } },
        sellerId: { $last: '$items.seller' },
        revenue: { $sum: '$lineRevenue' },
        units: { $sum: '$items.quantity' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $project: { _id: 0, productId: { $toString: '$_id' }, title: 1, category: 1, sellerId: { $toString: '$sellerId' }, revenue: { $round: ['$revenue', 2] }, units: 1 } },
  ]).option({ maxTimeMS: 10_000 });

export interface TopSellerRow {
  sellerId: string;
  storeName?: string;
  name?: string;
  revenue: number;
  units: number;
  orders: number;
}

export const getTopSellers = async (range: DateRange, limit: number): Promise<TopSellerRow[]> =>
  Order.aggregate<TopSellerRow>([
    ...paidLineItems(range),
    { $group: { _id: '$items.seller', revenue: { $sum: '$lineRevenue' }, units: { $sum: '$items.quantity' }, orderIds: { $addToSet: '$_id' } } },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'seller', pipeline: [{ $project: { name: 1, storeName: 1 } }] } },
    {
      $project: {
        _id: 0,
        sellerId: { $toString: '$_id' },
        storeName: { $arrayElemAt: ['$seller.storeName', 0] },
        name: { $arrayElemAt: ['$seller.name', 0] },
        revenue: { $round: ['$revenue', 2] },
        units: 1,
        orders: { $size: '$orderIds' },
      },
    },
  ]).option({ maxTimeMS: 10_000 });

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
