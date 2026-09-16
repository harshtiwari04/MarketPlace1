import { Types } from 'mongoose';
import { ERROR_CODES, MESSAGES, ROLES } from '../constants';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { RefreshToken } from '../models/RefreshToken';
import { User } from '../models/User';
import {
  getOverview,
  getRevenueByCategory,
  getRevenueTimeseries,
  getTopProducts,
  getTopSellers,
  type DateRange,
} from '../services/analytics.service';
import { applyItemDelivery, applyItemTransition, normalizeStatus } from '../services/order-status.service';
import { removeProductWithAssets } from '../services/product.service';
import { sendOrderStatusUpdate } from '../services/whatsapp.service';
import { ApiError } from '../utils/ApiError';
import { sendResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import { escapeRegex } from '../utils/slugify';
import {
  adminOrderQuerySchema,
  adminProductQuerySchema,
  adminUserQuerySchema,
  dateRangeSchema,
  leaderboardQuerySchema,
  timeseriesQuerySchema,
  type AdminUserUpdateInput,
} from '../validators/admin.validators';
import type { deliveryUpdateSchema, updateOrderStatusSchema } from '../validators/seller.validators';
import type { z } from 'zod';

const DEFAULT_RANGE_DAYS = 30;

/** Unbounded ranges default to the last 30 days so the dashboard never scans the full order table by accident. */
const resolveRange = (q: { from?: Date; to?: Date }): DateRange => {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  return { from, to };
};

const paginated = <T>(items: T[], page: number, limit: number, total: number) => ({
  items,
  pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
});

/* ───────────────────────── Analytics ───────────────────────── */

export const analyticsOverview = asyncHandler(async (req, res) => {
  const range = resolveRange(dateRangeSchema.parse(req.query));
  const metrics = await getOverview(range);
  sendResponse(res, { range, ...metrics });
});

export const analyticsRevenueByCategory = asyncHandler(async (req, res) => {
  const range = resolveRange(dateRangeSchema.parse(req.query));
  const { rows, total } = await getRevenueByCategory(range);
  sendResponse(res, { range, total, categories: rows });
});

export const analyticsRevenueTimeseries = asyncHandler(async (req, res) => {
  const { granularity, ...q } = timeseriesQuerySchema.parse(req.query);
  const range = resolveRange(q);
  const points = await getRevenueTimeseries(range, granularity);
  sendResponse(res, { range, granularity, points });
});

export const analyticsTopProducts = asyncHandler(async (req, res) => {
  const { limit, ...q } = leaderboardQuerySchema.parse(req.query);
  const range = resolveRange(q);
  sendResponse(res, { range, items: await getTopProducts(range, limit) });
});

export const analyticsTopSellers = asyncHandler(async (req, res) => {
  const { limit, ...q } = leaderboardQuerySchema.parse(req.query);
  const range = resolveRange(q);
  sendResponse(res, { range, items: await getTopSellers(range, limit) });
});

/* ───────────────────────── Users ───────────────────────── */

const adminUserView = (u: InstanceType<typeof User>) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  storeName: u.storeName,
  isEmailVerified: u.isEmailVerified,
  isPhoneVerified: u.isPhoneVerified,
  isSuspended: u.isSuspended,
  googleLinked: !!u.googleId,
  lastLoginAt: u.lastLoginAt,
  loginCount: u.loginCount,
  createdAt: u.createdAt,
});

const USER_SORT: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  last_login: { lastLoginAt: -1, createdAt: -1 },
  name: { name: 1 },
};

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, q, role, suspended, verified, sort } = adminUserQuerySchema.parse(req.query);

  const filter: Record<string, unknown> = {};
  if (role) filter.role = role;
  if (suspended !== undefined) filter.isSuspended = suspended;
  if (verified !== undefined) filter.isEmailVerified = verified;
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ email: rx }, { name: rx }, { phone: rx }, { storeName: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort(USER_SORT[sort]).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  sendResponse(res, paginated(users.map(adminUserView), page, limit, total));
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const [orderStats, activeSessions] = await Promise.all([
    Order.aggregate<{ orders: number; spent: number }>([
      { $match: { 'buyer.userId': user._id, 'payment.status': 'paid' } },
      { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$totalAmount' } } },
    ]),
    RefreshToken.countDocuments({ user: user._id, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }),
  ]);

  sendResponse(res, {
    user: adminUserView(user),
    stats: { paidOrders: orderStats[0]?.orders ?? 0, totalSpent: orderStats[0]?.spent ?? 0, activeSessions },
  });
});

/**
 * PATCH /admin/users/:id — role change, suspend/unsuspend. Suspending revokes every session so
 * the effect is immediate. Guards: an admin cannot demote or suspend *themselves* (prevents a
 * lock-out with zero admins left).
 */
export const updateUser = asyncHandler(async (req, res) => {
  const patch = req.body as AdminUserUpdateInput;
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const isSelf = user.id === req.user!.id;
  if (isSelf && ((patch.role && patch.role !== ROLES.ADMIN) || patch.isSuspended)) {
    throw ApiError.badRequest('You cannot demote or suspend your own admin account');
  }
  if (patch.role === ROLES.SELLER && !user.storeName && !patch.storeName) {
    throw ApiError.badRequest('A seller needs a store name — include `storeName`', undefined, ERROR_CODES.VALIDATION_FAILED);
  }

  if (patch.role) user.role = patch.role;
  if (patch.storeName) user.storeName = patch.storeName;
  if (patch.isSuspended !== undefined) user.isSuspended = patch.isSuspended;
  await user.save();

  if (patch.isSuspended || patch.role) {
    // Role is embedded in the access token — force re-issue; suspension must bite immediately.
    await RefreshToken.updateMany({ user: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  }

  logger.info('Admin updated user', { adminId: req.user!.id, userId: user.id, patch });
  sendResponse(res, { user: adminUserView(user) }, 'User updated');
});

/* ───────────────────────── Orders ───────────────────────── */

const findOrderByAnyId = (id: string) =>
  /^[a-f\d]{24}$/i.test(id) ? Order.findById(new Types.ObjectId(id)) : Order.findOne({ orderId: id });

export const listOrders = asyncHandler(async (req, res) => {
  const { page, limit, status, paymentStatus, q, sellerId, from, to } = adminOrderQuerySchema.parse(req.query);

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (paymentStatus) filter['payment.status'] = paymentStatus;
  if (sellerId) filter['items.seller'] = new Types.ObjectId(sellerId);
  if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ orderId: rx }, { 'buyer.phone': rx }, { 'buyer.email': rx }, { 'payment.razorpayPaymentId': rx }, { 'items.delivery.trackingNumber': rx }];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  sendResponse(res, paginated(orders, page, limit, total));
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await findOrderByAnyId(req.params.id);
  if (!order) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);

  // Enrich seller ids with store names so the admin sees who is fulfilling each line.
  const sellerIds = [...new Set(order.items.map((i) => i.seller.toString()))];
  const sellers = await User.find({ _id: { $in: sellerIds } }).select('name storeName email').lean();
  const sellerMap = Object.fromEntries(sellers.map((s) => [s._id.toString(), { id: s._id.toString(), name: s.name, storeName: s.storeName, email: s.email }]));

  const plain = order.toJSON() as unknown as Record<string, unknown> & { items: { seller: Types.ObjectId }[] };
  sendResponse(res, {
    order: { ...plain, items: plain.items.map((i) => ({ ...i, sellerInfo: sellerMap[i.seller.toString()] ?? null })) },
  });
});

/** Admin can move any line item — same state machine as sellers, no ownership constraint. */
export const adminUpdateItemStatus = asyncHandler(async (req, res) => {
  const status = normalizeStatus((req.body as z.infer<typeof updateOrderStatusSchema>).status);

  const order = await findOrderByAnyId(req.params.id);
  if (!order) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);
  const item = order.items.find((i) => i.product.toString() === req.params.productId);
  if (!item) throw ApiError.notFound('Line item not found on this order');

  applyItemTransition(order, item, status);
  await order.save();

  sendOrderStatusUpdate(order).catch((err) =>
    logger.warn('Status notification not delivered', { orderId: order.orderId, err: String(err) }),
  );
  logger.info('Admin changed item status', { adminId: req.user!.id, orderId: order.orderId, productId: req.params.productId, status });
  sendResponse(res, { order }, `Item marked as ${status}`);
});

export const adminUpdateItemDelivery = asyncHandler(async (req, res) => {
  const patch = req.body as z.infer<typeof deliveryUpdateSchema>;

  const order = await findOrderByAnyId(req.params.id);
  if (!order) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);
  const item = order.items.find((i) => i.product.toString() === req.params.productId);
  if (!item) throw ApiError.notFound('Line item not found on this order');

  applyItemDelivery(item, patch);
  order.markModified('items');
  await order.save();

  sendResponse(res, { order }, 'Tracking details saved');
});

/* ───────────────────────── Products ───────────────────────── */

const PRODUCT_SORT: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title_asc: { title: 1 },
  price_desc: { price: -1 },
  stock_asc: { stock: 1 },
};

export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, q, category, sellerId, includeInactive, sort } = adminProductQuerySchema.parse(req.query);

  const filter: Record<string, unknown> = {};
  if (!includeInactive) filter.isActive = true;
  if (category) filter.category = category;
  if (sellerId) filter.seller = new Types.ObjectId(sellerId);
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };

  const [products, total] = await Promise.all([
    Product.find(filter).sort(PRODUCT_SORT[sort]).skip((page - 1) * limit).limit(limit).populate('seller', 'name storeName email'),
    Product.countDocuments(filter),
  ]);

  sendResponse(res, paginated(products.map((p) => p.toJSON()), page, limit, total));
});

/** Reversible moderation: hide a listing from the storefront without touching the seller's data. */
export const adminSetProductStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body as { isActive: boolean };
  const product = await Product.findByIdAndUpdate(req.params.id, { $set: { isActive } }, { new: true });
  if (!product) throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);
  logger.info('Admin changed product visibility', { adminId: req.user!.id, productId: product.id, isActive });
  sendResponse(res, { product }, isActive ? 'Product is now visible' : 'Product hidden from the storefront');
});

/** Permanent removal (policy violation etc.). Releases Cloudinary assets like the seller path does. */
export const adminDeleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);
  await removeProductWithAssets(product);
  logger.warn('Admin deleted product', { adminId: req.user!.id, productId: product.id, seller: String(product.seller) });
  sendResponse(res, { id: product._id }, 'Product deleted');
});
