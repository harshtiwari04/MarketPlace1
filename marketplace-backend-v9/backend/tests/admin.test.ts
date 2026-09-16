import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { Order } from '../src/models/Order';
import { createLoggedInAdmin, createLoggedInSeller, createTestOrder, createTestProduct, registerAndLogin } from './helpers';

vi.mock('../src/services/whatsapp.service', () => ({
  sendTemplate: vi.fn(async () => ({ ok: true })),
  sendText: vi.fn(async () => ({ ok: true })),
  sendOtp: vi.fn(async () => ({ ok: true })),
  sendOrderConfirmation: vi.fn(async () => ({ ok: true })),
  sendOrderStatusUpdate: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../src/services/cloudinary.service', () => ({ deleteCloudinaryAssets: vi.fn(async () => undefined) }));

/** Two sellers, three products across two categories, a mix of paid/unpaid/cancelled lines. */
const seedMarketplace = async () => {
  const sellerA = await createLoggedInSeller('Fresh Farm');
  const sellerB = await createLoggedInSeller('Gadget Hub');
  const apples = await createTestProduct(sellerA.userId, { title: 'Apples', category: 'grocery', price: 100 });
  const rice = await createTestProduct(sellerA.userId, { title: 'Rice', category: 'grocery', price: 60 });
  const cable = await createTestProduct(sellerB.userId, { title: 'USB Cable', category: 'electronics', price: 250 });

  const buyer = await registerAndLogin();
  // Paid: 2×apples (200) + 1×cable (250) → grocery 200, electronics 250
  const paid1 = await createTestOrder({ items: [{ product: apples, quantity: 2 }, { product: cable }], buyerUserId: buyer.userId, paymentStatus: 'paid' });
  // Paid but the rice line was cancelled → contributes nothing
  await createTestOrder({ items: [{ product: rice, quantity: 5, status: 'cancelled' }], paymentStatus: 'paid' });
  // Unpaid → excluded entirely
  await createTestOrder({ items: [{ product: cable, quantity: 3 }] });
  // Legacy paid order whose item has no denormalised category → resolved through $lookup
  const legacy = await createTestOrder({ items: [{ product: rice, quantity: 2 }], paymentStatus: 'paid' });
  await Order.updateOne({ _id: legacy._id }, { $unset: { 'items.0.category': '' } });

  return { sellerA, sellerB, apples, rice, cable, buyer, paid1 };
};

describe('admin: access control', () => {
  it('rejects anonymous, buyers and sellers with 401/403', async () => {
    await request(app).get('/api/v1/admin/analytics/overview').expect(401);
    const buyer = await registerAndLogin();
    const r1 = await buyer.agent.get('/api/v1/admin/analytics/overview').expect(403);
    expect(r1.body.code).toBe('ADMIN_REQUIRED');
    const seller = await createLoggedInSeller();
    await seller.agent.get('/api/v1/admin/users').expect(403);
  });

  it('admins cannot use the seller workspace (separate surfaces)', async () => {
    const admin = await createLoggedInAdmin();
    const r = await admin.agent.get('/api/v1/seller/products').expect(403);
    expect(r.body.code).toBe('SELLER_REQUIRED');
  });
});

describe('admin: analytics', () => {
  it('overview counts users, sessions, orders and recognised revenue', async () => {
    await seedMarketplace();
    const admin = await createLoggedInAdmin();

    const res = await admin.agent.get('/api/v1/admin/analytics/overview').expect(200);
    const d = res.body.data;

    // 2 sellers + 1 buyer + admin
    expect(d.users.total).toBe(4);
    expect(d.users.byRole.seller).toBe(2);
    expect(d.users.byRole.admin).toBe(1);
    // everyone above logged in → holds a live refresh token
    expect(d.users.currentlyLoggedIn).toBe(4);
    expect(d.users.activeLast24h).toBe(4);

    expect(d.orders.total).toBe(4);
    expect(d.orders.paidInRange).toBe(3);
    // recognised = 200 + 250 + (legacy rice 2×60=120) = 570 ; cancelled rice line 300 excluded
    expect(d.revenue.recognised).toBe(570);
    expect(d.revenue.cancelledOnPaid).toBe(300);
    expect(d.revenue.unitsSold).toBe(5);
    expect(d.sellers.withSalesInRange).toBe(2);
    expect(d.products.total).toBe(3);
  });

  it('groups recognised revenue by category, resolving legacy items via lookup', async () => {
    await seedMarketplace();
    const admin = await createLoggedInAdmin();

    const res = await admin.agent.get('/api/v1/admin/analytics/revenue-by-category').expect(200);
    const { total, categories } = res.body.data;
    const byCat = Object.fromEntries(categories.map((c: { category: string; revenue: number; units: number; share: number }) => [c.category, c]));

    expect(total).toBe(570);
    expect(byCat.grocery.revenue).toBe(320); // apples 200 + legacy rice 120 (cancelled rice excluded)
    expect(byCat.electronics.revenue).toBe(250);
    expect(byCat.grocery.units).toBe(4);
    expect(byCat.grocery.share + byCat.electronics.share).toBeCloseTo(1, 3);
    expect(categories[0].category).toBe('grocery'); // sorted by revenue desc
  });

  it('returns a daily revenue time series and top products', async () => {
    await seedMarketplace();
    const admin = await createLoggedInAdmin();

    const ts = await admin.agent.get('/api/v1/admin/analytics/revenue-timeseries?granularity=day').expect(200);
    expect(ts.body.data.points).toHaveLength(1);
    expect(ts.body.data.points[0].revenue).toBe(570);

    const top = await admin.agent.get('/api/v1/admin/analytics/top-products?limit=2').expect(200);
    expect(top.body.data.items[0].title).toBe('USB Cable');
    expect(top.body.data.items[0].revenue).toBe(250);
  });

  it('rejects an inverted date range', async () => {
    const admin = await createLoggedInAdmin();
    await admin.agent.get('/api/v1/admin/analytics/overview?from=2026-02-01&to=2026-01-01').expect(400);
  });
});

describe('admin: users, orders, products', () => {
  it('lists/searches users and can suspend one (revoking their sessions)', async () => {
    const victim = await registerAndLogin({ email: 'target@example.test' });
    const admin = await createLoggedInAdmin();

    const list = await admin.agent.get('/api/v1/admin/users?q=target').expect(200);
    expect(list.body.data.items).toHaveLength(1);

    await admin.agent.patch(`/api/v1/admin/users/${victim.userId}`).send({ isSuspended: true }).expect(200);

    const r = await victim.agent.get('/api/v1/auth/me').expect(401);
    expect(r.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('refuses to let an admin demote or suspend themselves', async () => {
    const admin = await createLoggedInAdmin();
    await admin.agent.patch(`/api/v1/admin/users/${admin.userId}`).send({ role: 'buyer' }).expect(400);
    await admin.agent.patch(`/api/v1/admin/users/${admin.userId}`).send({ isSuspended: true }).expect(400);
  });

  it('lists all orders across sellers and can progress any line item using status aliases', async () => {
    const { paid1, cable } = await seedMarketplace();
    const admin = await createLoggedInAdmin();

    const list = await admin.agent.get('/api/v1/admin/orders?paymentStatus=paid').expect(200);
    expect(list.body.data.pagination.total).toBe(3);

    // "shipped" is an alias for out_for_delivery; confirmed → packed → shipped
    await admin.agent.patch(`/api/v1/admin/orders/${paid1.orderId}/items/${cable._id}/status`).send({ status: 'packed' }).expect(200);
    const res = await admin.agent.patch(`/api/v1/admin/orders/${paid1.orderId}/items/${cable._id}/status`).send({ status: 'shipped' }).expect(200);
    const item = res.body.data.order.items.find((i: { product: string }) => i.product === String(cable._id));
    expect(item.status).toBe('out_for_delivery');
    expect(item.delivery.shippedAt).toBeTruthy();
  });

  it('can hide and delete any product', async () => {
    const seller = await createLoggedInSeller();
    const product = await createTestProduct(seller.userId);
    const admin = await createLoggedInAdmin();

    const hidden = await admin.agent.patch(`/api/v1/admin/products/${product.id}/status`).send({ isActive: false }).expect(200);
    expect(hidden.body.data.product.isActive).toBe(false);
    await request(app).get(`/api/v1/products/${product.slug}`).expect(404);

    await admin.agent.delete(`/api/v1/admin/products/${product.id}`).expect(200);
    await seller.agent.get(`/api/v1/seller/products/${product.id}`).expect(404);
  });
});

describe('delivery tracking', () => {
  it('seller attaches tracking details to their own line, buyer sees them, timestamps are automatic', async () => {
    const seller = await createLoggedInSeller();
    const product = await createTestProduct(seller.userId);
    const buyer = await registerAndLogin();
    const order = await createTestOrder({ items: [{ product }], buyerUserId: buyer.userId, paymentStatus: 'paid' });

    const res = await seller.agent
      .patch(`/api/v1/seller/orders/${order.orderId}/items/${product._id}/delivery`)
      .send({ carrier: 'delhivery', trackingNumber: 'DL123456789IN', trackingUrl: 'https://www.delhivery.com/track/package/DL123456789IN', estimatedDeliveryAt: '2026-09-20' })
      .expect(200);
    expect(res.body.data.order.items[0].delivery.trackingNumber).toBe('DL123456789IN');

    await seller.agent.patch(`/api/v1/seller/orders/${order.orderId}/items/${product._id}/status`).send({ status: 'packed' }).expect(200);
    await seller.agent.patch(`/api/v1/seller/orders/${order.orderId}/items/${product._id}/status`).send({ status: 'out_for_delivery' }).expect(200);
    const delivered = await seller.agent.patch(`/api/v1/seller/orders/${order.orderId}/items/${product._id}/status`).send({ status: 'delivered' }).expect(200);
    const d = delivered.body.data.order.items[0].delivery;
    expect(d.shippedAt).toBeTruthy();
    expect(d.deliveredAt).toBeTruthy();
    expect(d.carrier).toBe('delhivery'); // status changes must not wipe seller-entered fields

    // Buyer view carries the same delivery block; seller ids are still stripped.
    const mine = await buyer.agent.get(`/api/v1/orders/${order.orderId}`).expect(200);
    expect(mine.body.data.order.items[0].delivery.trackingNumber).toBe('DL123456789IN');
    expect(mine.body.data.order.items[0].seller).toBeUndefined();

    // Delivered → tracking is frozen.
    const frozen = await seller.agent
      .patch(`/api/v1/seller/orders/${order.orderId}/items/${product._id}/delivery`)
      .send({ notes: 'too late' })
      .expect(400);
    expect(frozen.body.code).toBe('DELIVERY_NOT_EDITABLE');
  });

  it("a seller cannot edit another seller's line", async () => {
    const a = await createLoggedInSeller('A');
    const b = await createLoggedInSeller('B');
    const product = await createTestProduct(a.userId);
    const order = await createTestOrder({ items: [{ product }], paymentStatus: 'paid' });
    await b.agent.patch(`/api/v1/seller/orders/${order.orderId}/items/${product._id}/delivery`).send({ trackingNumber: 'X' }).expect(404);
  });

  it('rejects a non-http tracking URL and an empty patch', async () => {
    const seller = await createLoggedInSeller();
    const product = await createTestProduct(seller.userId);
    const order = await createTestOrder({ items: [{ product }], paymentStatus: 'paid' });
    await seller.agent.patch(`/api/v1/seller/orders/${order.orderId}/items/${product._id}/delivery`).send({ trackingUrl: 'javascript:alert(1)' }).expect(400);
    await seller.agent.patch(`/api/v1/seller/orders/${order.orderId}/items/${product._id}/delivery`).send({}).expect(400);
  });
});
