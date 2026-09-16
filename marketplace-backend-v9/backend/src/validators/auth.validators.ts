import { z } from 'zod';
import { phoneSchema } from './common';

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(128),
  phone: phoneSchema.optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(20),
});

export const sellerSetupSchema = z.object({
  storeName: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8).max(128),
});

export const sendVerificationCodeSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

export const verifyEmailCodeSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});
