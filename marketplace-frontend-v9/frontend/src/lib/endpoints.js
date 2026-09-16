import { del, get, patch, post, put } from './api';
import { API_BASE } from './config';
import { normalizeAdminUser, normalizeList, normalizeOrder, normalizeOrderList, normalizeProduct, normalizeUser } from './normalize';

const qs = (params = {}) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  return s.toString() ? `?${s}` : '';
};

/* Authentication & user lifecycle */
export const auth = {
  // 201 = new account, 200 = an unverified placeholder for this email was updated. Both send a code.
  register: (body) => post('/auth/register', body).then((res) => ({ user: normalizeUser(res.data.user), codeSent: res.data.codeSent !== false, message: res.message })),
  login: (body) => post('/auth/login', body).then((res) => normalizeUser(res.data.user)),
  me: (opts) => get('/auth/me', opts).then((res) => normalizeUser(res.data.user)),
  logout: () => post('/auth/logout'),
  google: (idToken) => post('/auth/google', { idToken }).then((res) => normalizeUser(res.data.user)),
  sellerSetup: (body) => post('/auth/seller-setup', body).then((res) => normalizeUser(res.data.user)),
  forgotPassword: (email) => post('/auth/forgot-password', { email }).then((res) => res.message),
  resetPassword: (token, password) => post('/auth/reset-password', { token, password }).then((res) => res.message),
  sendVerificationCode: (email) => post('/auth/send-verification-code', { email }).then((res) => res.message),
  verifyEmailCode: (email, code) => post('/auth/verify-email', { email, code }).then((res) => res.message),
};

/* Public catalogue */
export const catalog = {
  list: (params = {}, opts) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return get(`/products${qs.toString() ? `?${qs}` : ''}`, opts).then((res) => {
      const payload = res.data || res;
      return normalizeList(Array.isArray(payload) ? { items: payload } : payload, params);
    });
  },
  // Backend looks products up by slug, not by Mongo _id — always pass product.slug here.
  detail: (slug, opts) => get(`/products/${slug}`, opts).then((res) => normalizeProduct(res.data.product)),
};

/* Seller product management: verifyJWT + requireSeller */
export const sellerProducts = {
  list: (params = {}, opts) => get(`/seller/products${qs(params)}`, opts).then((res) => normalizeList(res.data, params)),
  detail: (id, opts) => get(`/seller/products/${id}`, opts).then((res) => normalizeProduct(res.data.product)),
  create: (formData) => post('/seller/products', formData).then((res) => normalizeProduct(res.data.product)),
  update: (id, formData) => put(`/seller/products/${id}`, formData).then((res) => normalizeProduct(res.data.product)),
  // Permanent — deletes the listing and its photos for good.
  remove: (id) => del(`/seller/products/${id}`).then((res) => res.message),
  // Reversible show/hide; keeps photos and stock untouched.
  setActive: (id, isActive) => patch(`/seller/products/${id}/status`, { isActive }).then((res) => normalizeProduct(res.data.product)),
  // mode: 'set' | 'delta' — delta is handy for "+10 restocked" without knowing the current count.
  updateStock: (id, mode, value) => patch(`/seller/products/${id}/stock`, { mode, value }).then((res) => normalizeProduct(res.data.product)),
  bulkUpdateStock: (updates) => patch('/seller/products/bulk-stock', { updates }).then((res) => res.data.results),
  duplicate: (id) => post(`/seller/products/${id}/duplicate`).then((res) => normalizeProduct(res.data.product)),
  summary: (opts) => get('/seller/products/summary', opts).then((res) => res.data),
  // Bypasses the JSON api() wrapper — this is a CSV file download, not a JSON response.
  exportCsv: async () => {
    const res = await fetch(`${API_BASE}/seller/products/export`, { credentials: 'include' });
    if (!res.ok) throw new Error('Could not export products');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

/* Guest OTP */
export const otp = {
  send: (phone) => post('/otp/send-whatsapp', { phone }).then((res) => res.data),
  verify: (phone, code) => post('/otp/verify-whatsapp', { phone, code }).then((res) => res.data),
};

/* Seller order fulfilment: verifyJWT + requireSeller. Responses contain only this seller's line items. */
export const sellerOrders = {
  list: (params = {}, opts) => get(`/seller/orders${qs(params)}`, opts).then((res) => normalizeOrderList(res.data, params)),
  detail: (id, opts) => get(`/seller/orders/${id}`, opts).then((res) => normalizeOrder(res.data.order)),
  // Per-line-item: a seller only ever moves their own product within an order.
  updateItemStatus: (orderId, productId, status) =>
    patch(`/seller/orders/${orderId}/items/${productId}/status`, { status }).then((res) => normalizeOrder(res.data.order)),
  // Courier/tracking details; allowed while the item is confirmed/packed/out_for_delivery.
  updateItemDelivery: (orderId, productId, delivery) =>
    patch(`/seller/orders/${orderId}/items/${productId}/delivery`, delivery).then((res) => normalizeOrder(res.data.order)),
};

/* Admin panel: verifyJWT + requireAdmin. All analytics accept { from, to } ISO dates (default: last 30 days). */
export const admin = {
  overview: (params = {}, opts) => get(`/admin/analytics/overview${qs(params)}`, opts).then((res) => res.data),
  revenueByCategory: (params = {}, opts) => get(`/admin/analytics/revenue-by-category${qs(params)}`, opts).then((res) => res.data),
  revenueTimeseries: (params = {}, opts) => get(`/admin/analytics/revenue-timeseries${qs(params)}`, opts).then((res) => res.data),
  topProducts: (params = {}, opts) => get(`/admin/analytics/top-products${qs(params)}`, opts).then((res) => res.data.items),
  topSellers: (params = {}, opts) => get(`/admin/analytics/top-sellers${qs(params)}`, opts).then((res) => res.data.items),

  users: {
    list: (params = {}, opts) => get(`/admin/users${qs(params)}`, opts).then((res) => ({ ...res.data, items: res.data.items.map(normalizeAdminUser) })),
    detail: (id, opts) => get(`/admin/users/${id}`, opts).then((res) => ({ user: normalizeAdminUser(res.data.user), stats: res.data.stats })),
    update: (id, body) => patch(`/admin/users/${id}`, body).then((res) => normalizeAdminUser(res.data.user)),
  },
  orders: {
    list: (params = {}, opts) => get(`/admin/orders${qs(params)}`, opts).then((res) => normalizeOrderList(res.data, params)),
    detail: (id, opts) => get(`/admin/orders/${id}`, opts).then((res) => normalizeOrder(res.data.order)),
    updateItemStatus: (orderId, productId, status) =>
      patch(`/admin/orders/${orderId}/items/${productId}/status`, { status }).then((res) => normalizeOrder(res.data.order)),
    updateItemDelivery: (orderId, productId, delivery) =>
      patch(`/admin/orders/${orderId}/items/${productId}/delivery`, delivery).then((res) => normalizeOrder(res.data.order)),
  },
  products: {
    list: (params = {}, opts) => get(`/admin/products${qs(params)}`, opts).then((res) => ({
      ...normalizeList(res.data, params),
      items: res.data.items.map((p) => ({ ...normalizeProduct(p), seller: p.seller && typeof p.seller === 'object' ? { id: p.seller._id || p.seller.id, name: p.seller.name, storeName: p.seller.storeName, email: p.seller.email } : null })),
    })),
    setActive: (id, isActive) => patch(`/admin/products/${id}/status`, { isActive }).then((res) => normalizeProduct(res.data.product)),
    remove: (id) => del(`/admin/products/${id}`).then((res) => res.message),
  },
};

/* Checkout, payment, and buyer order tracking */
export const orders = {
  create: (body) => post('/orders/create-order', body).then((res) => res.data),
  verifyPayment: (body) => post('/orders/verify-payment', body).then((res) => res.data),
  // Registered buyers
  listMine: (params = {}, opts) => get(`/orders${qs(params)}`, opts).then((res) => normalizeOrderList(res.data, params)),
  detail: (id, opts) => get(`/orders/${id}`, opts).then((res) => normalizeOrder(res.data.order)),
  // Guests: order id + the phoneVerificationToken from the WhatsApp OTP flow
  track: (orderId, phoneVerificationToken) =>
    post('/orders/track', { orderId, phoneVerificationToken }).then((res) => normalizeOrder(res.data.order)),
};
