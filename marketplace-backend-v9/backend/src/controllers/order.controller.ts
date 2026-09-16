import { Types } from 'mongoose';
import { MESSAGES } from '../constants';
import { Order, type IOrder } from '../models/Order';
import { ApiError } from '../utils/ApiError';
import { sendResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { buyerOrderQuerySchema, type TrackOrderInput } from '../validators/order.validators';

const isObjectId = (id: string) => /^[a-f\d]{24}$/i.test(id);

/**
 * Buyer-facing projection. Strips internal identifiers the buyer has no use for: which seller
 * account owns each line (`items[].seller`) and the buyer's own userId. Payment references are
 * kept because buyers legitimately need them for refund/support conversations.
 */
export const toBuyerOrderView = (order: InstanceType<typeof Order>) => {
  const plain = order.toJSON() as unknown as IOrder & { _id: Types.ObjectId };
  const { userId: _userId, ...buyer } = plain.buyer;
  return {
    ...plain,
    buyer,
    items: plain.items.map(({ seller: _seller, ...item }) => item),
  };
};

/**
 * GET /orders  (verifyJWT + requireRegistered)
 * Only orders whose buyer.userId is the caller. Guest orders are never attached to an account —
 * even if the same phone later registers — so guests use /orders/track instead.
 */
export const listMyOrders = asyncHandler(async (req, res) => {
  const { page, limit, status } = buyerOrderQuerySchema.parse(req.query);
  const filter: Record<string, unknown> = { 'buyer.userId': new Types.ObjectId(req.user!.id) };
  if (status) filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);

  sendResponse(res, {
    items: orders.map(toBuyerOrderView),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
});

/**
 * GET /orders/:id  (verifyJWT + requireRegistered)
 * Accepts a Mongo _id or ORD-… id. Ownership is part of the query, so a mismatch is
 * indistinguishable from a missing order (404, never 403) — same convention as the seller side.
 */
export const getMyOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const owner = { 'buyer.userId': new Types.ObjectId(req.user!.id) };
  const order = isObjectId(id)
    ? await Order.findOne({ _id: new Types.ObjectId(id), ...owner })
    : await Order.findOne({ orderId: id, ...owner });

  if (!order) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);
  sendResponse(res, { order: toBuyerOrderView(order) });
});

/**
 * POST /orders/track  (requirePhoneVerification → req.phone)
 * Guest tracking. Requires both the order id *and* a freshly verified phone matching the one the
 * order was placed with. Knowing an order id alone is not enough — ids appear in WhatsApp
 * messages, receipts, and screenshots, and must not unlock a shipping address on their own.
 */
export const trackOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.body as TrackOrderInput;
  const order = await Order.findOne({ orderId, 'buyer.phone': req.phone! });
  if (!order) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);
  sendResponse(res, { order: toBuyerOrderView(order) });
});
