// Mirrors backend src/constants/index.ts. Keep in sync — the backend is authoritative and will
// reject anything not in ORDER_STATUS_TRANSITIONS with a 400.
export const ORDER_STATUSES = ['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'];

/** Linear progression shown on the buyer timeline (cancelled is a branch, not a step). */
export const ORDER_STEPS = ['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered'];

export const STATUS_LABELS = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_TONES = {
  placed: 'info',
  confirmed: 'info',
  packed: 'warning',
  out_for_delivery: 'warning',
  delivered: 'success',
  cancelled: 'danger',
};

export const PAYMENT_LABELS = { pending: 'Payment pending', paid: 'Paid', failed: 'Payment failed' };
export const PAYMENT_TONES = { pending: 'warning', paid: 'success', failed: 'danger' };

export const TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** What the seller sees on the "advance" button for each next status. */
export const ACTION_LABELS = {
  confirmed: 'Confirm',
  packed: 'Mark packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Mark delivered',
  cancelled: 'Cancel item',
};

export const statusLabel = (s) => STATUS_LABELS[s] || s;
export const statusTone = (s) => STATUS_TONES[s] || 'info';
export const isTerminal = (s) => (TRANSITIONS[s] || []).length === 0;

/** Mirrors backend CARRIERS. `self` = the seller delivers in person. */
export const CARRIERS = [
  { value: 'delhivery', label: 'Delhivery' },
  { value: 'bluedart', label: 'Blue Dart' },
  { value: 'dtdc', label: 'DTDC' },
  { value: 'ecom_express', label: 'Ecom Express' },
  { value: 'xpressbees', label: 'XpressBees' },
  { value: 'india_post', label: 'India Post' },
  { value: 'shadowfax', label: 'Shadowfax' },
  { value: 'self', label: 'Delivered by seller' },
  { value: 'other', label: 'Other (enter name)' },
];
export const carrierLabel = (d) => (d?.carrier === 'other' && d?.carrierName) ? d.carrierName : (CARRIERS.find((c) => c.value === d?.carrier)?.label || d?.carrierName || null);

/** Statuses during which tracking details may be edited — mirrors backend DELIVERY_EDITABLE_STATUSES. */
export const DELIVERY_EDITABLE = ['confirmed', 'packed', 'out_for_delivery'];
export const canEditDelivery = (item) => DELIVERY_EDITABLE.includes(item?.status);
