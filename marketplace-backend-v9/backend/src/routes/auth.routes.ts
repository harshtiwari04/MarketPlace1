import { Router } from 'express';
import {
  forgotPassword,
  googleAuth,
  guest,
  login,
  logout,
  me,
  refresh,
  register,
  resetPassword,
  sellerSetup,
  sendVerificationCodeHandler,
  verifyEmailCode,
} from '../controllers/auth.controller';
import { optionalAuth, requireRegistered, verifyJWT } from '../middlewares/auth';
import {
  authLimiter,
  authedReadLimiter,
  emailOtpVerifyLimiter,
  emailVerificationLimiter,
  guestLimiter,
  loginLimiter,
  passwordResetLimiter,
  refreshLimiter,
  registerLimiter,
} from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import {
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  sellerSetupSchema,
  sendVerificationCodeSchema,
  verifyEmailCodeSchema,
} from '../validators/auth.validators';

const router = Router();

// Validation runs before the per-email limiters so keyGenerator sees a normalised address.
router.post('/register', authLimiter, registerLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), loginLimiter, login);
router.post('/google', authLimiter, validate({ body: googleAuthSchema }), googleAuth);
router.post('/guest', guestLimiter, optionalAuth, guest);
router.post('/refresh', refreshLimiter, refresh);
router.post('/logout', authLimiter, logout);
router.get('/me', authedReadLimiter, verifyJWT, me);
router.post('/seller-setup', authLimiter, verifyJWT, requireRegistered, validate({ body: sellerSetupSchema }), sellerSetup);

router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), passwordResetLimiter, forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), resetPassword);
router.post(
  '/send-verification-code',
  authLimiter,
  validate({ body: sendVerificationCodeSchema }),
  emailVerificationLimiter,
  sendVerificationCodeHandler,
);
router.post('/verify-email', emailOtpVerifyLimiter, validate({ body: verifyEmailCodeSchema }), verifyEmailCode);

export default router;
