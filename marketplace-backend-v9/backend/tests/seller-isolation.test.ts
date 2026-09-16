import { describe, expect, it, vi } from 'vitest';
import { Order } from '../src/models/Order';
import { Product } from '../src/models/Product';
import { createLoggedInSeller, createTestOrder, createTestProduct, registerAndLogin } from './helpers';

vi.mock('../src/services/whatsapp.service', () => ({
  sendTemplate: vi.fn(async () => ({ ok: true })),
  sendText: vi.fn(async () => ({ ok: true })),
  sendOtp: vi.fn(async () => ({ ok: true })),
  sendOrderConfirmation: vi.fn(async () => ({ ok: true })),
  sendOrderStatusUpdate: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../src/services/cloudinary.service', () => ({
  deleteCloudinaryAssets: vi.fn(async () => undefined),
}));

/**
 * These tests pin the two IDOR fixes: a seller must never be able to read, modify, or even confirm
 * the existence of another seller's products or order line items. Every cross-tenant probe must
 * come back 404 (not 403) so ids can't be enumerated.
 */
describe('seller isolation: role guard', () => {
  it('a plain buyer cannot reach any /seller route', async () => {
    const { agent } = await registerAndLogin();
    await agent.get('/api/v1/seller/products').expect(403);
    await agent.get('/api/v1/seller/orders').expect(403);
  });

  it('an anonymous request is rejected before role checks', async () => {
    const { agent } = await createLoggedInSeller();
    await agent.post('/api/v1/auth/logout').expect(200);
    await agent.get('/api/v1/seller/orders').expect(401);
  });
});

describe('seller isolation: products', () => {
  it("lists only the caller's products", async () => {
    const a = await createLoggedInSeller('A Store');
    const b = await createLoggedInSeller('B Store');
    await createTestProduct(a.userId, { title: 'A Widget' });
    await createTestProduct(b.userId, { title: 'B Gadget' });

    const res = await a.agent.get('/api/v1/seller/products').expect(200);
    const titles = res.body.data.items.map((p: { title: string }) => p.title);
    expect(titles).toEqual(['A Widget']);
  });

  it("returns 404 for another seller's product on read, update and delete", async () => {
    const a = await createLoggedInSeller();
    const b = await createLoggedInSeller();
    const product = await createTestProduct(a.userId, { title: 'A Widget', price: 100 });
    const id = product._id.toString();

    await b.agent.get(`/api/v1/seller/products/${id}`).expect(404);
    await b.agent.put(`/api/v1/seller/products/${id}`).send({ title: 'Hijacked' }).expect(404);
    await b.agent.delete(`/api/v1/seller/products/${id}`).expect(404);

    // Nothing changed, and the product is still live for its real owner.
    const saved = (await Product.findById(id))!;
    expect(saved.title).toBe('A Widget');
    expect(saved.isActive).toBe(true);
    await a.agent.get(`/api/v1/seller/products/${id}`).expect(200);
  });
});

describe('seller isolation: orders', () => {
  /** One order containing a line from seller A and a line from seller B. */
  const sharedOrder = async (paymentStatus: 'pending' | 'paid' = 'paid') => {
    const a = await createLoggedInSeller('A Store');
    const b = await createLoggedInSeller('B Store');
    const pa = await createTestProduct(a.userId, { title: 'Seller A Widget', price: 100 });
    const pb = await createTestProduct(b.userId, { title: 'Seller B Gadget', price: 250 });
    const order = await createTestOrder({ items: [{ product: pa, quantity: 2 }, { product: pb, quantity: 1 }], paymentStatus });
    return { a, b, pa, pb, order };
  };

  it("list is scoped to orders containing the caller's items, and never includes other sellers' lines", async () => {
    const { a, b, order } = await sharedOrder();
    const c = await createLoggedInSeller('C Store');
    const pc = await createTestProduct(c.userId, { title: 'Seller C Thing' });
    await createTestOrder({ items: [{ product: pc }] });

    const resA = await a.agent.get('/api/v1/seller/orders').expect(200);
    expect(resA.body.data.pagination.total).toBe(1);
    const viewA = resA.body.data.items[0];
    expect(viewA.orderId).toBe(order.orderId);
    expect(viewA.items).toHaveLength(1);
    expect(viewA.items[0].title).toBe('Seller A Widget');
    expect(viewA.yourSubtotal).toBe(200);
    expect(viewA.overallStatus).toBe('confirmed');
    // Competitor data must be absent from the whole payload, not just the items array.
    expect(JSON.stringify(resA.body)).not.toContain('Seller B Gadget');
    expect(JSON.stringify(resA.body)).not.toContain('Seller C Thing');

    const resB = await b.agent.get('/api/v1/seller/orders').expect(200);
    expect(resB.body.data.items[0].items[0].title).toBe('Seller B Gadget');
    expect(resB.body.data.items[0].yourSubtotal).toBe(250);

    const resC = await c.agent.get('/api/v1/seller/orders').expect(200);
    expect(resC.body.data.pagination.total).toBe(1);
    expect(JSON.stringify(resC.body)).not.toContain(order.orderId);
  });

  it('detail: 404 for a seller with no items in the order, by both Mongo id and ORD- id', async () => {
    const { a, order } = await sharedOrder();
    const c = await createLoggedInSeller();

    await c.agent.get(`/api/v1/seller/orders/${order._id.toString()}`).expect(404);
    await c.agent.get(`/api/v1/seller/orders/${order.orderId}`).expect(404);

    const ok = await a.agent.get(`/api/v1/seller/orders/${order.orderId}`).expect(200);
    expect(ok.body.data.order.items).toHaveLength(1);
    expect(JSON.stringify(ok.body)).not.toContain('Seller B Gadget');
  });

  it("status update: 404 when targeting another seller's line item, even in an order you share", async () => {
    const { a, b, pa, pb, order } = await sharedOrder();

    // B is legitimately on this order, but pa is A's line.
    await b.agent.patch(`/api/v1/seller/orders/${order.orderId}/items/${pa._id.toString()}/status`).send({ status: 'packed' }).expect(404);
    // Outsider C, on either line.
    const c = await createLoggedInSeller();
    await c.agent.patch(`/api/v1/seller/orders/${order.orderId}/items/${pb._id.toString()}/status`).send({ status: 'packed' }).expect(404);

    const saved = (await Order.findById(order._id))!;
    expect(saved.items.every((i) => i.status === 'confirmed')).toBe(true);
    void a;
  });

  it("status update: a seller progresses only their own line; the order-level status is the least-advanced item", async () => {
    const { a, b, pa, pb, order } = await sharedOrder();
    const path = (productId: string) => `/api/v1/seller/orders/${order.orderId}/items/${productId}/status`;

    const r1 = await a.agent.patch(path(pa._id.toString())).send({ status: 'packed' }).expect(200);
    expect(r1.body.data.order.items[0].status).toBe('packed');
    expect(r1.body.data.order.overallStatus).toBe('confirmed'); // B's item is still 'confirmed'

    await a.agent.patch(path(pa._id.toString())).send({ status: 'out_for_delivery' }).expect(200);
    await a.agent.patch(path(pa._id.toString())).send({ status: 'delivered' }).expect(200);

    let saved = (await Order.findById(order._id))!;
    expect(saved.items.find((i) => i.product.equals(pa._id))!.status).toBe('delivered');
    expect(saved.items.find((i) => i.product.equals(pb._id))!.status).toBe('confirmed');
    expect(saved.status).toBe('confirmed');

    // Once B catches up, the aggregate follows.
    for (const status of ['packed', 'out_for_delivery', 'delivered'] as const) {
      await b.agent.patch(path(pb._id.toString())).send({ status }).expect(200);
    }
    saved = (await Order.findById(order._id))!;
    expect(saved.status).toBe('delivered');
    expect(saved.statusHistory.at(-1)?.status).toBe('delivered');
  });

  it('status update: enforces the state machine and refuses to progress unpaid orders', async () => {
    const { a, pa, order } = await sharedOrder('pending');
    const path = `/api/v1/seller/orders/${order.orderId}/items/${pa._id.toString()}/status`;

    // Unpaid → can't move forward…
    await a.agent.patch(path).send({ status: 'confirmed' }).expect(400);
    // …invalid enum value is rejected by validation…
    await a.agent.patch(path).send({ status: 'shipped' }).expect(400);
    // …but cancelling an unpaid line is allowed.
    await a.agent.patch(path).send({ status: 'cancelled' }).expect(200);

    const saved = (await Order.findById(order._id))!;
    expect(saved.items.find((i) => i.product.equals(pa._id))!.status).toBe('cancelled');
    expect(saved.status).toBe('placed'); // B's item is still placed, so the order is not cancelled

    // Terminal state: nothing further is allowed.
    await a.agent.patch(path).send({ status: 'confirmed' }).expect(400);
  });

  it('status update: skipping steps is rejected (confirmed → delivered)', async () => {
    const { a, pa, order } = await sharedOrder();
    await a.agent
      .patch(`/api/v1/seller/orders/${order.orderId}/items/${pa._id.toString()}/status`)
      .send({ status: 'delivered' })
      .expect(400);
  });

  it('order becomes cancelled only when every line is cancelled', async () => {
    const { a, b, pa, pb, order } = await sharedOrder();
    const path = (productId: string) => `/api/v1/seller/orders/${order.orderId}/items/${productId}/status`;

    await a.agent.patch(path(pa._id.toString())).send({ status: 'cancelled' }).expect(200);
    expect((await Order.findById(order._id))!.status).toBe('confirmed');

    await b.agent.patch(path(pb._id.toString())).send({ status: 'cancelled' }).expect(200);
    expect((await Order.findById(order._id))!.status).toBe('cancelled');
  });
});
