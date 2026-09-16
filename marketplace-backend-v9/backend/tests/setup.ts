import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeEach } from 'vitest';

/**
 * These MUST be set before any test file imports anything that pulls in
 * src/config/env.ts (which validates process.env synchronously at import time
 * and calls process.exit(1) on failure). Vitest fully evaluates setupFiles —
 * including this top-level await — before it loads any test file, so this
 * ordering is guaranteed.
 */
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.JWT_SECRET = 'test-jwt-secret-value-at-least-32-chars-long';
process.env.JWT_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
process.env.COOKIE_SECRET = 'test-cookie-secret-value-at-least-32-chars';
process.env.OTP_HASH_SECRET = 'test-otp-hash-secret-value-at-least-32-chars';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy_key_id';
process.env.RAZORPAY_KEY_SECRET = 'dummy_razorpay_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'dummy_razorpay_webhook_secret';
process.env.WHATSAPP_TOKEN = 'dummy_whatsapp_token';
// No SMTP_USER/SMTP_PASS → email.service logs instead of sending; tests spy on the send functions.
process.env.WHATSAPP_PHONE_NUMBER_ID = '000000000000000';
process.env.CLOUDINARY_CLOUD_NAME = 'dummy-cloud';
process.env.CLOUDINARY_API_KEY = 'dummy-api-key';
process.env.CLOUDINARY_API_SECRET = 'dummy-api-secret';

/** Checkout uses multi-document transactions, which require a replica set — a standalone mongod won't do.
 *  Version pinned explicitly: the auto-detected "latest" build isn't always published for every
 *  platform (seen failing on Ubuntu 24.04 in CI), so pin to a version known to have a generic linux build. */
const replSet = await MongoMemoryReplSet.create({
  binary: { version: '7.0.14' },
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});
process.env.MONGO_URI = replSet.getUri('marketplace_test');

await mongoose.connect(process.env.MONGO_URI);

// Isolate every test: wipe all collections beforehand so ordering/leakage between test files
// (fileParallelism is disabled in vitest.config.ts specifically so this is safe) never matters.
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterEach(() => {
  // Placeholder for per-test teardown (e.g. resetting mocked service spies) as the suite grows.
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await replSet.stop();
});
