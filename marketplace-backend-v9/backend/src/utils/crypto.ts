import crypto from 'node:crypto';
import { env } from '../config/env';
import { OTP } from '../constants';

/** Cryptographically secure numeric OTP, zero-padded. */
export const generateOtp = (): string =>
  crypto.randomInt(0, 10 ** OTP.LENGTH).toString().padStart(OTP.LENGTH, '0');

/**
 * OTPs have tiny entropy, so bcrypt adds little against an attacker holding the DB.
 * A keyed HMAC with a server-side pepper means leaked hashes are useless without the key.
 */
export const hashOtp = (phone: string, otp: string): string =>
  crypto.createHmac('sha256', env.OTP_HASH_SECRET).update(`${phone}:${otp}`).digest('hex');

export const hmacSha256Hex = (secret: string, data: string | Buffer): string =>
  crypto.createHmac('sha256', secret).update(data).digest('hex');

/** Same keyed-HMAC approach as hashOtp, scoped to the email channel so a phone and email code
 * that happen to collide numerically never hash to the same value. */
export const hashEmailOtp = (email: string, otp: string): string =>
  crypto.createHmac('sha256', env.OTP_HASH_SECRET).update(`email:${email.toLowerCase()}:${otp}`).digest('hex');

/** Constant-time string comparison. */
export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

/** Human-readable order id, e.g. ORD-1725700000000-3F9A1C */
export const generateOrderId = (): string =>
  `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

export const randomId = (): string => crypto.randomUUID();

/**
 * Opaque, high-entropy tokens for refresh / password-reset / email-verification links.
 * Only the SHA-256 hash is ever stored — a leaked DB reveals nothing usable, and lookup is a
 * plain indexed equality match (no per-row work needed, unlike a keyed comparison).
 */
export const generateOpaqueToken = (): string => crypto.randomBytes(32).toString('hex');
export const hashOpaqueToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');
