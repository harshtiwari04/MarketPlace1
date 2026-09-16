import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { signPhoneVerificationToken } from '../src/utils/token';
import { createLoggedInSeller, createTestOrder, createTestProduct, registerAndLogin } from './helpers';

vi.mock('../src/services/whatsapp.service', () => ({
  sendTemplate: vi.fn(async () => ({ ok: true })),
  sendText: vi.fn(async () => ({ ok: true })),
  sendOtp: vi.fn(async () => ({ ok: true })),
  sendOrderConfirmation: vi.fn(async () => ({ ok: true })),
  sendOrderStatusUpdate: vi.fn(async () => ({ ok: true })),
}));

const seed = async () => {
  const seller = await createLoggedInSeller();
  const product = await createTestProduct(seller.userId, { title: 'Tracked Item', price: 120 });
  return { seller, product };
};

describe('buyer orders: history', () => {
  it('requires a registered session', async () => {
    await request(app).get('/api/v1/orders').expect(401);
  });

  it('lists only the caller’s own orders, newest first, with pagination', async () => {
    const { product } = await seed();
    const me = await registerAndLogin();
    const other = await registerAndLogin();

    const older = await createTestOrder({ items: [{ product }], buyerUserId: me.userId, paymentStatus: 'paid' });
    const newer = await createTestOrder({ items: [{ product, quantity: 3 }], buyerUserId: me.userId });
    await createTestOrder({ items: [{ product }], buyerUserId: other.userId });
    await createTestOrder({ items: [{ product }] }); // guest — belongs to nobody

    const res = await me.agent.get('/api/v1/orders').expect(200);
    expect(res.body.data.pagination.total).toBe(2);
    expect(res.body.data.items.map((o: { orderId: string }) => o.orderId)).toEqual([newer.orderId, older.orderId]);

    // Buyer view hides seller account ids and the buyer's own userId.
    const first = res.body.data.items[0];
    expect(first.items[0].seller).toBeUndefined();
    expect(first.buyer.userId).toBeUndefined();
    expect(first.items[0].title).toBe('Tracked Item');
    expect(first.shippingAddress.city).toBe('Testville');

    const filtered = await me.agent.get('/api/v1/orders?status=confirmed').expect(200);
    expect(filtered.body.data.items.map((o: { orderId: string }) => o.orderId)).toEqual([older.orderId]);
  });

  it('detail: own order resolves by ORD- id and Mongo id; anyone else’s is a 404', async () => {
    const { product } = await seed();
    const me = await registerAndLogin();
    const other = await registerAndLogin();
    const mine = await createTestOrder({ items: [{ product }], buyerUserId: me.userId });
    const theirs = await createTestOrder({ items: [{ product }], buyerUserId: other.userId });

    await me.agent.get(`/api/v1/orders/${mine.orderId}`).expect(200);
    await me.agent.get(`/api/v1/orders/${mine._id.toString()}`).expect(200);
    await me.agent.get(`/api/v1/orders/${theirs.orderId}`).expect(404);
    await me.agent.get(`/api/v1/orders/${theirs._id.toString()}`).expect(404);
    await me.agent.get('/api/v1/orders/ORD-DOES-NOT-EXIST').expect(404);
  });
});

describe('buyer orders: guest tracking', () => {
  it('requires a phone verification token', async () => {
    const { product } = await seed();
    const order = await createTestOrder({ items: [{ product }], phone: '+919999900001' });
    await request(app).post('/api/v1/orders/track').send({ orderId: order.orderId }).expect(403);
  });

  it('returns the order when the verified phone matches the one on the order', async () => {
    const { product } = await seed();
    const order = await createTestOrder({ items: [{ product }], phone: '+919999900002', paymentStatus: 'paid' });

    const res = await request(app)
      .post('/api/v1/orders/track')
      .send({ orderId: order.orderId, phoneVerificationToken: signPhoneVerificationToken('+919999900002') })
      .expect(200);

    expect(res.body.data.order.orderId).toBe(order.orderId);
    expect(res.body.data.order.status).toBe('confirmed');
    expect(res.body.data.order.items[0].seller).toBeUndefined();
  });

  it('accepts the token via the x-phone-verification-token header too', async () => {
    const { product } = await seed();
    const order = await createTestOrder({ items: [{ product }], phone: '+919999900003' });

    await request(app)
      .post('/api/v1/orders/track')
      .set('x-phone-verification-token', signPhoneVerificationToken('+919999900003'))
      .send({ orderId: order.orderId })
      .expect(200);
  });

  it('404 when the phone does not match, even with a valid token and a real order id', async () => {
    const { product } = await seed();
    const order = await createTestOrder({ items: [{ product }], phone: '+919999900004' });

    await request(app)
      .post('/api/v1/orders/track')
      .send({ orderId: order.orderId, phoneVerificationToken: signPhoneVerificationToken('+919999900005') })
      .expect(404);
  });

  it('rejects a tampered token', async () => {
    const { product } = await seed();
    const order = await createTestOrder({ items: [{ product }], phone: '+919999900006' });
    const token = signPhoneVerificationToken('+919999900006');

    await request(app)
      .post('/api/v1/orders/track')
      .send({ orderId: order.orderId, phoneVerificationToken: token.slice(0, -4) + 'AAAA' })
      .expect(403);
  });
});
