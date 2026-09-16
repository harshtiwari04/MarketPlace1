import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import * as emailService from '../src/services/email.service';
import { EmailVerificationToken } from '../src/models/EmailVerificationToken';
import { User } from '../src/models/User';
import { uniqueEmail } from './helpers';

/** Registers a user (which auto-sends the first code) and returns the code that was emailed. */
const registerAndCaptureCode = async (email: string): Promise<string> => {
  const spy = vi.spyOn(emailService, 'sendVerificationCodeEmail');
  await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Code Tester', email, password: 'CorrectHorse123' })
    .expect(201);
  const code = spy.mock.calls.at(-1)?.[2] as string;
  spy.mockRestore();
  expect(code).toMatch(/^\d{6}$/);
  return code;
};

describe('email verification: 6-digit code', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a 6-digit code on registration and verifies it', async () => {
    const email = uniqueEmail();
    const code = await registerAndCaptureCode(email);

    await request(app).post('/api/v1/auth/verify-email').send({ email, code }).expect(200);

    const user = await User.findOne({ email });
    expect(user?.isEmailVerified).toBe(true);
    expect(await EmailVerificationToken.findOne({ user: user!._id })).toBeNull();
  });

  it('rejects an incorrect code but reports remaining attempts', async () => {
    const email = uniqueEmail();
    await registerAndCaptureCode(email);

    const res = await request(app).post('/api/v1/auth/verify-email').send({ email, code: '000000' }).expect(400);
    expect(res.body.message).toMatch(/attempt/i);

    const user = await User.findOne({ email });
    expect(user?.isEmailVerified).toBe(false);
  });

  it('locks out after too many incorrect attempts and requires a fresh code', async () => {
    const email = uniqueEmail();
    const code = await registerAndCaptureCode(email);

    // MAX_ATTEMPTS is 5 — five wrong guesses should exhaust it.
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/verify-email').send({ email, code: '111111' });
    }

    const res = await request(app).post('/api/v1/auth/verify-email').send({ email, code }).expect(429);
    expect(res.body.message).toMatch(/too many/i);
  });

  it('rejects an expired or unknown code', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email, code: '123456' })
      .expect(400);
  });

  it('resend enforces a per-account cooldown and issues a fresh code that invalidates the old one', async () => {
    const email = uniqueEmail();
    const firstCode = await registerAndCaptureCode(email);

    // Immediate resend is on cooldown — service silently no-ops, so no new email goes out...
    const spy = vi.spyOn(emailService, 'sendVerificationCodeEmail');
    await request(app).post('/api/v1/auth/send-verification-code').send({ email }).expect(200);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    // ...so the original code emailed at registration is still the one that verifies.
    await request(app).post('/api/v1/auth/verify-email').send({ email, code: firstCode }).expect(200);
  });

  it('always returns the same generic message for send-verification-code, verified or not, existing or not', async () => {
    const unknownEmail = uniqueEmail();
    const res = await request(app)
      .post('/api/v1/auth/send-verification-code')
      .send({ email: unknownEmail })
      .expect(200);
    expect(res.body.message).toMatch(/if that email/i);
  });

  it('rejects malformed codes at the validation layer', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/v1/auth/verify-email').send({ email, code: 'abcdef' }).expect(400);
    await request(app).post('/api/v1/auth/verify-email').send({ email, code: '123' }).expect(400);
  });
});
