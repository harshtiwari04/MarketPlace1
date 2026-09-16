import jwt, { type SignOptions } from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';
import { env, isProd } from '../config/env';
import { COOKIES, OTP } from '../constants';
import type { AccessTokenPayload, PhoneVerificationPayload } from '../types';

const ISSUER = 'marketplace-api';
const ACCESS_COOKIE_MAX_AGE_MS = env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;

export const signAccessToken = (payload: AccessTokenPayload, expiresIn: string = env.JWT_EXPIRES_IN): string =>
  jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: expiresIn as SignOptions['expiresIn'],
    issuer: ISSUER,
  });

export const verifyAccessToken = (token: string): AccessTokenPayload & jwt.JwtPayload =>
  jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER }) as AccessTokenPayload & jwt.JwtPayload;

export const signPhoneVerificationToken = (phone: string): string => {
  const payload: PhoneVerificationPayload = { phone, purpose: 'phone_verification' };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: OTP.VERIFICATION_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: ISSUER,
    audience: 'checkout',
  });
};

export const verifyPhoneVerificationToken = (token: string): PhoneVerificationPayload => {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    issuer: ISSUER,
    audience: 'checkout',
  }) as PhoneVerificationPayload & jwt.JwtPayload;
  if (payload.purpose !== 'phone_verification' || typeof payload.phone !== 'string') {
    throw new jwt.JsonWebTokenError('Invalid token purpose');
  }
  return { phone: payload.phone, purpose: 'phone_verification' };
};

/**
 * One source of truth for cookie attributes so set/clear always match (a clearCookie with
 * different attributes is silently ignored by browsers — a classic "logout doesn't work" bug).
 *
 * Cross-site (SPA on a.onrender.com, API on b.onrender.com):  COOKIE_SAME_SITE=none → Secure is
 * mandatory and the cookie is a *third-party* cookie, which Safari/Brave/Chrome-incognito block.
 * Same-origin via a proxy/rewrite (recommended):               COOKIE_SAME_SITE=lax.
 */
const baseCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  // SameSite=None is rejected by browsers unless Secure is also set. Production is always https
  // behind Render's TLS terminator (trust proxy makes Express see req.secure = true).
  secure: isProd || env.COOKIE_SAME_SITE === 'none',
  sameSite: env.COOKIE_SAME_SITE,
  signed: true,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const setAuthCookie = (res: Response, token: string): void => {
  res.cookie(COOKIES.ACCESS_TOKEN, token, { ...baseCookieOptions(), maxAge: ACCESS_COOKIE_MAX_AGE_MS, path: '/' });
};

export const clearAuthCookie = (res: Response): void => {
  res.clearCookie(COOKIES.ACCESS_TOKEN, { ...baseCookieOptions(), path: '/' });
};

/**
 * The refresh cookie is scoped to /api/v1/auth so it's never sent on ordinary API calls —
 * only the browser's calls to login/refresh/logout ever see it, shrinking the attack surface.
 */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(COOKIES.REFRESH_TOKEN, token, {
    ...baseCookieOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: REFRESH_COOKIE_PATH,
  });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(COOKIES.REFRESH_TOKEN, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH });
};

export const clearSessionCookies = (res: Response): void => {
  clearAuthCookie(res);
  clearRefreshCookie(res);
};
