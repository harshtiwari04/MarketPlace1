import { Router } from 'express';
import { sendWhatsappOtp, verifyWhatsappOtp } from '../controllers/otp.controller';
import { optionalAuth } from '../middlewares/auth';
import { otpSendLimiter, otpVerifyLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import { sendOtpSchema, verifyOtpSchema } from '../validators/otp.validators';

const router = Router();

router.post('/send-whatsapp', otpSendLimiter, validate({ body: sendOtpSchema }), sendWhatsappOtp);
router.post('/verify-whatsapp', otpVerifyLimiter, optionalAuth, validate({ body: verifyOtpSchema }), verifyWhatsappOtp);

export default router;
