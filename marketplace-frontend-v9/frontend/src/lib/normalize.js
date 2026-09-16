// Normalises backend documents into the shapes the UI uses. See docs/03-api-contract.md.

export function normalizeImage(img) {
  if (!img) return null;
  if (typeof img === 'string') return { url: img, publicId: null };
  return {
    url: img.url || img.secure_url || img.secureUrl || '',
    publicId: img.publicId || img.public_id || null,
  };
}

export function normalizeProduct(p) {
  if (!p) return null;
  const price = Number(p.price ?? 0);
  const discountPrice = p.discountPrice != null ? Number(p.discountPrice) : null;
  const effectivePrice = p.effectivePrice != null ? Number(p.effectivePrice) : (discountPrice != null && discountPrice < price ? discountPrice : price);
  const stock = Number(p.stock ?? 0);
  return {
    id: p.id || p._id,
    // The backend's product-detail route looks products up by slug, not by _id — always
    // build product links/detail calls with `slug`, never `id`.
    slug: p.slug || null,
    title: p.title || '',
    description: p.description || '',
    price,
    discountPrice,
    effectivePrice,
    stock,
    inStock: p.inStock ?? stock > 0,
    stockStatus: p.stockStatus || (stock === 0 ? 'out_of_stock' : stock <= 5 ? 'low_stock' : 'in_stock'),
    unit: p.unit || 'pcs',
    category: p.category || 'other',
    images: (p.images || []).map(normalizeImage).filter(Boolean),
    createdAt: p.createdAt || null,
    sellerId: p.seller || p.sellerId || null,
    isActive: p.isActive ?? true,
    // Only present on seller-scoped responses (list/detail); null elsewhere.
    sold: p.sold != null ? Number(p.sold) : null,
    revenue: p.revenue != null ? Number(p.revenue) : null,
  };
}

/**
 * Accepts the catalog route's real shape — `{ items, pagination: { page, limit, total }, ... }`
 * or the seller-list shape `{ items, total, page, limit }` — or a bare array (client-paginated fallback).
 */
export function normalizeList(data, { page = 1, limit = 12 } = {}) {
  if (Array.isArray(data)) {
    return { items: data.map(normalizeProduct), total: data.length, page, limit, serverPaginated: false };
  }
  const items = data?.items || data?.products || data?.data || [];
  const pg = data?.pagination || data || {};
  const total = pg.total ?? data?.total;
  return {
    items: items.map(normalizeProduct),
    total: Number(total ?? items.length),
    page: Number(pg.page ?? data?.page ?? page),
    limit: Number(pg.limit ?? data?.limit ?? limit),
    serverPaginated: total !== undefined,
    lowStockCount: data?.lowStockCount != null ? Number(data.lowStockCount) : null,
  };
}

export function normalizeUser(u) {
  if (!u) return null;
  const user = u.user || u;
  return {
    id: user.id || user._id,
    name: user.name || '',
    email: user.email || '',
    role: user.role || 'buyer',
    isEmailVerified: !!user.isEmailVerified,
    storeName: user.storeName || user.seller?.storeName || null,
  };
}

/* ───────────────────────── Orders ───────────────────────── */

const normalizeHistory = (h) => (h || []).map((e) => ({ status: e.status, at: e.at || null }));

export function normalizeOrderItem(i) {
  if (!i) return null;
  const price = Number(i.price ?? 0);
  const quantity = Number(i.quantity ?? 1);
  return {
    productId: i.product?._id || i.product || i.productId || null,
    title: i.title || '',
    price,
    quantity,
    unit: i.unit || 'pcs',
    lineTotal: price * quantity,
    category: i.category || null,
    status: i.status || 'placed',
    statusHistory: normalizeHistory(i.statusHistory),
    delivery: normalizeDelivery(i.delivery),
    // Admin order view only: who fulfils this line.
    sellerId: i.seller?._id || i.seller || null,
    sellerInfo: i.sellerInfo || null,
  };
}

/** Courier/tracking details attached by the seller; timestamps are stamped by the backend status machine. */
export function normalizeDelivery(d) {
  if (!d || typeof d !== 'object') return null;
  const out = {
    carrier: d.carrier || null,
    carrierName: d.carrierName || null,
    trackingNumber: d.trackingNumber || null,
    trackingUrl: d.trackingUrl || null,
    estimatedDeliveryAt: d.estimatedDeliveryAt || null,
    shippedAt: d.shippedAt || null,
    deliveredAt: d.deliveredAt || null,
    notes: d.notes || null,
  };
  return Object.values(out).some(Boolean) ? out : null;
}

export function normalizeAdminUser(u) {
  if (!u) return null;
  return {
    id: u.id || u._id,
    name: u.name || '',
    email: u.email || '',
    phone: u.phone || '',
    role: u.role || 'buyer',
    storeName: u.storeName || null,
    isEmailVerified: !!u.isEmailVerified,
    isPhoneVerified: !!u.isPhoneVerified,
    isSuspended: !!u.isSuspended,
    googleLinked: !!u.googleLinked,
    lastLoginAt: u.lastLoginAt || null,
    loginCount: Number(u.loginCount ?? 0),
    createdAt: u.createdAt || null,
  };
}

/**
 * Works for both the buyer view (all items) and the seller view (only that seller's items, plus
 * `yourSubtotal` / `overallStatus`). Missing fields are simply null.
 */
export function normalizeOrder(o) {
  if (!o) return null;
  const items = (o.items || []).map(normalizeOrderItem).filter(Boolean);
  return {
    id: o.id || o._id,
    orderId: o.orderId || '',
    status: o.status || 'placed',
    overallStatus: o.overallStatus || o.status || 'placed',
    statusHistory: normalizeHistory(o.statusHistory),
    items,
    totalAmount: Number(o.totalAmount ?? 0),
    yourSubtotal: o.yourSubtotal != null ? Number(o.yourSubtotal) : null,
    buyer: { phone: o.buyer?.phone || '', email: o.buyer?.email || '', isGuest: !!o.buyer?.isGuest },
    shippingAddress: o.shippingAddress || null,
    payment: {
      status: o.payment?.status || 'pending',
      method: o.payment?.method || 'razorpay',
      paymentId: o.payment?.razorpayPaymentId || null,
      refundId: o.payment?.refundId || null,
      failureReason: o.payment?.failureReason || null,
    },
    createdAt: o.createdAt || null,
    updatedAt: o.updatedAt || null,
  };
}

export function normalizeOrderList(data, { page = 1, limit = 12 } = {}) {
  const items = data?.items || [];
  const pg = data?.pagination || {};
  return {
    items: items.map(normalizeOrder),
    total: Number(pg.total ?? items.length),
    page: Number(pg.page ?? page),
    limit: Number(pg.limit ?? limit),
    totalPages: Number(pg.totalPages ?? 1),
  };
}
