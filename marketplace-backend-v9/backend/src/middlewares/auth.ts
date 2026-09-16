import type { Request } from 'express';
import { COOKIES, ERROR_CODES, HEADERS, MESSAGES, ROLES } from '../constants';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken, verifyPhoneVerificationToken } from '../utils/token';
import type { AuthUser } from '../types';
import type { Role } from '../constants';

const extractAccessToken = (req: Request): string | undefined => {
  const fromCookie = (req.signedCookies as Record<string, string | undefined>)?.[COOKIES.ACCESS_TOKEN];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
};

const resolveUser = async (token: string): Promise<AuthUser> => {
  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized(MESSAGES.INVALID_TOKEN, ERROR_CODES.INVALID_TOKEN);
  }

  // Guest tokens are stateless — no DB record.
  if (payload.role === ROLES.GUEST) {
    return { id: payload.sub, role: ROLES.GUEST, isGuest: true };
  }

  // Registered users are re-checked so revoked/deleted/suspended accounts lose access immediately.
  const user = await User.findById(payload.sub).select('_id role isSuspended').lean();
  if (!user) throw ApiError.unauthorized('User no longer exists', ERROR_CODES.INVALID_TOKEN);
  if (user.isSuspended) throw ApiError.unauthorized(MESSAGES.ACCOUNT_SUSPENDED, ERROR_CODES.ACCOUNT_SUSPENDED);
  return { id: user._id.toString(), role: user.role, isGuest: false };
};

/** Requires a valid access token (registered user or guest). */
export const verifyJWT = asyncHandler(async (req, _res, next) => {
  const token = extractAccessToken(req);
  if (!token) throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  req.user = await resolveUser(token);
  next();
});

/** Attaches req.user if a valid token is present; never fails. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractAccessToken(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch {
      req.user = undefined;
    }
  }
  next();
});

/** Generic role guard — must run after verifyJWT. */
export const requireRole = (...roles: Role[]) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
    if (!roles.includes(req.user.role)) {
      const wantsAdmin = roles.length === 1 && roles[0] === ROLES.ADMIN;
      throw ApiError.forbidden(
        wantsAdmin ? MESSAGES.FORBIDDEN_ADMIN : MESSAGES.FORBIDDEN_SELLER,
        wantsAdmin ? ERROR_CODES.ADMIN_REQUIRED : ERROR_CODES.SELLER_REQUIRED,
      );
    }
    next();
  });

/** Seller workspace: sellers only. Admins have their own /admin surface with cross-seller visibility. */
export const requireSeller = requireRole(ROLES.SELLER);

/** Admin panel: admins only. */
export const requireAdmin = requireRole(ROLES.ADMIN);

/** Rejects guests — for endpoints that need a persisted account. */
export const requireRegistered = asyncHandler(async (req, _res, next) => {
  if (!req.user || req.user.isGuest) throw ApiError.unauthorized('A registered account is required', ERROR_CODES.UNAUTHORIZED);
  next();
});

/**
 * Checkout guard: requires the short-lived phoneVerificationToken issued by the WhatsApp
 * OTP flow. Accepts header `x-phone-verification-token` or body.phoneVerificationToken.
 */
export const requirePhoneVerification = asyncHandler(async (req, _res, next) => {
  const headerToken = req.headers[HEADERS.PHONE_VERIFICATION];
  const token =
    (typeof headerToken === 'string' ? headerToken : undefined) ??
    (typeof req.body?.phoneVerificationToken === 'string' ? req.body.phoneVerificationToken : undefined);

  if (!token) throw ApiError.forbidden(MESSAGES.PHONE_VERIFICATION_REQUIRED, ERROR_CODES.PHONE_VERIFICATION_REQUIRED);
  try {
    req.phone = verifyPhoneVerificationToken(token).phone;
  } catch {
    throw ApiError.forbidden('Phone verification expired. Please verify your number again.', ERROR_CODES.PHONE_VERIFICATION_EXPIRED);
  }
  next();
});
