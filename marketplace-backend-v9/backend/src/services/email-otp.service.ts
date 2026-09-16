import { EMAIL_OTP, ERROR_CODES } from '../constants';
import { EmailVerificationToken } from '../models/EmailVerificationToken';
import { User, type UserDocument } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { generateOtp, hashEmailOtp, safeEqual } from '../utils/crypto';
import { logger } from '../utils/logger';
import { sendVerificationCodeEmail } from './email.service';

/** True if a code was issued to this user less than COOLDOWN_MS ago. */
const isOnCooldown = async (userId: unknown): Promise<boolean> => {
  const latest = await EmailVerificationToken.findOne({ user: userId }).sort({ createdAt: -1 }).select('createdAt').lean();
  return !!latest && Date.now() - latest.createdAt.getTime() < EMAIL_OTP.COOLDOWN_MS;
};

export interface SendCodeOptions {
  /** Skip sending if a code went out < 60s ago (public resend, login-with-unverified). Register passes false. */
  respectCooldown?: boolean;
}

/**
 * Generates and emails a fresh 6-digit code for the given user, replacing any code already
 * outstanding. Resolves `true` if a new code was sent, `false` if skipped (cooldown) or the
 * relay rejected it (already logged by email.service).
 */
export const sendVerificationCode = async (user: UserDocument, { respectCooldown = false }: SendCodeOptions = {}): Promise<boolean> => {
  if (!user.email) return false;
  if (respectCooldown && (await isOnCooldown(user._id))) return false;

  const code = generateOtp();
  await EmailVerificationToken.deleteMany({ user: user._id });
  await EmailVerificationToken.create({
    user: user._id,
    hashedCode: hashEmailOtp(user.email, code),
    attempts: 0,
    expiresAt: new Date(Date.now() + EMAIL_OTP.TTL_MS),
  });

  const delivered = await sendVerificationCodeEmail(user.email, user.name, code);
  if (!delivered) logger.warn('Verification code stored but email not delivered', { userId: String(user._id) });
  return delivered;
};

export interface RequestEmailCodeResult {
  expiresInMs: number;
  cooldownMs: number;
}

/**
 * Public, unauthenticated entry point. Always resolves with the same shape and never reveals
 * whether the email exists, is already verified, or is on cooldown; callers must surface one
 * generic message regardless (same treatment as forgotPassword) to avoid account enumeration.
 */
export const requestEmailVerificationCode = async (email: string): Promise<RequestEmailCodeResult> => {
  const user = await User.findOne({ email });
  if (user && !user.isEmailVerified) await sendVerificationCode(user, { respectCooldown: true });
  return { expiresInMs: EMAIL_OTP.TTL_MS, cooldownMs: EMAIL_OTP.COOLDOWN_MS };
};

/**
 * Verifies a code and flips isEmailVerified on success. Messages mirror otp.service.verifyOtp.
 */
export const verifyEmailVerificationCode = async (email: string, code: string): Promise<void> => {
  const user = await User.findOne({ email });
  if (!user || user.isEmailVerified) {
    throw ApiError.badRequest('Code expired or not found. Please request a new one.', undefined, ERROR_CODES.OTP_EXPIRED);
  }

  const record = await EmailVerificationToken.findOne({ user: user._id, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!record) throw ApiError.badRequest('Code expired or not found. Please request a new one.', undefined, ERROR_CODES.OTP_EXPIRED);

  if (record.attempts >= EMAIL_OTP.MAX_ATTEMPTS) {
    await record.deleteOne();
    throw ApiError.tooMany('Too many incorrect attempts. Please request a new code.', ERROR_CODES.OTP_TOO_MANY_ATTEMPTS);
  }

  if (!safeEqual(record.hashedCode, hashEmailOtp(email, code))) {
    // Atomic increment so concurrent guesses can't bypass the cap.
    const updated = await EmailVerificationToken.findOneAndUpdate({ _id: record._id }, { $inc: { attempts: 1 } }, { new: true });
    const attempts = updated?.attempts ?? EMAIL_OTP.MAX_ATTEMPTS;
    const remaining = Math.max(EMAIL_OTP.MAX_ATTEMPTS - attempts, 0);
    if (remaining === 0) {
      await EmailVerificationToken.deleteOne({ _id: record._id });
      throw ApiError.tooMany('Too many incorrect attempts. Please request a new code.', ERROR_CODES.OTP_TOO_MANY_ATTEMPTS);
    }
    throw ApiError.badRequest(
      `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      undefined,
      ERROR_CODES.OTP_INVALID,
    );
  }

  await User.updateOne({ _id: user._id }, { $set: { isEmailVerified: true, emailVerifiedAt: new Date() } });
  await EmailVerificationToken.deleteMany({ user: user._id });
};
