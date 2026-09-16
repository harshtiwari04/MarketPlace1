import type { TokenPayload } from 'google-auth-library';
import type { Response } from 'express';
import { googleClient } from '../config/googleAuth';
import { adminEmails, allowedOrigins, env } from '../config/env';
import { COOKIES, ERROR_CODES, HTTP, MESSAGES, ROLES, type Role } from '../constants';
import { User, type UserDocument } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { ApiError } from '../utils/ApiError';
import { sendResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateOpaqueToken, hashOpaqueToken, randomId } from '../utils/crypto';
import { logger } from '../utils/logger';
import { sendPasswordResetEmail } from '../services/email.service';
import { requestEmailVerificationCode, sendVerificationCode, verifyEmailVerificationCode } from '../services/email-otp.service';
import { clearSessionCookies, setAuthCookie, setRefreshCookie, signAccessToken } from '../utils/token';
import type { z } from 'zod';
import type {
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  sellerSetupSchema,
  sendVerificationCodeSchema,
  verifyEmailCodeSchema,
} from '../validators/auth.validators';

const REFRESH_TTL_MS = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 min

const publicUser = (u: {
  _id: unknown;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  storeName?: string;
  storeDescription?: string;
}) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  isPhoneVerified: u.isPhoneVerified,
  isEmailVerified: u.isEmailVerified,
  storeName: u.storeName,
  storeDescription: u.storeDescription,
});

/**
 * Runs on every successful sign-in: records telemetry the admin dashboard reports on and
 * bootstraps the first admin(s) from ADMIN_EMAILS. Mutates and saves the document.
 */
const recordLogin = async (user: UserDocument): Promise<void> => {
  user.lastLoginAt = new Date();
  user.loginCount = (user.loginCount ?? 0) + 1;
  if (user.email && adminEmails.has(user.email) && user.role !== ROLES.ADMIN) {
    logger.info('Promoting ADMIN_EMAILS user to admin', { userId: String(user._id) });
    user.role = ROLES.ADMIN;
  }
  await user.save();
};

const revokeAllSessions = (userId: unknown) =>
  RefreshToken.updateMany({ user: userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });

/** Issues a fresh access+refresh token pair for a registered user and sets both cookies. */
const issueSession = async (res: Response, user: { _id: unknown; role: Role }): Promise<void> => {
  setAuthCookie(res, signAccessToken({ sub: String(user._id), role: user.role }));

  const refreshToken = generateOpaqueToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashOpaqueToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS()),
  });
  setRefreshCookie(res, refreshToken);
};

/**
 * POST /auth/register
 *
 * An *unverified* account is a placeholder, not a person: whoever proves control of the inbox
 * owns the address. So if a registration arrives for an email that exists but was never
 * verified, we overwrite the placeholder (name/password/phone), revoke any of its sessions, and
 * send a fresh code — instead of a dead-end 409 that locks the real owner out forever.
 *
 * A *verified* (or Google-linked) account is a real person → 409, as before.
 *
 * Safe because login (below) refuses unverified password accounts, so an unverified placeholder
 * can never have placed orders or hold a session worth hijacking.
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body as z.infer<typeof registerSchema>;

  const existing = await User.findOne({ email }).select('+password');

  if (existing) {
    if (existing.isEmailVerified || existing.googleId) {
      throw ApiError.conflict(MESSAGES.EMAIL_IN_USE, ERROR_CODES.EMAIL_IN_USE);
    }

    existing.name = name;
    existing.password = password; // pre-save hook re-hashes
    if (phone) existing.phone = phone;
    existing.isPhoneVerified = phone ? existing.isPhoneVerified && existing.phone === phone : existing.isPhoneVerified;
    await existing.save();
    await revokeAllSessions(existing._id);

    // Fresh code every time — the person is sitting at the form waiting for it. Only skipped if
    // one went out < 60 s ago (double-submit), in which case that code is still valid.
    const sent = await sendVerificationCode(existing, { respectCooldown: true });

    return sendResponse(
      res,
      { user: publicUser(existing), verificationRequired: true, codeSent: sent },
      sent ? 'Account details updated — a fresh verification code has been sent' : 'Account details updated — use the code we sent a moment ago',
      HTTP.OK,
    );
  }

  let user: UserDocument;
  try {
    user = await User.create({ name, email, password, phone, role: ROLES.BUYER });
  } catch (err) {
    // Two concurrent registrations for the same new email — the unique index wins the race.
    if ((err as { code?: number })?.code === 11000) throw ApiError.conflict(MESSAGES.EMAIL_IN_USE, ERROR_CODES.EMAIL_IN_USE);
    throw err;
  }

  const sent = await sendVerificationCode(user);
  // Deliberately no auto-login — sign-in is gated on email verification (see login).
  sendResponse(res, { user: publicUser(user), verificationRequired: true, codeSent: sent }, 'Account created — check your email for the verification code', HTTP.CREATED);
});

/**
 * POST /auth/login
 * Password accounts must have a verified email. This is what makes register()'s
 * "overwrite unverified placeholder" behaviour safe. The response carries a stable code the
 * SPA uses to route straight to the verification screen; a fresh code is (re)sent on the way.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized(MESSAGES.INVALID_CREDENTIALS, ERROR_CODES.INVALID_CREDENTIALS);
  }

  if (user.isSuspended) throw ApiError.forbidden(MESSAGES.ACCOUNT_SUSPENDED, ERROR_CODES.ACCOUNT_SUSPENDED);

  if (!user.isEmailVerified) {
    await sendVerificationCode(user, { respectCooldown: true });
    throw ApiError.forbidden(MESSAGES.EMAIL_NOT_VERIFIED, ERROR_CODES.EMAIL_NOT_VERIFIED);
  }

  await recordLogin(user);
  await issueSession(res, user);
  sendResponse(res, { user: publicUser(user) }, 'Logged in');
});

/**
 * POST /auth/google
 * Frontend obtains a Google ID token (Google Identity Services) and posts it here.
 * We verify signature + audience, then upsert the user.
 */
export const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body as z.infer<typeof googleAuthSchema>;

  let payload: TokenPayload | undefined;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized('Invalid Google token', ERROR_CODES.INVALID_TOKEN);
  }
  if (!payload?.sub) throw ApiError.unauthorized('Invalid Google token', ERROR_CODES.INVALID_TOKEN);
  if (payload.email && payload.email_verified === false) {
    throw ApiError.unauthorized('Google account email is not verified', ERROR_CODES.EMAIL_NOT_VERIFIED);
  }

  const email = payload.email?.toLowerCase();
  let user = await User.findOne({ googleId: payload.sub });

  if (!user && email) {
    // Link Google identity to an existing email/password account. Google has already verified
    // this email address, so we can trust it for our own isEmailVerified flag too.
    user = await User.findOneAndUpdate(
      { email },
      { $set: { googleId: payload.sub, isEmailVerified: true, emailVerifiedAt: new Date() } },
      { new: true },
    );
  }
  if (!user) {
    try {
      user = await User.create({
        name: payload.name ?? email?.split('@')[0] ?? 'Google user',
        email,
        googleId: payload.sub,
        role: ROLES.BUYER,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
      });
    } catch (err) {
      if ((err as { code?: number })?.code !== 11000) throw err;
      // Raced with a parallel Google sign-in for the same account.
      user = await User.findOne({ googleId: payload.sub });
      if (!user) throw err;
    }
  }

  if (user.isSuspended) throw ApiError.forbidden(MESSAGES.ACCOUNT_SUSPENDED, ERROR_CODES.ACCOUNT_SUSPENDED);

  await recordLogin(user);
  await issueSession(res, user);
  sendResponse(res, { user: publicUser(user) }, 'Logged in with Google');
});

/** Lightweight stateless guest identity so the client can track a cart before checkout. */
export const guest = asyncHandler(async (req, res) => {
  if (req.user && !req.user.isGuest) {
    return sendResponse(res, { user: req.user }, 'Already authenticated');
  }
  const guestId = req.user?.id ?? `guest_${randomId()}`;
  setAuthCookie(res, signAccessToken({ sub: guestId, role: ROLES.GUEST }));
  return sendResponse(res, { user: { id: guestId, role: ROLES.GUEST, isGuest: true } }, 'Guest session issued');
});

/**
 * POST /auth/refresh
 * Exchanges a valid refresh token for a new access token, rotating the refresh token. Each
 * refresh token is single-use: if the *same* token is presented twice, it was stolen — every
 * session for that user is revoked.
 */
export const refresh = asyncHandler(async (req, res) => {
  const raw = (req.signedCookies as Record<string, string | undefined>)?.[COOKIES.REFRESH_TOKEN];
  if (!raw) throw ApiError.unauthorized('No refresh token', ERROR_CODES.UNAUTHORIZED);

  const tokenHash = hashOpaqueToken(raw);
  const record = await RefreshToken.findOne({ tokenHash });

  if (!record) {
    clearSessionCookies(res);
    throw ApiError.unauthorized('Invalid refresh token', ERROR_CODES.INVALID_TOKEN);
  }

  if (record.revokedAt) {
    logger.warn('Refresh token reuse detected — revoking all sessions for user', { userId: String(record.user), ip: req.ip });
    await revokeAllSessions(record.user);
    clearSessionCookies(res);
    throw ApiError.unauthorized('Session is no longer valid, please log in again', ERROR_CODES.INVALID_TOKEN);
  }

  if (record.expiresAt < new Date()) {
    clearSessionCookies(res);
    throw ApiError.unauthorized('Refresh token expired, please log in again', ERROR_CODES.INVALID_TOKEN);
  }

  const user = await User.findById(record.user);
  if (!user) {
    clearSessionCookies(res);
    throw ApiError.unauthorized('User no longer exists', ERROR_CODES.INVALID_TOKEN);
  }

  // Atomic rotate: only the first concurrent caller flips revokedAt from unset → set. A second
  // caller racing with the same cookie (two tabs refreshing at once) sees the token as already
  // revoked and is treated as reuse — the SPA dedupes refreshes, so that only happens under attack.
  const newRefreshToken = generateOpaqueToken();
  const newHash = hashOpaqueToken(newRefreshToken);
  const rotated = await RefreshToken.findOneAndUpdate(
    { _id: record._id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), replacedByHash: newHash } },
  );
  if (!rotated) {
    await revokeAllSessions(record.user);
    clearSessionCookies(res);
    throw ApiError.unauthorized('Session is no longer valid, please log in again', ERROR_CODES.INVALID_TOKEN);
  }
  await RefreshToken.create({ user: user._id, tokenHash: newHash, expiresAt: new Date(Date.now() + REFRESH_TTL_MS()) });

  setAuthCookie(res, signAccessToken({ sub: String(user._id), role: user.role }));
  setRefreshCookie(res, newRefreshToken);

  sendResponse(res, { user: publicUser(user) }, 'Session refreshed');
});

/**
 * POST /auth/seller-setup — promotes the authenticated, registered user to `seller`.
 */
export const sellerSetup = asyncHandler(async (req, res) => {
  const { storeName, description } = req.body as z.infer<typeof sellerSetupSchema>;

  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.unauthorized('User no longer exists', ERROR_CODES.INVALID_TOKEN);
  if (user.role === ROLES.SELLER) throw ApiError.conflict(MESSAGES.ALREADY_SELLER);

  user.role = ROLES.SELLER;
  user.storeName = storeName;
  if (description !== undefined) user.storeDescription = description;
  await user.save();

  // Re-issue the access token so the embedded role claim is current immediately.
  setAuthCookie(res, signAccessToken({ sub: String(user._id), role: user.role }));
  sendResponse(res, { user: publicUser(user) }, 'Store created');
});

export const logout = asyncHandler(async (req, res) => {
  const raw = (req.signedCookies as Record<string, string | undefined>)?.[COOKIES.REFRESH_TOKEN];
  if (raw) {
    await RefreshToken.updateOne({ tokenHash: hashOpaqueToken(raw) }, { $set: { revokedAt: new Date() } });
  }
  clearSessionCookies(res);
  sendResponse(res, null, 'Logged out');
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  if (req.user.isGuest) return sendResponse(res, { user: req.user });

  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.unauthorized('User no longer exists', ERROR_CODES.INVALID_TOKEN);
  return sendResponse(res, { user: { ...publicUser(user), addresses: user.addresses } });
});

/**
 * POST /auth/forgot-password
 * Always returns the same generic message whether or not the email has an account.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body as z.infer<typeof forgotPasswordSchema>;

  const user = await User.findOne({ email }).select('+password');
  // Google-only accounts have no password to reset — silently skip; response is identical either way.
  if (user?.password && user.email) {
    const token = generateOpaqueToken();
    await PasswordResetToken.create({
      user: user._id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });
    // Reset links always point at the primary storefront origin (first CLIENT_URL entry).
    const resetUrl = `${allowedOrigins[0]}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, user.name, resetUrl);
  }

  sendResponse(res, null, 'If an account exists for that email, a reset link has been sent.');
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body as z.infer<typeof resetPasswordSchema>;

  // Atomically consume the token so two parallel submits can't both succeed.
  const record = await PasswordResetToken.findOneAndUpdate(
    { tokenHash: hashOpaqueToken(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  if (!record) throw ApiError.badRequest('This reset link is invalid or has expired. Please request a new one.', undefined, ERROR_CODES.INVALID_TOKEN);

  const user = await User.findById(record.user).select('+password');
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired. Please request a new one.', undefined, ERROR_CODES.INVALID_TOKEN);

  user.password = password; // pre-save hook re-hashes it
  // Opening a link from the inbox proves control of the address — same evidence as a code.
  if (!user.isEmailVerified) {
    user.isEmailVerified = true;
    user.emailVerifiedAt = new Date();
  }
  await user.save();

  // A password reset invalidates every existing session.
  await revokeAllSessions(user._id);

  sendResponse(res, null, 'Password updated. Please log in with your new password.');
});

/**
 * POST /auth/send-verification-code — unauthenticated, identified by email. Generic response.
 */
export const sendVerificationCodeHandler = asyncHandler(async (req, res) => {
  const { email } = req.body as z.infer<typeof sendVerificationCodeSchema>;
  const result = await requestEmailVerificationCode(email);
  sendResponse(res, result, 'If that email needs verifying, a code has been sent.');
});

/**
 * POST /auth/verify-email — unauthenticated, identified by email + 6-digit code.
 */
export const verifyEmailCode = asyncHandler(async (req, res) => {
  const { email, code } = req.body as z.infer<typeof verifyEmailCodeSchema>;
  await verifyEmailVerificationCode(email, code);
  sendResponse(res, null, 'Email verified');
});
