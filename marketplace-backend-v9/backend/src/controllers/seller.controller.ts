import { Types } from 'mongoose';
import { HTTP, LOW_STOCK_THRESHOLD, MAX_PRODUCT_IMAGES, MESSAGES } from '../constants';
import { Order, type IOrder } from '../models/Order';
import { Product, type IProductImage } from '../models/Product';
import { deleteCloudinaryAssets } from '../services/cloudinary.service';
import { applyItemDelivery, applyItemTransition, normalizeStatus } from '../services/order-status.service';
import { filterUnreferencedPublicIds, removeProductWithAssets } from '../services/product.service';
import { getSalesStatsForProducts, getSellerSalesOverview } from '../services/sales.service';
import { sendOrderStatusUpdate } from '../services/whatsapp.service';
import { ApiError } from '../utils/ApiError';
import { sendResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import { escapeRegex } from '../utils/slugify';
import type {
  BulkStockUpdateInput,
  CreateProductInput,
  StockUpdateInput,
  UpdateProductInput,
} from '../validators/product.validators';
import { sellerProductQuerySchema } from '../validators/product.validators';
import { sellerOrderQuerySchema, type deliveryUpdateSchema, type updateOrderStatusSchema } from '../validators/seller.validators';
import type { z } from 'zod';

const SELLER_SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title_asc: { title: 1 },
  stock_asc: { stock: 1 },
  stock_desc: { stock: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
};

const withStockStatus = (product: { stock: number }) =>
  product.stock === 0 ? 'out_of_stock' : product.stock <= LOW_STOCK_THRESHOLD ? 'low_stock' : 'in_stock';

const csvCell = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** multer-storage-cloudinary sets path → secure_url and filename → public_id. */
const filesToImages = (files: Express.Multer.File[] | undefined): IProductImage[] =>
  (files ?? []).map((f) => ({ url: f.path, publicId: f.filename }));

const uploadedFiles = (req: { files?: unknown }): Express.Multer.File[] =>
  Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];

/* ───────────────────────── Products ───────────────────────── */

export const createProduct = asyncHandler(async (req, res) => {
  const body = req.body as CreateProductInput;
  const images = filesToImages(uploadedFiles(req));

  if (images.length === 0) throw ApiError.badRequest('At least one product image is required');

  try {
    const product = await Product.create({
      ...body,
      seller: req.user!.id,
      discountPrice: body.discountPrice ?? undefined,
      images,
    });
    sendResponse(res, { product }, 'Product created', HTTP.CREATED);
  } catch (err) {
    // Uploads already landed in Cloudinary before validation ran — don't leave orphans.
    await deleteCloudinaryAssets(images.map((i) => i.publicId));
    throw err;
  }
});

export const listSellerProducts = asyncHandler(async (req, res) => {
  const { page, limit, includeInactive, q, lowStockOnly, sort } = sellerProductQuerySchema.parse(req.query);
  const sellerId = req.user!.id;

  const filter: Record<string, unknown> = { seller: sellerId };
  if (!includeInactive) filter.isActive = true;
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
  if (lowStockOnly) filter.stock = { $lte: LOW_STOCK_THRESHOLD };

  const [items, total, lowStockCount] = await Promise.all([
    Product.find(filter).sort(SELLER_SORT_MAP[sort]).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter),
    Product.countDocuments({ seller: sellerId, isActive: true, stock: { $lte: LOW_STOCK_THRESHOLD } }),
  ]);

  const stats = await getSalesStatsForProducts(items.map((p) => p.id), sellerId);

  sendResponse(res, {
    items: items.map((p) => {
      const s = stats.get(p.id);
      return { ...p.toJSON(), stockStatus: withStockStatus(p), sold: s?.sold ?? 0, revenue: s?.revenue ?? 0 };
    }),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    lowStockCount,
  });
});

export const getSellerProductDetail = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, seller: req.user!.id });
  if (!product) throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);

  const stats = (await getSalesStatsForProducts([product.id], req.user!.id)).get(product.id);
  sendResponse(res, {
    product: { ...product.toJSON(), stockStatus: withStockStatus(product), sold: stats?.sold ?? 0, revenue: stats?.revenue ?? 0 },
  });
});

/**
 * GET /seller/products/summary — small stat block for the seller dashboard: inventory health
 * (active/low-stock/out-of-stock counts) plus lifetime sold units and revenue.
 */
export const getProductsSummary = asyncHandler(async (req, res) => {
  const sellerId = req.user!.id;

  const [totals, salesOverview] = await Promise.all([
    Product.aggregate([
      { $match: { seller: new Types.ObjectId(sellerId) } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          activeProducts: { $sum: { $cond: ['$isActive', 1, 0] } },
          outOfStockCount: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } },
          lowStockCount: {
            $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', LOW_STOCK_THRESHOLD] }] }, 1, 0] },
          },
        },
      },
    ]),
    getSellerSalesOverview(sellerId),
  ]);

  const t = totals[0] ?? { totalProducts: 0, activeProducts: 0, outOfStockCount: 0, lowStockCount: 0 };
  sendResponse(res, {
    totalProducts: t.totalProducts,
    activeProducts: t.activeProducts,
    outOfStockCount: t.outOfStockCount,
    lowStockCount: t.lowStockCount,
    totalSold: salesOverview.totalSold,
    totalRevenue: salesOverview.totalRevenue,
  });
});

/** GET /seller/products/export — CSV of the seller's full catalogue, including sales-to-date. */
export const exportProductsCsv = asyncHandler(async (req, res) => {
  const sellerId = req.user!.id;
  const products = await Product.find({ seller: sellerId }).sort({ createdAt: -1 });
  const stats = await getSalesStatsForProducts(
    products.map((p) => p.id),
    sellerId,
  );

  const header = [
    'Title', 'Category', 'Unit', 'Price', 'Discount Price', 'Stock', 'Status', 'Units Sold', 'Revenue', 'Created At',
  ];
  const rows = products.map((p) => {
    const s = stats.get(p.id);
    return [
      csvCell(p.title),
      csvCell(p.category),
      csvCell(p.unit),
      csvCell(p.price),
      csvCell(p.discountPrice ?? ''),
      csvCell(p.stock),
      csvCell(p.isActive ? 'active' : 'inactive'),
      csvCell(s?.sold ?? 0),
      csvCell(s?.revenue ?? 0),
      csvCell(p.createdAt.toISOString()),
    ].join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="products-${Date.now()}.csv"`);
  res.send(csv);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const { removeImagePublicIds = [], ...fields } = req.body as UpdateProductInput;
  const newImages = filesToImages(uploadedFiles(req));

  const product = await Product.findOne({ _id: req.params.id, seller: req.user!.id });
  if (!product) {
    await deleteCloudinaryAssets(newImages.map((i) => i.publicId));
    throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);
  }

  const removeSet = new Set(removeImagePublicIds);
  const keptImages = product.images.filter((img) => !removeSet.has(img.publicId));
  const removedIds = product.images.filter((img) => removeSet.has(img.publicId)).map((i) => i.publicId);
  const finalImages = [...keptImages, ...newImages];

  if (finalImages.length === 0) {
    await deleteCloudinaryAssets(newImages.map((i) => i.publicId));
    throw ApiError.badRequest('A product must keep at least one image');
  }
  if (finalImages.length > MAX_PRODUCT_IMAGES) {
    await deleteCloudinaryAssets(newImages.map((i) => i.publicId));
    throw ApiError.badRequest(`A product can have at most ${MAX_PRODUCT_IMAGES} images`);
  }

  // null (from '' in the form) means "remove the discount"; setting undefined issues an $unset.
  if (fields.discountPrice === null) {
    product.set('discountPrice', undefined);
    delete fields.discountPrice;
  }

  product.set({ ...fields, images: finalImages });

  try {
    await product.save(); // pre('validate') regenerates slug if title changed
  } catch (err) {
    await deleteCloudinaryAssets(newImages.map((i) => i.publicId));
    throw err;
  }

  // Only delete old assets after the DB write succeeded, and only if no other listing (e.g. a
  // duplicate) still points at the same Cloudinary asset.
  await deleteCloudinaryAssets(await filterUnreferencedPublicIds(removedIds, product.id));

  sendResponse(res, { product }, 'Product updated');
});

/**
 * Permanent delete: removes the listing and releases its Cloudinary storage for good.
 * Order history keeps the denormalized title/price, so past orders are unaffected.
 * For a reversible "hide from the storefront" action, use PATCH /products/:id/status instead.
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, seller: req.user!.id });
  if (!product) throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);

  await removeProductWithAssets(product);
  sendResponse(res, { id: product._id }, 'Product deleted');
});

/**
 * PATCH /seller/products/:id/status — reversible show/hide, independent of the destructive
 * delete above. Images and stock are untouched, so the seller can flip it back on any time.
 */
export const updateProductStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body as { isActive: boolean };

  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, seller: req.user!.id },
    { $set: { isActive } },
    { new: true },
  );
  if (!product) throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);

  sendResponse(res, { product }, isActive ? 'Product is now visible to buyers' : 'Product hidden from buyers');
});

/** PATCH /seller/products/:id/stock — quick restock or correction without a full edit form. */
export const updateProductStock = asyncHandler(async (req, res) => {
  const { mode, value } = req.body as StockUpdateInput;

  const product = await Product.findOne({ _id: req.params.id, seller: req.user!.id });
  if (!product) throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);

  const nextStock = mode === 'set' ? value : product.stock + value;
  if (nextStock < 0) {
    throw ApiError.badRequest(`That would take stock below zero (currently ${product.stock}).`);
  }

  product.stock = nextStock;
  await product.save();

  sendResponse(res, { product: { ...product.toJSON(), stockStatus: withStockStatus(product) } }, 'Stock updated');
});

/** PATCH /seller/products/bulk-stock — apply several stock changes (e.g. a restock batch) at once. */
export const bulkUpdateStock = asyncHandler(async (req, res) => {
  const { updates } = req.body as BulkStockUpdateInput;
  const sellerId = req.user!.id;

  const products = await Product.find({ _id: { $in: updates.map((u) => u.id) }, seller: sellerId }).select('_id stock').lean();
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const results: { id: string; ok: boolean; stock?: number; error?: string }[] = [];
  const ops: Parameters<typeof Product.bulkWrite>[0] = [];

  for (const u of updates) {
    const product = byId.get(u.id);
    if (!product) {
      results.push({ id: u.id, ok: false, error: 'Product not found' });
      continue;
    }
    const nextStock = u.mode === 'set' ? u.value : product.stock + u.value;
    if (nextStock < 0) {
      results.push({ id: u.id, ok: false, error: `Would go below zero (currently ${product.stock})` });
      continue;
    }
    // Delta updates are applied atomically with a floor guard so a concurrent sale between our read
    // and this write can never push stock negative; `set` writes the absolute value.
    ops.push({
      updateOne: {
        filter: u.mode === 'delta' ? { _id: product._id, seller: sellerId, stock: { $gte: -u.value } } : { _id: product._id, seller: sellerId },
        update: u.mode === 'delta' ? { $inc: { stock: u.value } } : { $set: { stock: nextStock } },
      },
    });
    results.push({ id: u.id, ok: true, stock: nextStock });
  }

  if (ops.length) await Product.bulkWrite(ops, { ordered: false });

  const okCount = results.filter((r) => r.ok).length;
  sendResponse(res, { results }, `Updated stock for ${okCount} of ${updates.length} product(s)`);
});

/**
 * POST /seller/products/:id/duplicate — clone a listing as a starting point for a similar one.
 * Images are shared by reference (not re-uploaded to Cloudinary) — see filterUnreferencedPublicIds
 * for how deletion stays safe once two listings point at the same asset. The copy starts hidden
 * and at zero stock so it can't accidentally go live before the seller reviews it.
 */
export const duplicateProduct = asyncHandler(async (req, res) => {
  const original = await Product.findOne({ _id: req.params.id, seller: req.user!.id });
  if (!original) throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);

  const copy = await Product.create({
    seller: original.seller,
    title: `${original.title} (Copy)`,
    description: original.description,
    price: original.price,
    discountPrice: original.discountPrice,
    stock: 0,
    unit: original.unit,
    category: original.category,
    images: original.images,
    isActive: false,
  });

  sendResponse(res, { product: copy }, 'Product duplicated — review it and publish when ready', HTTP.CREATED);
});

/* ───────────────────────── Orders ───────────────────────── */

const findOrderByAnyId = (id: string) =>
  /^[a-f\d]{24}$/i.test(id) ? Order.findById(new Types.ObjectId(id)) : Order.findOne({ orderId: id });

/**
 * Ownership check shared by every single-order seller endpoint.
 * Returns null (→ 404, not 403) on a mismatch so a seller can't probe for the existence of
 * other sellers' orders by id — same convention as getSellerProductDetail.
 */
const findOwnedOrderByAnyId = async (id: string, sellerId: string) => {
  const order = await findOrderByAnyId(id);
  if (!order || !order.items.some((item) => item.seller.toString() === sellerId)) return null;
  return order;
};

/**
 * A seller must never see another seller's line items, prices, or titles within a shared order —
 * that's competitor data, not something fulfillment requires. Buyer contact and shipping address
 * are kept: whoever ships an item needs to know where it's going. `overallStatus` is the full
 * aggregate across every seller (useful context — "the rest of this order is still processing"),
 * while `items`/`yourSubtotal` are scoped to just this seller's part.
 */
const toSellerOrderView = (order: InstanceType<typeof Order>, sellerId: string) => {
  const plain = order.toJSON() as unknown as IOrder & { _id: Types.ObjectId };
  const yourItems = plain.items.filter((item) => item.seller.toString() === sellerId);
  const yourSubtotal = yourItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { ...plain, items: yourItems, yourSubtotal, overallStatus: plain.status };
};

export const listSellerOrders = asyncHandler(async (req, res) => {
  const { page, limit, status, paymentStatus, phone } = sellerOrderQuerySchema.parse(req.query);
  const sellerId = req.user!.id;

  // Scoped to orders containing at least one of this seller's items — never the whole order table.
  // `status` here filters by *this seller's item status*, not the order-wide aggregate, since
  // that's what a seller means by "show me my packed orders".
  const filter: Record<string, unknown> = { items: { $elemMatch: { seller: sellerId, ...(status && { status }) } } };
  if (paymentStatus) filter['payment.status'] = paymentStatus;
  if (phone) filter['buyer.phone'] = { $regex: escapeRegex(phone) };

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);

  sendResponse(res, {
    items: orders.map((order) => toSellerOrderView(order, sellerId)),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
});

export const getSellerOrder = asyncHandler(async (req, res) => {
  const order = await findOwnedOrderByAnyId(req.params.id, req.user!.id);
  if (!order) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);
  sendResponse(res, { order: toSellerOrderView(order, req.user!.id) });
});

/**
 * PATCH /seller/orders/:id/items/:productId/status
 * Each seller progresses only their own line item through ORDER_STATUS_TRANSITIONS.
 * The order-level `status` shown to the buyer is then recomputed as the aggregate
 * across every seller's items (see computeOrderStatus in the Order model).
 */
export const updateItemStatus = asyncHandler(async (req, res) => {
  const status = normalizeStatus((req.body as z.infer<typeof updateOrderStatusSchema>).status);
  const sellerId = req.user!.id;

  const order = await findOrderByAnyId(req.params.id);
  if (!order) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);

  const item = order.items.find((i) => i.product.toString() === req.params.productId && i.seller.toString() === sellerId);
  // No such item, or it belongs to a different seller — 404 either way, don't reveal which.
  if (!item) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);

  applyItemTransition(order, item, status);
  await order.save();

  // Fire-and-forget: a messaging outage must not fail the seller's action.
  sendOrderStatusUpdate(order).catch((err) =>
    logger.warn('Status notification not delivered', { orderId: order.orderId, err: String(err) }),
  );

  sendResponse(res, { order: toSellerOrderView(order, sellerId) }, `Item marked as ${status}`);
});

/**
 * PATCH /seller/orders/:id/items/:productId/delivery
 * Courier, tracking number/URL, ETA and a note for one of this seller's line items. Editable from
 * payment until the item is delivered. Buyers see it on their order page and via /orders/track.
 */
export const updateItemDelivery = asyncHandler(async (req, res) => {
  const patch = req.body as z.infer<typeof deliveryUpdateSchema>;
  const sellerId = req.user!.id;

  const order = await findOrderByAnyId(req.params.id);
  if (!order) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);

  const item = order.items.find((i) => i.product.toString() === req.params.productId && i.seller.toString() === sellerId);
  if (!item) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);

  applyItemDelivery(item, patch);
  order.markModified('items');
  await order.save();

  sendResponse(res, { order: toSellerOrderView(order, sellerId) }, 'Tracking details saved');
});
