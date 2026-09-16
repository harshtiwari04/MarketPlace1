import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { env } from '../src/config/env';
import { Order } from '../src/models/Order';
import { Product } from '../src/models/Product';
import { finalizePaidOrder, markPaymentFailed } from '../src/services/stock.service';
import { refundPayment } from '../src/services/razorpay.service';
import { ApiError } from '../src/utils/ApiError';
import { hmacSha256Hex } from '../src/utils/crypto';
import { createLoggedInSeller, createTestOrder, createTestProduct } from './helpers';

// Razorpay: keep the pure HMAC helpers real, stub everything that would hit the network.
vi.mock('../src/services/razorpay.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/razorpay.service')>();
  return {
    ...actual,
    createRazorpayOrder: vi.fn(),
    fetchPayment: vi.fn(),
    refundPayment: vi.fn(async () => ({ id: 'rfnd_test_0001' })),
  };
});

// WhatsApp: fire-and-forget in the code under test, but stub so tests never attempt a Graph API call.
vi.mock('../src/services/whatsapp.service', () => ({
  sendTemplate: vi.fn(async () => ({ ok: true })),
  sendText: vi.fn(async () => ({ ok: true })),
  sendOtp: vi.fn(async () => ({ ok: true })),
  sendOrderConfirmation: vi.fn(async () => ({ ok: true })),
  sendOrderStatusUpdate: vi.fn(async () => ({ ok: true })),
}));

const refundMock = vi.mocked(refundPayment);

const stockOf = async (id: unknown) => (await Product.findById(id).lean())!.stock;

describe('stock.service: finalizePaidOrder', () => {
  beforeEach(() => refundMock.mockClear());

  it('decrements stock for every line item and marks the order paid + confirmed', async () => {
    const { userId: sellerId } = await createLoggedInSeller();
    const a = await createTestProduct(sellerId, { title: 'A', stock: 10 });
    const b = await createTestProduct(sellerId, { title: 'B', stock: 3 });
    const order = await createTestOrder({ items: [{ product: a, quantity: 4 }, { product: b, quantity: 3 }] });

    const { order: paid, newlyPaid } = await finalizePaidOrder(order.payment.razorpayOrderId, 'pay_001');

    expect(newlyPaid).toBe(true);
    expect(await stockOf(a._id)).toBe(6);
    expect(await stockOf(b._id)).toBe(0);
    expect(paid.payment.status).toBe('paid');
    expect(paid.payment.razorpayPaymentId).toBe('pay_001');
    expect(paid.status).toBe('confirmed');
    expect(paid.items.every((i) => i.status === 'confirmed')).toBe(true);
    // Each item's own timeline records the confirmation, not just the order-level one.
    expect(paid.items.every((i) => i.statusHistory.at(-1)?.status === 'confirmed')).toBe(true);
    expect(refundMock).not.toHaveBeenCalled();
  });

  it('is idempotent: a second call is a no-op and stock is not decremented twice', async () => {
    const { userId: sellerId } = await createLoggedInSeller();
    const a = await createTestProduct(sellerId, { stock: 10 });
    const order = await createTestOrder({ items: [{ product: a, quantity: 2 }] });

    const first = await finalizePaidOrder(order.payment.razorpayOrderId, 'pay_001');
    const second = await finalizePaidOrder(order.payment.razorpayOrderId, 'pay_001');

    expect(first.newlyPaid).toBe(true);
    expect(second.newlyPaid).toBe(false);
    expect(await stockOf(a._id)).toBe(8);
  });

  it('under concurrent verify-payment + webhook, exactly one call wins and stock is deducted once', async () => {
    const { userId: sellerId } = await createLoggedInSeller();
    const a = await createTestProduct(sellerId, { stock: 5 });
    const order = await createTestOrder({ items: [{ product: a, quantity: 2 }] });

    const results = await Promise.allSettled([
      finalizePaidOrder(order.payment.razorpayOrderId, 'pay_race'),
      finalizePaidOrder(order.payment.razorpayOrderId, 'pay_race'),
    ]);

    // withTransaction retries transient write conflicts, so both should settle successfully…
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof finalizePaidOrder>>
    >[];
    expect(fulfilled.length).toBe(2);
    // …but only one of them actually performed the transition.
    expect(fulfilled.filter((r) => r.value.newlyPaid).length).toBe(1);
    expect(await stockOf(a._id)).toBe(3);
  });

  it('throws 404 for an unknown Razorpay order id', async () => {
    await expect(finalizePaidOrder('order_does_not_exist', 'pay_x')).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('oversell (stock ran out between order creation and payment capture)', () => {
    it('rolls back every decrement in the transaction, cancels all items, records payment + refund', async () => {
      const { userId: sellerId } = await createLoggedInSeller();
      const inStock = await createTestProduct(sellerId, { title: 'Still available', stock: 10 });
      const soldOut = await createTestProduct(sellerId, { title: 'Gone', stock: 1 });
      // First item would succeed on its own; second forces the abort. The first decrement must be undone.
      const order = await createTestOrder({ items: [{ product: inStock, quantity: 2 }, { product: soldOut, quantity: 2 }] });

      const err = await finalizePaidOrder(order.payment.razorpayOrderId, 'pay_oversell').catch((e) => e);

      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('Gone');

      expect(await stockOf(inStock._id)).toBe(10); // transaction rollback
      expect(await stockOf(soldOut._id)).toBe(1);

      expect(refundMock).toHaveBeenCalledTimes(1);
      expect(refundMock).toHaveBeenCalledWith('pay_oversell', expect.objectContaining({ reason: 'out_of_stock' }));

      const saved = (await Order.findById(order._id))!;
      expect(saved.status).toBe('cancelled');
      expect(saved.payment.status).toBe('paid'); // money did move — record it honestly
      expect(saved.payment.razorpayPaymentId).toBe('pay_oversell');
      expect(saved.payment.refundId).toBe('rfnd_test_0001');
      expect(saved.payment.failureReason).toContain('Insufficient stock');
      expect(saved.items.every((i) => i.status === 'cancelled')).toBe(true);
      expect(saved.items.every((i) => i.statusHistory.at(-1)?.status === 'cancelled')).toBe(true);
      expect(saved.statusHistory.at(-1)?.status).toBe('cancelled');
    });

    it('treats a deactivated product as unavailable', async () => {
      const { userId: sellerId } = await createLoggedInSeller();
      const p = await createTestProduct(sellerId, { stock: 10, isActive: false });
      const order = await createTestOrder({ items: [{ product: p, quantity: 1 }] });

      await expect(finalizePaidOrder(order.payment.razorpayOrderId, 'pay_inactive')).rejects.toMatchObject({ statusCode: 409 });
      expect(await stockOf(p._id)).toBe(10);
      expect(refundMock).toHaveBeenCalledTimes(1);
    });

    it('still cancels the order when the automatic refund itself fails (manual follow-up case)', async () => {
      refundMock.mockRejectedValueOnce(new Error('razorpay down'));
      const { userId: sellerId } = await createLoggedInSeller();
      const p = await createTestProduct(sellerId, { stock: 0 });
      const order = await createTestOrder({ items: [{ product: p, quantity: 1 }] });

      await expect(finalizePaidOrder(order.payment.razorpayOrderId, 'pay_norefund')).rejects.toMatchObject({ statusCode: 409 });

      const saved = (await Order.findById(order._id))!;
      expect(saved.status).toBe('cancelled');
      expect(saved.payment.status).toBe('paid');
      expect(saved.payment.refundId).toBeUndefined();
    });

    it('never downgrades an already-paid order (oversell path is guarded by payment.status != paid)', async () => {
      const { userId: sellerId } = await createLoggedInSeller();
      const p = await createTestProduct(sellerId, { stock: 5 });
      const order = await createTestOrder({ items: [{ product: p, quantity: 1 }] });
      await finalizePaidOrder(order.payment.razorpayOrderId, 'pay_ok');

      // Simulate a late duplicate capture arriving after stock has since been sold out elsewhere.
      await Product.updateOne({ _id: p._id }, { $set: { stock: 0 } });
      const { newlyPaid } = await finalizePaidOrder(order.payment.razorpayOrderId, 'pay_ok');

      expect(newlyPaid).toBe(false);
      expect((await Order.findById(order._id))!.status).toBe('confirmed');
    });
  });
});

describe('stock.service: markPaymentFailed', () => {
  it('flags a pending order as failed with the reason', async () => {
    const { userId: sellerId } = await createLoggedInSeller();
    const p = await createTestProduct(sellerId);
    const order = await createTestOrder({ items: [{ product: p }] });

    await markPaymentFailed(order.payment.razorpayOrderId, 'card_declined');

    const saved = (await Order.findById(order._id))!;
    expect(saved.payment.status).toBe('failed');
    expect(saved.payment.failureReason).toBe('card_declined');
  });

  it('does not touch an order that is already paid', async () => {
    const { userId: sellerId } = await createLoggedInSeller();
    const p = await createTestProduct(sellerId);
    const order = await createTestOrder({ items: [{ product: p }], paymentStatus: 'paid' });

    await markPaymentFailed(order.payment.razorpayOrderId, 'late failure event');

    expect((await Order.findById(order._id))!.payment.status).toBe('paid');
  });
});

describe('checkout HTTP: verify-payment + webhook', () => {
  const checkoutSig = (orderId: string, paymentId: string) => hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
  const webhookSig = (raw: string) => hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, raw);

  it('POST /orders/verify-payment finalizes with a valid signature and rejects a forged one', async () => {
    const { userId: sellerId } = await createLoggedInSeller();
    const p = await createTestProduct(sellerId, { stock: 4 });
    const order = await createTestOrder({ items: [{ product: p, quantity: 1 }] });
    const rzpOrderId = order.payment.razorpayOrderId;

    await request(app)
      .post('/api/v1/orders/verify-payment')
      .send({ razorpay_order_id: rzpOrderId, razorpay_payment_id: 'pay_http', razorpay_signature: 'deadbeef'.repeat(8) })
      .expect(400);
    expect(await stockOf(p._id)).toBe(4);

    const res = await request(app)
      .post('/api/v1/orders/verify-payment')
      .send({ razorpay_order_id: rzpOrderId, razorpay_payment_id: 'pay_http', razorpay_signature: checkoutSig(rzpOrderId, 'pay_http') })
      .expect(200);

    expect(res.body.data.paymentStatus).toBe('paid');
    expect(res.body.data.status).toBe('confirmed');
    expect(await stockOf(p._id)).toBe(3);
  });

  it('POST /checkout/webhook payment.captured finalizes idempotently; bad signature is rejected', async () => {
    const { userId: sellerId } = await createLoggedInSeller();
    const p = await createTestProduct(sellerId, { stock: 4 });
    const order = await createTestOrder({ items: [{ product: p, quantity: 1 }] });
    const rzpOrderId = order.payment.razorpayOrderId;

    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_wh', order_id: rzpOrderId } } } });

    await request(app)
      .post('/api/v1/checkout/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'not-a-real-signature')
      .send(raw)
      .expect(400);

    await request(app)
      .post('/api/v1/checkout/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', webhookSig(raw))
      .send(raw)
      .expect(200);

    // Razorpay retries deliver the same event again — must be a 200 no-op.
    await request(app)
      .post('/api/v1/checkout/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', webhookSig(raw))
      .send(raw)
      .expect(200);

    expect(await stockOf(p._id)).toBe(3);
    expect((await Order.findById(order._id))!.payment.status).toBe('paid');
  });

  it('POST /checkout/webhook payment.failed marks the order failed', async () => {
    const { userId: sellerId } = await createLoggedInSeller();
    const p = await createTestProduct(sellerId);
    const order = await createTestOrder({ items: [{ product: p }] });
    const raw = JSON.stringify({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_f', order_id: order.payment.razorpayOrderId, error_description: 'Insufficient funds' } } },
    });

    await request(app).post('/api/v1/checkout/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', webhookSig(raw)).send(raw).expect(200);

    const saved = (await Order.findById(order._id))!;
    expect(saved.payment.status).toBe('failed');
    expect(saved.payment.failureReason).toBe('Insufficient funds');
  });
});
