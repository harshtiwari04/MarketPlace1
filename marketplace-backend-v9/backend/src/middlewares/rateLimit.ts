import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { ERROR_CODES } from '../constants';
import { isTest } from '../config/env';

/**
 * All limiters share one JSON error shape (matches errorHandler) and emit RateLimit-* headers so
 * the SPA can read Retry-After and show a countdown.
 *
 * Store: in-memory, per process. Render "starter" runs a single instance so this is exact. If you
 * scale to N instances the effective limit becomes N× — swap in `rate-limit-redis` (same API,
 * one `store:` option) before enabling autoscaling.
 */
const common = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  // Integration tests register/login dozens of accounts from one in-process "IP" in seconds.
  skip: () => isTest,
} satisfies Partial<Options>;

const message = (msg: string) => ({ success: false, message: msg, code: ERROR_CODES.RATE_LIMITED });

/** IP (IPv6-subnet-normalised) + submitted email. */
const emailKey = (req: Request): string => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const clientIp = req.ip ?? '127.0.0.1';
  return `${clientIp}:${email}`;
};

/** Baseline protection for the whole API. Generous: a catalog page fires several calls, NATed offices share an IP. */
export const globalLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  skip: (req) => isTest || req.path === '/health' || req.path.endsWith('/checkout/webhook'),
  message: message('Too many requests, please try again later'),
});

/** Public catalogue reads (products list/detail, sitemap). */
export const publicReadLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 120,
  message: message('Too many requests, please slow down'),
});

/** Login: brute-force protection per IP+email (so one attacker can't lock out everyone behind a NAT). */
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: emailKey,
  message: message('Too many sign-in attempts for this account, please try again in 15 minutes'),
});

/** Registration sends an email — tighter than login. */
export const registerLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: message('Too many accounts created from this network, please try again later'),
});

/** Shared per-IP ceiling for every credential endpoint (login/register/google/reset). */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 40,
  message: message('Too many authentication attempts, please try again later'),
});

/** Guest-session issuance — cheap, but keep bots from minting thousands of JWTs. */
export const guestLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: message('Too many requests, please try again later'),
});

/** OTP send: per-IP ceiling on top of the per-phone 60s cooldown enforced in otp.service. Each send costs money. */
export const otpSendLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 8,
  message: message('Too many OTP requests, please try again later'),
});

export const otpVerifyLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: message('Too many verification attempts, please try again later'),
});

/** Payment endpoints are not free to call (they create Razorpay orders). */
export const checkoutLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 40,
  message: message('Too many checkout attempts, please try again later'),
});

/** Refresh happens automatically ~once per access-token lifetime per open tab. */
export const refreshLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: message('Too many session refresh attempts, please log in again'),
});

/** Forgot-password sends an email per request. Keyed per IP+email. */
export const passwordResetLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: emailKey,
  message: message('Too many password reset requests, please try again later'),
});

/** Send-code endpoint: per-IP+email ceiling on top of the per-user 60s cooldown in email-otp.service. */
export const emailVerificationLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: emailKey,
  message: message('Too many verification email requests, please try again later'),
});

export const emailOtpVerifyLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: message('Too many verification attempts, please try again later'),
});

/** Seller mutations (create/update/upload) — protects Cloudinary spend and slug-generation loops. */
export const sellerWriteLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 120,
  message: message('Too many changes in a short time, please slow down'),
});

/** Authenticated reads (seller dashboard, buyer order history). */
export const authedReadLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 240,
  message: message('Too many requests, please slow down'),
});

/** Admin mutations are rare and audited; keep a ceiling anyway in case a token leaks. */
export const adminWriteLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 200,
  message: message('Too many admin changes in a short time, please slow down'),
});