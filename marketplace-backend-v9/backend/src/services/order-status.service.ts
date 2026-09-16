import { DELIVERY_EDITABLE_STATUSES, ERROR_CODES, ORDER_STATUS_ALIASES, ORDER_STATUSES, ORDER_STATUS_TRANSITIONS, type OrderStatus } from '../constants';
import { computeOrderStatus, type IOrderItem, type IOrderItemDelivery, type OrderDocument } from '../models/Order';
import { ApiError } from '../utils/ApiError';

/** Accepts stored values *or* the common aliases (pending/shipped/…) and returns the stored value. */
export const normalizeStatus = (input: string): OrderStatus => {
  const s = input.trim().toLowerCase();
  if ((ORDER_STATUSES as readonly string[]).includes(s)) return s as OrderStatus;
  const alias = ORDER_STATUS_ALIASES[s];
  if (alias) return alias;
  throw ApiError.badRequest(`Unknown status "${input}"`, undefined, ERROR_CODES.VALIDATION_FAILED);
};

/**
 * Moves one line item to `status`, enforcing the payment rule and the transition table, stamping
 * the delivery timestamps, and recomputing the order-level aggregate. Shared by the seller and
 * admin endpoints so the rules can never drift between the two. Does not save.
 */
export const applyItemTransition = (order: OrderDocument, item: IOrderItem, status: OrderStatus): void => {
  if (order.payment.status !== 'paid' && status !== 'cancelled') {
    throw ApiError.badRequest('Only paid orders can progress; unpaid orders may only be cancelled', undefined, ERROR_CODES.INVALID_TRANSITION);
  }

  const allowed = ORDER_STATUS_TRANSITIONS[item.status];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(
      `Cannot move this item from "${item.status}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`,
      { from: item.status, to: status, allowed },
      ERROR_CODES.INVALID_TRANSITION,
    );
  }

  const now = new Date();
  item.status = status;
  item.statusHistory.push({ status, at: now });

  if (status === 'out_for_delivery') {
    item.delivery = { ...(item.delivery ?? {}), shippedAt: item.delivery?.shippedAt ?? now };
  } else if (status === 'delivered') {
    item.delivery = { ...(item.delivery ?? {}), deliveredAt: now };
  }

  const nextOrderStatus = computeOrderStatus(order.items);
  if (nextOrderStatus !== order.status) {
    order.status = nextOrderStatus;
    order.statusHistory.push({ status: nextOrderStatus, at: now });
  }
};

type EditableDeliveryKey = 'carrier' | 'carrierName' | 'trackingNumber' | 'trackingUrl' | 'estimatedDeliveryAt' | 'notes';
/** `null` (or '') clears a field, `undefined` leaves it untouched — matches deliveryUpdateSchema. */
export type DeliveryPatch = { [K in EditableDeliveryKey]?: IOrderItemDelivery[K] | null };

/**
 * Attaches courier/tracking details to a line item. Only meaningful between payment and delivery;
 * the automatic timestamps (shippedAt/deliveredAt) are owned by applyItemTransition and can't be
 * overwritten here. Passing `null` for a field clears it. Does not save.
 */
export const applyItemDelivery = (item: IOrderItem, patch: DeliveryPatch): void => {
  if (!DELIVERY_EDITABLE_STATUSES.includes(item.status)) {
    throw ApiError.badRequest(
      `Tracking details can only be edited while an item is ${DELIVERY_EDITABLE_STATUSES.join(', ')} (currently "${item.status}")`,
      undefined,
      ERROR_CODES.DELIVERY_NOT_EDITABLE,
    );
  }
  const current = item.delivery ?? {};
  const next: IOrderItemDelivery = { shippedAt: current.shippedAt, deliveredAt: current.deliveredAt };
  for (const key of ['carrier', 'carrierName', 'trackingNumber', 'trackingUrl', 'estimatedDeliveryAt', 'notes'] as const) {
    const incoming = (patch as Record<string, unknown>)[key];
    if (incoming === undefined) {
      if (current[key] !== undefined) (next as Record<string, unknown>)[key] = current[key];
    } else if (incoming !== null && incoming !== '') {
      (next as Record<string, unknown>)[key] = incoming;
    }
  }
  item.delivery = next;
};
