import { Schema, model, Types, type HydratedDocument } from 'mongoose';
import { CARRIERS, ORDER_STATUSES, PAYMENT_STATUSES, UNITS, type Carrier, type OrderStatus, type PaymentStatus, type Unit } from '../constants';

export interface IOrderBuyer {
  userId?: Types.ObjectId;
  phone: string;
  email?: string;
  isGuest: boolean;
}

/**
 * Courier/tracking details for one line item. Sellers ship independently, so delivery lives on the
 * item rather than the order. Timestamps are set automatically by the status machine
 * (shippedAt on out_for_delivery, deliveredAt on delivered); the rest is entered by the seller.
 */
export interface IOrderItemDelivery {
  carrier?: Carrier;
  carrierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDeliveryAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  notes?: string;
}

export interface IOrderItem {
  product: Types.ObjectId;
  /** Denormalized at order-creation time so seller-scoped queries don't need a Product join. */
  seller: Types.ObjectId;
  /** Denormalized for category revenue analytics (legacy orders may lack it — analytics falls back to a $lookup). */
  category?: string;
  title: string;
  price: number;
  quantity: number;
  unit: Unit;
  /** Each seller fulfills and progresses their own line item independently. */
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: Date }[];
  delivery?: IOrderItemDelivery;
}

export interface IShippingAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface IOrderPayment {
  method: 'razorpay';
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  refundId?: string;
  status: PaymentStatus;
  failureReason?: string;
}

export interface IOrder {
  orderId: string;
  buyer: IOrderBuyer;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  totalAmount: number;
  payment: IOrderPayment;
  /** Aggregate view for buyer-facing display, lists, and filtering — always derived from item statuses via computeOrderStatus(). Never set directly except at creation. */
  status: OrderStatus;
  otpVerified: boolean;
  statusHistory: { status: OrderStatus; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Order-level status is a read model derived from per-item statuses, not an independent field.
 * Rule: if every item is cancelled, the order is cancelled. Otherwise the order is only as far
 * along as its *least* advanced non-cancelled item — mirrors how most marketplaces (Amazon, Etsy)
 * show a single "order status" to the buyer even when sellers ship independently.
 */
const STATUS_RANK: Record<OrderStatus, number> = {
  placed: 0,
  confirmed: 1,
  packed: 2,
  out_for_delivery: 3,
  delivered: 4,
  cancelled: -1, // never wins the "least advanced" comparison unless it's the only status present
};

export const computeOrderStatus = (items: Pick<IOrderItem, 'status'>[]): OrderStatus => {
  const active = items.filter((i) => i.status !== 'cancelled');
  if (active.length === 0) return 'cancelled';
  return active.reduce((slowest, item) =>
    STATUS_RANK[item.status] < STATUS_RANK[slowest.status] ? item : slowest,
  ).status;
};

export type OrderDocument = HydratedDocument<IOrder>;

const buyerSchema = new Schema<IOrderBuyer>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    isGuest: { type: Boolean, default: false },
  },
  { _id: false },
);

const deliverySchema = new Schema<IOrderItemDelivery>(
  {
    carrier: { type: String, enum: CARRIERS },
    carrierName: { type: String, trim: true, maxlength: 60 },
    trackingNumber: { type: String, trim: true, maxlength: 80 },
    trackingUrl: { type: String, trim: true, maxlength: 500 },
    estimatedDeliveryAt: { type: Date },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false },
);

const itemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, trim: true, lowercase: true, maxlength: 60 },
    title: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, enum: UNITS, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'placed', required: true },
    statusHistory: {
      type: [{ status: { type: String, enum: ORDER_STATUSES }, at: { type: Date, default: Date.now } }],
      default: () => [{ status: 'placed', at: new Date() }],
    },
    delivery: { type: deliverySchema },
  },
  { _id: false },
);

const shippingSchema = new Schema<IShippingAddress>(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'IN' },
  },
  { _id: false },
);

const paymentSchema = new Schema<IOrderPayment>(
  {
    method: { type: String, enum: ['razorpay'], default: 'razorpay', required: true },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String },
    refundId: { type: String },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', required: true },
    failureReason: { type: String },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true },
    buyer: { type: buyerSchema, required: true },
    items: {
      type: [itemSchema],
      required: true,
      validate: { validator: (v: IOrderItem[]) => v.length > 0, message: 'Order must contain at least one item' },
    },
    shippingAddress: { type: shippingSchema, required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    payment: { type: paymentSchema, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'placed' },
    otpVerified: { type: Boolean, default: false },
    statusHistory: {
      type: [{ status: { type: String, enum: ORDER_STATUSES }, at: { type: Date, default: Date.now } }],
      default: [],
    },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

orderSchema.index({ orderId: 1 }, { unique: true });
orderSchema.index({ 'payment.razorpayOrderId': 1 }, { unique: true });
orderSchema.index({ 'payment.razorpayPaymentId': 1 }, { sparse: true });
orderSchema.index({ 'buyer.userId': 1, createdAt: -1 });
orderSchema.index({ 'buyer.phone': 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'items.seller': 1, createdAt: -1 });
orderSchema.index({ 'items.product': 1 });
orderSchema.index({ 'payment.status': 1, createdAt: 1 }); // reconciliation / stale-pending sweeps
orderSchema.index({ 'items.category': 1, 'payment.status': 1 }); // admin revenue-by-category
orderSchema.index({ 'items.delivery.trackingNumber': 1 }, { sparse: true });

export const Order = model<IOrder>('Order', orderSchema);
