export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Marketplace';
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || '';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const CURRENCY = 'INR';

// Values shown in the flowchart as examples (unit=pcs, category=electronics).
// Extend freely; the form also accepts custom values.
// Must match the backend UNITS enum exactly (src/constants/index.ts) or product creation fails validation.
export const UNITS = ['pcs', 'kg', 'g', 'pack', 'liter'];
export const CATEGORIES = ['electronics', 'grocery', 'home', 'fashion', 'beauty', 'sports', 'books', 'other'];

export const IMAGE_MAX_FILES = 6;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const OTP_LENGTH = 6;

/**
 * Fail loudly in development when a required VITE_ variable is missing. Every one of these
 * otherwise fails silently at runtime (Google button hidden, Razorpay refuses to open, API 404s).
 */
if (import.meta.env.DEV) {
  const missing = [
    ['VITE_GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID, 'Google sign-in button will not render'],
    ['VITE_RAZORPAY_KEY_ID', RAZORPAY_KEY_ID, 'payment step will fail unless the backend returns keyId'],
  ].filter(([, v]) => !v);
  if (missing.length) {
    console.warn(
      `[config] Missing in .env:\n${missing.map(([k, , why]) => `  ${k} — ${why}`).join('\n')}\nCopy .env.example to .env and fill these in, then restart \`npm run dev\`.`,
    );
  }
}
