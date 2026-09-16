import express, { type Request } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import { allowedOrigins, env, isProd, isTest } from './config/env';
import { isDbReady } from './config/db';
import { ERROR_CODES, HEADERS, HTTP } from './constants';
import { errorHandler, notFoundHandler } from './middlewares/error';
import { globalLimiter } from './middlewares/rateLimit';
import apiRouter from './routes';
import sitemapRouter from './routes/sitemap.routes';
import { ApiError } from './utils/ApiError';

const app = express();

// Behind Render's TLS terminator (and optionally the static site's rewrite proxy). TRUST_PROXY
// must equal the number of hops or req.ip / req.secure / rate limiting are wrong. See env.ts.
app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');
app.set('etag', 'weak');

// ── Security headers ──────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // API is consumed cross-origin by the SPA
    // A JSON API serves no HTML; a restrictive CSP still helps if an error page is ever rendered.
    contentSecurityPolicy: isProd ? { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } : false,
    hsts: isProd ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  }),
);

// ── CORS with credentials (cookies) ───────────────────────────────────────
const originAllowed = new Set(allowedOrigins);
app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = same-origin navigation, server-to-server (Razorpay webhook), curl, health checks.
      if (!origin || originAllowed.has(origin)) return cb(null, true);
      // Surface as a clean 403 instead of an opaque 500 from the error handler.
      return cb(ApiError.forbidden(`Origin ${origin} is not allowed`, ERROR_CODES.CORS_ORIGIN_DENIED));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', HEADERS.PHONE_VERIFICATION],
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
  }),
);

// ── Parsing / logging / perf ──────────────────────────────────────────────
app.use(compression({ threshold: 1024 }));
if (!isTest) {
  app.use(
    morgan(isProd ? 'combined' : 'dev', {
      skip: (req) => req.path === '/health', // Render polls this every few seconds; keep logs readable
    }),
  );
}
app.use(
  express.json({
    limit: '200kb', // largest legitimate body is a 50-line cart; uploads are multipart and bypass this
    // Keep the raw bytes so the Razorpay webhook HMAC can be verified exactly.
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(cookieParser(env.COOKIE_SECRET));
app.use(mongoSanitize()); // strips $ and . from keys to block operator injection

// ── Rate limiting ─────────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Health: liveness + readiness in one. 503 tells Render/LB to stop routing here. ─────────
app.get('/health', (_req, res) => {
  const dbReady = isTest || isDbReady();
  res.status(dbReady ? HTTP.OK : HTTP.SERVICE_UNAVAILABLE).json({
    status: dbReady ? 'ok' : 'degraded',
    db: dbReady ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1', apiRouter);
app.use(sitemapRouter);

// ── Errors ────────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
