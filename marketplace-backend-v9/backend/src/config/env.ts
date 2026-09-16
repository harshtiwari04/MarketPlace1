// import 'dotenv/config';
// import { z } from 'zod';

// const PLACEHOLDER_HINTS = ['replace-with', 'your-', 'changeme', 'example', 'xxxx'];
// const looksLikePlaceholder = (v: string) => PLACEHOLDER_HINTS.some((h) => v.toLowerCase().includes(h));

// /** "true"/"1"/"yes" → true, "false"/"0"/"no" → false; anything else falls through to Zod. */
// const boolFromString = z.preprocess((v) => {
//   if (typeof v !== 'string') return v;
//   const s = v.trim().toLowerCase();
//   if (['true', '1', 'yes'].includes(s)) return true;
//   if (['false', '0', 'no'].includes(s)) return false;
//   return v;
// }, z.boolean());

// const envSchema = z
//   .object({
//     NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
//     PORT: z.coerce.number().int().positive().default(5000),
//     /** Comma-separated list of browser origins allowed to call the API with cookies. Exact match. */
//     CLIENT_URL: z.string().min(1).default('http://localhost:5173'),
//     /**
//      * Number of reverse-proxy hops in front of the app that are trusted to set X-Forwarded-*.
//      * Render (API service only) = 1. Render static-site rewrite → API = 2. Cloudflare in front = +1.
//      * Too low → every user shares one IP for rate limiting. Too high → clients can spoof their IP.
//      */
//     TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),

//     // ── Database ─────────────────────────────────────────────────────────
//     MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
//     MONGO_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(500).default(50),
//     MONGO_MIN_POOL_SIZE: z.coerce.number().int().min(0).max(100).default(5),

//     // ── Auth / crypto ────────────────────────────────────────────────────
//     JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
//     JWT_EXPIRES_IN: z.string().default('15m'),
//     /** Access-cookie lifetime in minutes. Keep equal to JWT_EXPIRES_IN so the cookie never outlives the token. */
//     ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
//     REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
//     COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
//     OTP_HASH_SECRET: z.string().min(32, 'OTP_HASH_SECRET must be at least 32 characters'),
//     /**
//      * SameSite policy for auth cookies. 'none' (default in production) is required when the SPA and
//      * API are on different sites — e.g. two *.onrender.com subdomains, which are cross-site because
//      * onrender.com is on the Public Suffix List. Use 'lax' when the SPA proxies /api to the backend
//      * so everything is one origin (recommended — see docs/DEPLOYMENT.md).
//      */
//     COOKIE_SAME_SITE: z.enum(['none', 'lax', 'strict']).optional(),
//     /** Optional cookie Domain attribute. Leave unset unless API and SPA share a registrable domain you own. */
//     COOKIE_DOMAIN: z.string().min(1).optional(),

//     GOOGLE_CLIENT_ID: z.string().min(1),
//     /**
//      * Comma-separated emails that are promoted to `admin` on their next successful sign-in.
//      * Bootstrap mechanism for the first admin; afterwards manage roles from the admin panel or
//      * `npm run make-admin -- someone@example.com`.
//      */
//     ADMIN_EMAILS: z.string().default(''),

//     // ── Razorpay ─────────────────────────────────────────────────────────
//     RAZORPAY_KEY_ID: z.string().min(1),
//     RAZORPAY_KEY_SECRET: z.string().min(1),
//     RAZORPAY_WEBHOOK_SECRET: z.string().min(1),

//     // ── WhatsApp Cloud API (Meta Graph API) — the only OTP channel ───────
//     WHATSAPP_TOKEN: z.string().min(1),
//     WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
//     WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'e.g. v20.0').default('v20.0'),
//     WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
//     WHATSAPP_OTP_TEMPLATE: z.string().default('otp_verification'),
//     WHATSAPP_ORDER_TEMPLATE: z.string().default('order_confirmation'),
//     WHATSAPP_STATUS_TEMPLATE: z.string().default('order_status_update'),

//     // ── Cloudinary ───────────────────────────────────────────────────────
//     CLOUDINARY_CLOUD_NAME: z.string().min(1),
//     CLOUDINARY_API_KEY: z.string().min(1),
//     CLOUDINARY_API_SECRET: z.string().min(1),
//     CLOUDINARY_FOLDER: z.string().default('marketplace/products'),

//     // ── Email (Nodemailer over SMTP) ─────────────────────────────────────
//     // Any standards-compliant SMTP relay works (Gmail/Workspace app password, Zoho, Brevo, SES SMTP…).
//     // SMTP_USER / SMTP_PASS are optional in development/test (emails are logged, not sent) and
//     // required in production — see superRefine below.
//     SMTP_HOST: z.string().min(1).default('smtp.gmail.com'),
//     SMTP_PORT: z.coerce.number().int().positive().default(465),
//     /** true → implicit TLS (port 465). false → STARTTLS upgrade (port 587). Defaults from the port. */
//     SMTP_SECURE: boolFromString.optional(),
//     SMTP_USER: z.string().min(1).optional(),
//     SMTP_PASS: z.string().min(1).optional(),
//     /** "Display Name <address>" — the address must be one the SMTP account may send as. */
//     EMAIL_FROM: z.string().min(3).optional(),

//     // Sentry/error-monitoring DSN — optional.
//     SENTRY_DSN: z.string().optional(),
//   })
//   .superRefine((d, ctx) => {
//     const prod = d.NODE_ENV === 'production';

//     if ((d.SMTP_USER && !d.SMTP_PASS) || (!d.SMTP_USER && d.SMTP_PASS)) {
//       ctx.addIssue({ code: 'custom', path: ['SMTP_PASS'], message: 'SMTP_USER and SMTP_PASS must be set together' });
//     }
//     if (prod && (!d.SMTP_USER || !d.SMTP_PASS)) {
//       ctx.addIssue({
//         code: 'custom',
//         path: ['SMTP_USER'],
//         message: 'SMTP_USER and SMTP_PASS are required in production — email verification depends on them',
//       });
//     }
//     if (d.COOKIE_SAME_SITE === 'none' && !prod) {
//       // Browsers drop SameSite=None cookies without Secure, and Secure cookies are never set over
//       // plain http://localhost — fail loudly instead of debugging phantom 401s.
//       ctx.addIssue({ code: 'custom', path: ['COOKIE_SAME_SITE'], message: "'none' only works over HTTPS; use 'lax' locally" });
//     }
//     if (prod) {
//       for (const origin of d.CLIENT_URL.split(',').map((o) => o.trim()).filter(Boolean)) {
//         if (!/^https:\/\//.test(origin)) {
//           ctx.addIssue({ code: 'custom', path: ['CLIENT_URL'], message: `"${origin}" must be https in production` });
//         }
//       }
//       for (const key of ['JWT_SECRET', 'COOKIE_SECRET', 'OTP_HASH_SECRET'] as const) {
//         if (looksLikePlaceholder(d[key])) {
//           ctx.addIssue({ code: 'custom', path: [key], message: 'looks like a placeholder — generate with `openssl rand -hex 32`' });
//         }
//       }
//     }
//   });

// const parsed = envSchema.safeParse(process.env);

// if (!parsed.success) {
//   // Fail fast: a misconfigured server must not start.
//   console.error('❌ Invalid environment configuration:');
//   for (const issue of parsed.error.issues) {
//     console.error(`  • ${issue.path.join('.') || '(root)'}: ${issue.message}`);
//   }
//   process.exit(1);
// }

// const d = parsed.data;

// export const env = {
//   ...d,
//   COOKIE_SAME_SITE: (d.COOKIE_SAME_SITE ?? (d.NODE_ENV === 'production' ? 'none' : 'lax')) as 'none' | 'lax' | 'strict',
//   SMTP_SECURE: d.SMTP_SECURE ?? d.SMTP_PORT === 465,
//   EMAIL_FROM: d.EMAIL_FROM ?? (d.SMTP_USER ? `Marketplace <${d.SMTP_USER}>` : 'Marketplace <no-reply@localhost>'),
//   /** True when SMTP credentials are present; otherwise emails are logged (dev/test only). */
//   EMAIL_ENABLED: Boolean(d.SMTP_USER && d.SMTP_PASS),
// };

// export type Env = typeof env;
// export const isProd = env.NODE_ENV === 'production';
// export const isTest = env.NODE_ENV === 'test';
// export const adminEmails = new Set(
//   env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
// );
// export const allowedOrigins = env.CLIENT_URL.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
import 'dotenv/config';
import { z } from 'zod';

const PLACEHOLDER_HINTS = ['replace-with', 'your-', 'changeme', 'example', 'xxxx'];
const looksLikePlaceholder = (v: string) => PLACEHOLDER_HINTS.some((h) => v.toLowerCase().includes(h));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    /** Comma-separated list of browser origins allowed to call the API with cookies. Exact match. */
    CLIENT_URL: z.string().min(1).default('http://localhost:5173'),
    /**
     * Number of reverse-proxy hops in front of the app that are trusted to set X-Forwarded-*.
     * Render (API service only) = 1. Render static-site rewrite → API = 2. Cloudflare in front = +1.
     * Too low → every user shares one IP for rate limiting. Too high → clients can spoof their IP.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),

    // ── Database ─────────────────────────────────────────────────────────
    MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
    MONGO_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    MONGO_MIN_POOL_SIZE: z.coerce.number().int().min(0).max(100).default(5),

    // ── Auth / crypto ────────────────────────────────────────────────────
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    /** Access-cookie lifetime in minutes. Keep equal to JWT_EXPIRES_IN so the cookie never outlives the token. */
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
    OTP_HASH_SECRET: z.string().min(32, 'OTP_HASH_SECRET must be at least 32 characters'),
    /**
     * SameSite policy for auth cookies. 'none' (default in production) is required when the SPA and
     * API are on different sites — e.g. two *.onrender.com subdomains, which are cross-site because
     * onrender.com is on the Public Suffix List. Use 'lax' when the SPA proxies /api to the backend
     * so everything is one origin (recommended — see docs/DEPLOYMENT.md).
     */
    COOKIE_SAME_SITE: z.enum(['none', 'lax', 'strict']).optional(),
    /** Optional cookie Domain attribute. Leave unset unless API and SPA share a registrable domain you own. */
    COOKIE_DOMAIN: z.string().min(1).optional(),

    GOOGLE_CLIENT_ID: z.string().min(1),
    /**
     * Comma-separated emails that are promoted to `admin` on their next successful sign-in.
     * Bootstrap mechanism for the first admin; afterwards manage roles from the admin panel or
     * `npm run make-admin -- someone@example.com`.
     */
    ADMIN_EMAILS: z.string().default(''),

    // ── Razorpay ─────────────────────────────────────────────────────────
    RAZORPAY_KEY_ID: z.string().min(1),
    RAZORPAY_KEY_SECRET: z.string().min(1),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1),

    // ── WhatsApp Cloud API (Meta Graph API) — the only OTP channel ───────
    WHATSAPP_TOKEN: z.string().min(1),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
    WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'e.g. v20.0').default('v20.0'),
    WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
    WHATSAPP_OTP_TEMPLATE: z.string().default('otp_verification'),
    WHATSAPP_ORDER_TEMPLATE: z.string().default('order_confirmation'),
    WHATSAPP_STATUS_TEMPLATE: z.string().default('order_status_update'),

    // ── Cloudinary ───────────────────────────────────────────────────────
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    CLOUDINARY_FOLDER: z.string().default('marketplace/products'),

    // ── Email (SendGrid) ─────────────────────────────────────────────────
    // SENDGRID_API_KEY is optional in development/test (emails are logged, not sent) and
    // required in production — see superRefine below.
    SENDGRID_API_KEY: z.string().min(1).optional(),
    /** "Display Name <address>" — the address must be a verified Sender Identity in SendGrid. */
    EMAIL_FROM: z.string().min(3).optional(),

    // Sentry/error-monitoring DSN — optional.
    SENTRY_DSN: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    const prod = d.NODE_ENV === 'production';

    if (prod && !d.SENDGRID_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['SENDGRID_API_KEY'],
        message: 'SENDGRID_API_KEY is required in production — email verification depends on it',
      });
    }
    if (d.COOKIE_SAME_SITE === 'none' && !prod) {
      // Browsers drop SameSite=None cookies without Secure, and Secure cookies are never set over
      // plain http://localhost — fail loudly instead of debugging phantom 401s.
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SAME_SITE'], message: "'none' only works over HTTPS; use 'lax' locally" });
    }
    if (prod) {
      for (const origin of d.CLIENT_URL.split(',').map((o) => o.trim()).filter(Boolean)) {
        if (!/^https:\/\//.test(origin)) {
          ctx.addIssue({ code: 'custom', path: ['CLIENT_URL'], message: `"${origin}" must be https in production` });
        }
      }
      for (const key of ['JWT_SECRET', 'COOKIE_SECRET', 'OTP_HASH_SECRET'] as const) {
        if (looksLikePlaceholder(d[key])) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'looks like a placeholder — generate with `openssl rand -hex 32`' });
        }
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast: a misconfigured server must not start.
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

const d = parsed.data;

export const env = {
  ...d,
  COOKIE_SAME_SITE: (d.COOKIE_SAME_SITE ?? (d.NODE_ENV === 'production' ? 'none' : 'lax')) as 'none' | 'lax' | 'strict',
  EMAIL_FROM: d.EMAIL_FROM ?? 'Marketplace <no-reply@localhost>',
  /** True when a SendGrid API key is present; otherwise emails are logged (dev/test only). */
  EMAIL_ENABLED: Boolean(d.SENDGRID_API_KEY),
};

export type Env = typeof env;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const adminEmails = new Set(
  env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
);
export const allowedOrigins = env.CLIENT_URL.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);