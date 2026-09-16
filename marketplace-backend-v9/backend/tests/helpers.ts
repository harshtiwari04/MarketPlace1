import request from 'supertest';
import app from '../src/app';
import { User } from '../src/models/User';
import { Product } from '../src/models/Product';
import { ROLES, type OrderStatus, type PaymentStatus } from '../src/constants';
import { Order } from '../src/models/Order';

let emailCounter = 0;
/** Unique per call so parallel `it`s in one file never collide on the unique email index. */
export const uniqueEmail = () => `user${Date.now()}${emailCounter++}@example.test`;

export interface AuthedAgent {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

/** Login is gated on a verified email; tests flip the flag directly instead of round-tripping a code. */
export const markEmailVerified = (email: string) =>
  User.updateOne({ email }, { $set: { isEmailVerified: true, emailVerifiedAt: new Date() } });

/** Registers a buyer, verifies the email, logs in, and returns a cookie-jar agent authenticated as that user. */
export const registerAndLogin = async (overrides: { email?: string; password?: string } = {}): Promise<AuthedAgent> => {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? 'CorrectHorse123';
  const agent = request.agent(app);

  await agent.post('/api/v1/auth/register').send({ name: 'Test User', email, password }).expect(201);
  await markEmailVerified(email);
  const loginRes = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);

  return { agent, userId: loginRes.body.data.user.id as string };
};

/** Creates and logs in a seller directly against the DB (skips the seller-setup HTTP round trip when a test doesn't care about that flow). */
export const createLoggedInSeller = async (storeName = 'Test Store'): Promise<AuthedAgent> => {
  const { agent, userId } = await registerAndLogin();
  await User.findByIdAndUpdate(userId, { role: ROLES.SELLER, storeName });
  // Role changed server-side after the cookie was issued — force a refresh so the access
  // token's embedded role claim is current (mirrors what the real frontend does post seller-setup).
  await agent.post('/api/v1/auth/refresh').expect(200);
  return { agent, userId };
};

/** Creates and logs in an admin (role set directly in the DB, then the token is refreshed to pick it up). */
export const createLoggedInAdmin = async (): Promise<AuthedAgent> => {
  const { agent, userId } = await registerAndLogin();
  await User.findByIdAndUpdate(userId, { role: ROLES.ADMIN });
  await agent.post('/api/v1/auth/refresh').expect(200);
  return { agent, userId };
};

/** Inserts a product directly via the model — bypasses multer/Cloudinary, which is out of scope for these tests. */
export const createTestProduct = (sellerId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Product.create({
    seller: sellerId,
    title: overrides.title ?? 'Test Product',
    description: 'A product used in tests',
    price: 100,
    stock: 10,
    unit: 'pcs',
    category: 'test',
    images: [{ url: 'https://example.test/img.jpg', publicId: 'test_public_id' }],
    ...overrides,
  });

/* ───────────────────────── Orders ───────────────────────── */

let orderCounter = 0;

export interface TestOrderItemInput {
  /** A Product document (or anything with _id, seller, title, price, category). */
  product: { _id: unknown; seller: unknown; title: string; price: number; category?: string };
  quantity?: number;
  status?: OrderStatus;
}

export interface TestOrderOptions {
  items: TestOrderItemInput[];
  buyerUserId?: string;
  phone?: string;
  paymentStatus?: PaymentStatus;
  razorpayOrderId?: string;
}

/**
 * Inserts an order directly, bypassing Razorpay. `status` on each item defaults to 'placed' for
 * pending payments and 'confirmed' for paid ones — mirroring what finalizePaidOrder would leave.
 */
export const createTestOrder = ({ items, buyerUserId, phone = '+919876543210', paymentStatus = 'pending', razorpayOrderId }: TestOrderOptions) => {
  const n = ++orderCounter;
  const defaultItemStatus: OrderStatus = paymentStatus === 'paid' ? 'confirmed' : 'placed';
  const lineItems = items.map(({ product, quantity = 1, status }) => {
    const s = status ?? defaultItemStatus;
    return {
      product: product._id,
      seller: product.seller,
      category: product.category,
      title: product.title,
      price: product.price,
      quantity,
      unit: 'pcs',
      status: s,
      statusHistory: [{ status: 'placed', at: new Date() }, ...(s !== 'placed' ? [{ status: s, at: new Date() }] : [])],
    };
  });
  const totalAmount = lineItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const orderStatus: OrderStatus = defaultItemStatus;

  return Order.create({
    orderId: `ORD-TEST-${Date.now()}-${n}`,
    buyer: { userId: buyerUserId, phone, email: undefined, isGuest: !buyerUserId },
    items: lineItems,
    shippingAddress: { street: '1 Test Lane', city: 'Testville', state: 'TS', postalCode: '000000', country: 'IN' },
    totalAmount,
    payment: {
      method: 'razorpay',
      razorpayOrderId: razorpayOrderId ?? `order_test_${Date.now()}_${n}`,
      razorpayPaymentId: paymentStatus === 'paid' ? `pay_test_${n}` : undefined,
      status: paymentStatus,
    },
    status: orderStatus,
    otpVerified: true,
    statusHistory: [{ status: 'placed', at: new Date() }],
  });
};
