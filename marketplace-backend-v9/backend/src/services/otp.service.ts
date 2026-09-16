import { ERROR_CODES, HTTP, OTP } from '../constants';
import { OtpSession } from '../models/OtpSession';
import { ApiError } from '../utils/ApiError';
import { generateOtp, hashOtp, safeEqual } from '../utils/crypto';
import { signPhoneVerificationToken } from '../utils/token';
import { sendOtp } from './whatsapp.service';

export interface RequestOtpResult {
  expiresInMs: number;
  cooldownMs: number;
  /** Milliseconds until another code may be requested — mirrors cooldownMs at send time. */
  retryAfterMs: number;
}

export const requestOtp = async (phone: string): Promise<RequestOtpResult> => {
  const latest = await OtpSession.findOne({ phone }).sort({ createdAt: -1 }).select('createdAt').lean();
  if (latest) {
    const elapsed = Date.now() - latest.createdAt.getTime();
    if (elapsed < OTP.COOLDOWN_MS) {
      const waitMs = OTP.COOLDOWN_MS - elapsed;
      // retryAfterMs is surfaced in `details` (and as a Retry-After header) so the SPA can start an exact countdown.
      throw new ApiError(
        HTTP.TOO_MANY_REQUESTS,
        `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code`,
        { retryAfterMs: waitMs },
        ERROR_CODES.OTP_COOLDOWN,
      );
    }
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP.TTL_MS);

  // One live session per phone — invalidates any previous code.
  await OtpSession.deleteMany({ phone });
  const session = await OtpSession.create({ phone, hashedOtp: hashOtp(phone, code), attempts: 0, expiresAt });

  try {
    await sendOtp(phone, code); // real WhatsApp delivery — throws 502 if Meta rejects it
  } catch (err) {
    // Don't leave a session behind that the user never received (and don't start their cooldown).
    await OtpSession.deleteOne({ _id: session._id });
    throw err;
  }

  return { expiresInMs: OTP.TTL_MS, cooldownMs: OTP.COOLDOWN_MS, retryAfterMs: OTP.COOLDOWN_MS };
};

export interface VerifyOtpResult {
  phoneVerificationToken: string;
  expiresIn: string;
}

export const verifyOtp = async (phone: string, code: string): Promise<VerifyOtpResult> => {
  const session = await OtpSession.findOne({ phone, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!session) throw ApiError.badRequest('Code expired or not found. Please request a new one.', undefined, ERROR_CODES.OTP_EXPIRED);

  if (session.attempts >= OTP.MAX_ATTEMPTS) {
    await session.deleteOne();
    throw ApiError.tooMany('Too many incorrect attempts. Please request a new code.', ERROR_CODES.OTP_TOO_MANY_ATTEMPTS);
  }

  if (!safeEqual(session.hashedOtp, hashOtp(phone, code))) {
    // Atomic increment so concurrent guesses can't bypass the cap.
    const updated = await OtpSession.findOneAndUpdate({ _id: session._id }, { $inc: { attempts: 1 } }, { new: true });
    const attempts = updated?.attempts ?? OTP.MAX_ATTEMPTS;
    const remaining = Math.max(OTP.MAX_ATTEMPTS - attempts, 0);
    if (remaining === 0) {
      await OtpSession.deleteOne({ _id: session._id });
      throw ApiError.tooMany('Too many incorrect attempts. Please request a new code.', ERROR_CODES.OTP_TOO_MANY_ATTEMPTS);
    }
    throw ApiError.badRequest(`Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`, undefined, ERROR_CODES.OTP_INVALID);
  }

  await session.deleteOne();
  return { phoneVerificationToken: signPhoneVerificationToken(phone), expiresIn: OTP.VERIFICATION_TOKEN_TTL };
};
