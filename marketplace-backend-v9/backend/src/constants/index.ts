export const ROLES = { BUYER: 'buyer', SELLER: 'seller', ADMIN: 'admin', GUEST: 'guest' } as const;
/** Roles an admin may assign through the admin panel (guests are stateless tokens, never stored users). */
export const ASSIGNABLE_ROLES = ['buyer', 'seller', 'admin'] as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const UNITS = ['kg', 'g', 'pcs', 'pack', 'liter'] as const;
export type Unit = (typeof UNITS)[number];

export const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'packed',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed'] as const;

/**
 * Human-readable aliases so the API is self-describing for people used to the
 * pending → confirmed → shipped → delivered vocabulary. Stored values are the ORDER_STATUSES above.
 */
export const ORDER_STATUS_ALIASES: Record<string, OrderStatus> = {
  pending: 'placed',
  processing: 'confirmed',
  shipped: 'out_for_delivery',
  in_transit: 'out_for_delivery',
};

/** Statuses during which a seller/admin may attach or edit courier/tracking details. */
export const DELIVERY_EDITABLE_STATUSES: readonly OrderStatus[] = ['confirmed', 'packed', 'out_for_delivery'];

export const CARRIERS = ['delhivery', 'bluedart', 'dtdc', 'ecom_express', 'xpressbees', 'india_post', 'shadowfax', 'self', 'other'] as const;
export type Carrier = (typeof CARRIERS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Allowed forward transitions for the seller status endpoint. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const OTP = {
  LENGTH: 6,
  TTL_MS: 5 * 60 * 1000,
  COOLDOWN_MS: 60 * 1000,
  MAX_ATTEMPTS: 3,
  VERIFICATION_TOKEN_TTL: '15m',
} as const;

/**
 * Email verification code. Separate constants from phone OTP because the two channels have
 * different delivery latency and typo profiles: email can sit in an inbox for minutes before
 * being read (longer TTL), and codes get copy-pasted from a mail client rather than an
 * autofilled SMS/WhatsApp prompt, so a couple of extra attempts is reasonable.
 */
export const EMAIL_OTP = {
  LENGTH: 6,
  TTL_MS: 10 * 60 * 1000,
  COOLDOWN_MS: 60 * 1000,
  MAX_ATTEMPTS: 5,
} as const;

export const COOKIES = { ACCESS_TOKEN: 'access_token', REFRESH_TOKEN: 'refresh_token' } as const;

export const HEADERS = { PHONE_VERIFICATION: 'x-phone-verification-token' } as const;

export const HTTP = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
  PAYLOAD_TOO_LARGE: 413,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const MESSAGES = {
  UNAUTHORIZED: 'Authentication required',
  INVALID_TOKEN: 'Invalid or expired token',
  FORBIDDEN_SELLER: 'Seller access required',
  FORBIDDEN_ADMIN: 'Admin access required',
  ACCOUNT_SUSPENDED: 'This account has been suspended. Contact support.',
  PHONE_VERIFICATION_REQUIRED: 'Phone verification required before checkout',
  INVALID_CREDENTIALS: 'Invalid email or password',
  EMAIL_IN_USE: 'An account with this email already exists',
  EMAIL_NOT_VERIFIED: 'Please verify your email address before signing in. We just sent you a fresh code.',
  ALREADY_SELLER: 'This account is already a seller',
  PRODUCT_NOT_FOUND: 'Product not found',
  ORDER_NOT_FOUND: 'Order not found',
  INVALID_SIGNATURE: 'Invalid payment signature',
  NOT_FOUND: 'Resource not found',
  INTERNAL: 'Something went wrong',
} as const;

/** Stable machine-readable error identifiers the SPA branches on. Never change an existing value. */
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  PHONE_VERIFICATION_REQUIRED: 'PHONE_VERIFICATION_REQUIRED',
  PHONE_VERIFICATION_EXPIRED: 'PHONE_VERIFICATION_EXPIRED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  CORS_ORIGIN_DENIED: 'CORS_ORIGIN_DENIED',
  SELLER_REQUIRED: 'SELLER_REQUIRED',
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  DELIVERY_NOT_EDITABLE: 'DELIVERY_NOT_EDITABLE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const MAX_PRODUCT_IMAGES = 6;

/** Stock at or below this (but above zero) is flagged "low stock" to both buyers and sellers. */
export const LOW_STOCK_THRESHOLD = 5;
