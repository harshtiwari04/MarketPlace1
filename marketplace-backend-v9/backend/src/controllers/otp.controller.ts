import { User } from '../models/User';
import { requestOtp, verifyOtp } from '../services/otp.service';
import { sendResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type { z } from 'zod';
import type { sendOtpSchema, verifyOtpSchema } from '../validators/otp.validators';

export const sendWhatsappOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body as z.infer<typeof sendOtpSchema>;
  const result = await requestOtp(phone);
  sendResponse(res, result, 'Verification code sent via WhatsApp');
});

export const verifyWhatsappOtp = asyncHandler(async (req, res) => {
  const { phone, code } = req.body as z.infer<typeof verifyOtpSchema>;
  const result = await verifyOtp(phone, code);

  // If a registered user is logged in, persist the verified number on their profile.
  if (req.user && !req.user.isGuest) {
    await User.updateOne({ _id: req.user.id }, { $set: { phone, isPhoneVerified: true } });
  }

  sendResponse(res, result, 'Phone number verified');
});
