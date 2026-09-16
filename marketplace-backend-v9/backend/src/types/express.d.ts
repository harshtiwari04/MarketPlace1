import type { AuthUser } from './index';

declare global {
  namespace Express {
    interface Request {
      /** Populated by verifyJWT / optionalAuth */
      user?: AuthUser;
      /** Populated by requirePhoneVerification (E.164) */
      phone?: string;
      /** Raw request body captured for webhook HMAC verification */
      rawBody?: Buffer;
    }
  }
}

export {};
